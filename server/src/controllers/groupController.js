import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { io, removeUsersFromGroupCall } from '../socket/socket.js';
import { formatConversation, populateConversation, isGroupLeader, isGroupAdmin, userIdOf } from '../utils/conversationHelper.js';

const fail = (res, error) => {
    console.error('Group operation failed', error);
    return res.status(500).json({ message: 'Không thể thực hiện thao tác nhóm' });
};

const requireLeader = (req, res) => {
    if (!isGroupLeader(req.conversation, req.user._id)) {
        res.status(403).json({ message: 'Chỉ trưởng nhóm có thể quản lý nhóm' });
        return false;
    }
    return true;
};

const broadcast = async (conversation) => {
    await populateConversation(conversation);
    const formatted = formatConversation(conversation);
    conversation.participants.forEach(p => io.to(userIdOf(p.userId)).emit('conversationUpdated', formatted));
    return formatted;
};

export const updateGroup = async (req, res) => {
    if (!requireLeader(req, res)) return;
    const { name, descriptionGroup } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
        typeof descriptionGroup !== 'string' || descriptionGroup.trim().length > 1000) {
        return res.status(400).json({ message: 'Tên nhóm cần 1–100 ký tự, mô tả tối đa 1000 ký tự' });
    }
    try {
        const conversation = await Conversation.findOneAndUpdate({
            _id: req.conversation._id, 'group.createdBy': req.user._id,
        }, { $set: { 'group.name': name.trim(), 'group.descriptionGroup': descriptionGroup.trim() } }, { new: true });
        if (!conversation) return res.status(404).json({ message: 'Nhóm không tồn tại' });
        return res.json({ conversation: await broadcast(conversation) });
    } catch (error) { return fail(res, error); }
};

export const removeGroupMember = async (req, res) => {
    if (!isGroupAdmin(req.conversation, req.user._id)) {
        return res.status(403).json({ message: 'Chỉ trưởng nhóm hoặc quản trị viên có thể xóa thành viên' });
    }
    if (!mongoose.isObjectIdOrHexString(req.params.memberId)) return res.status(400).json({ message: 'ID thành viên không hợp lệ' });
    const memberId = new mongoose.Types.ObjectId(req.params.memberId).toString();
    if (memberId === userIdOf(req.user._id)) return res.status(400).json({ message: 'Trưởng nhóm không thể tự xóa mình' });
    if (memberId === userIdOf(req.conversation.group?.createdBy)) return res.status(403).json({ message: 'Không thể xóa trưởng nhóm' });
    const leader = isGroupLeader(req.conversation, req.user._id);
    const target = req.conversation.participants.find(p => userIdOf(p.userId) === memberId);
    if (!leader && target?.role === 'admin') return res.status(403).json({ message: 'Chỉ trưởng nhóm có thể xóa quản trị viên' });
    try {
        const authority = leader ? { 'group.createdBy': req.user._id } : {
            'group.createdBy': { $ne: memberId },
            $and: [
                { participants: { $elemMatch: { userId: req.user._id, role: 'admin' } } },
                { participants: { $elemMatch: { userId: memberId, role: { $nin: ['admin', 'leader'] } } } },
            ],
        };
        const conversation = await Conversation.findOneAndUpdate({
            _id: req.conversation._id, ...authority, 'participants.userId': memberId,
        }, {
            $pull: { participants: { userId: memberId }, seenBy: memberId },
            $unset: { [`unreadCounts.${memberId}`]: '' },
        }, { new: true });
        if (!conversation) return res.status(404).json({ message: 'Nhóm hoặc thành viên không tồn tại' });
        const conversationId = userIdOf(conversation._id);
        io.to(memberId).emit('conversationRemoved', { conversationId, reason: 'removed' });
        await removeUsersFromGroupCall(conversationId, [memberId]);
        return res.json({ conversation: await broadcast(conversation) });
    } catch (error) { return fail(res, error); }
};

export const deleteGroup = async (req, res) => {
    if (!requireLeader(req, res)) return;
    try {
        const conversation = await Conversation.findOneAndDelete({ _id: req.conversation._id, 'group.createdBy': req.user._id });
        if (!conversation) return res.status(404).json({ message: 'Nhóm không tồn tại' });
        const conversationId = userIdOf(conversation._id);
        const ids = conversation.participants.map(p => userIdOf(p.userId));
        ids.forEach(id => {
            io.to(id).emit('conversationRemoved', { conversationId, reason: 'deleted' });
            io.to(id).emit('groupDisbanded', { conversationId, groupName: conversation.group?.name });
        });
        await removeUsersFromGroupCall(conversationId, ids);
        await Message.deleteMany({ conversationId });
        return res.json({ conversationId, message: 'Đã xóa nhóm' });
    } catch (error) { return fail(res, error); }
};

export const getGroupInvite = async (req, res) => {
    if (!req.conversation.isGroup) return res.status(400).json({ message: 'Đây không phải nhóm' });
    try {
        // Atomic initialization preserves the same URL across concurrent requests.
        await Conversation.updateOne({ _id: req.conversation._id, 'group.inviteToken': { $exists: false } },
            { $set: { 'group.inviteToken': randomBytes(32).toString('hex') } });
        const conversation = await Conversation.findById(req.conversation._id).select('+group.inviteToken');
        if (!conversation) return res.status(404).json({ message: 'Nhóm không tồn tại' });
        return res.json({ token: conversation.group.inviteToken, inviteCode: conversation.group.inviteToken,
            conversationId: conversation._id, name: conversation.group.name,
            avatarURL: conversation.group.avatarURL, participantsCount: conversation.participants.length });
    } catch (error) { return fail(res, error); }
};

export const rotateGroupInvite = async (req, res) => {
    if (!requireLeader(req, res)) return;
    try {
        const token = randomBytes(32).toString('hex');
        const conversation = await Conversation.findOneAndUpdate({ _id: req.conversation._id, 'group.createdBy': req.user._id },
            { $set: { 'group.inviteToken': token }, $unset: { 'group.inviteCode': '' } }, { new: true });
        if (!conversation) return res.status(404).json({ message: 'Nhóm không tồn tại' });
        conversation.participants.forEach(p => io.to(userIdOf(p.userId)).emit('groupInviteChanged', { conversationId: userIdOf(conversation._id) }));
        return res.json({ token, inviteCode: token });
    } catch (error) { return fail(res, error); }
};

const validToken = (req, res) => {
    const token = req.params.token || req.params.inviteCode;
    if (typeof token !== 'string' || !/^(?:[a-f0-9]{64}|[a-f0-9]{24})$/.test(token)) {
        res.status(404).json({ message: 'Liên kết mời không hợp lệ hoặc đã bị thu hồi' });
        return false;
    }
    req.inviteToken = token;
    return true;
};

const inviteFilter = (token) => ({ isGroup: true,
    // Legacy codes remain usable until the leader rotates the invitation.
    $or: [{ 'group.inviteToken': token }, { 'group.inviteCode': token }],
});

export const previewGroupInvite = async (req, res) => {
    if (!validToken(req, res)) return;
    try {
        const conversation = await Conversation.findOne(inviteFilter(req.inviteToken));
        if (!conversation) return res.status(404).json({ message: 'Liên kết mời không hợp lệ hoặc đã bị thu hồi' });
        return res.json({ group: {
            _id: conversation._id, name: conversation.group.name,
            descriptionGroup: conversation.group.descriptionGroup || '',
            avatarURL: conversation.group.avatarURL,
            memberCount: conversation.participants.length,
            isMember: conversation.participants.some(p => userIdOf(p.userId) === userIdOf(req.user._id)),
        } });
    } catch (error) { return fail(res, error); }
};

export const joinGroupInvite = async (req, res) => {
    if (!validToken(req, res)) return;
    try {
        const filter = inviteFilter(req.inviteToken);
        // Query + push in one atomic write makes repeated joins idempotent.
        let conversation = await Conversation.findOneAndUpdate({ ...filter, 'participants.userId': { $ne: req.user._id } },
            { $push: { participants: { userId: req.user._id, role: 'member', joinAt: new Date() } } }, { new: true });
        const joined = !!conversation;
        if (!conversation) conversation = await Conversation.findOne(filter);
        if (!conversation) return res.status(404).json({ message: 'Liên kết mời không hợp lệ hoặc đã bị thu hồi' });
        const formatted = joined ? await broadcast(conversation) : formatConversation(await populateConversation(conversation));
        return res.status(joined ? 201 : 200).json({ conversation: formatted });
    } catch (error) { return fail(res, error); }
};
