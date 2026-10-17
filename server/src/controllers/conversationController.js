import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Friend from '../models/Friend.js';
import User from '../models/User.js';
import { io, removeUsersFromGroupCall } from '../socket/socket.js';
import { formatConversation, isGroupLeader, isGroupAdmin, userIdOf } from '../utils/conversationHelper.js';

export const createConversation = async (req, res) => {
    try {
        const { isGroup, name, memberIds, recipientId } = req.body;
        const userId = req.user._id;

        if (isGroup) {
            if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
                return res.status(400).json({ message: "Tên nhóm cần 1–100 ký tự" });
            }

            const cleanMemberIds = Array.from(
                new Set((memberIds || []).map(id => (id?._id || id)?.toString()).filter(id => id && id !== userId.toString()))
            );

            if (cleanMemberIds.length < 2) {
                return res.status(400).json({ message: "Nhóm cần tối thiểu 2 thành viên khác bạn" });
            }

            const conversation = new Conversation({
                isGroup: true,
                participants: [
                    { userId, role: 'leader', joinAt: new Date() },
                    ...cleanMemberIds.map(id => ({ userId: id, role: 'member', joinAt: new Date() })),
                ],
                group: {
                    name: name.trim(),
                    createdBy: userId,
                    inviteCode: new mongoose.Types.ObjectId().toString(),
                },
                lastMessageAt: new Date(),
                unreadCounts: new Map()
            });
            await conversation.save();

            await conversation.populate([
                { path: "participants.userId", select: "displayName avatarURL username" },
                { path: 'seenBy', select: 'displayName avatarURL username' },
                { path: "lastMessage.senderId", select: "displayName avatarURL username" }
            ]);

            const formatted = formatConversation(conversation);

            // Realtime socket emit to all participants
            try {
                const allParticipantIds = [userId.toString(), ...cleanMemberIds];
                allParticipantIds.forEach(uid => {
                    io.to(uid).emit("newConversation", formatted);
                });
            } catch (socketErr) {
                console.error("Error emitting newConversation:", socketErr);
            }

            return res.status(201).json({ conversation: formatted });
        }

        // Direct 1-on-1 Conversation
        const targetUserId = recipientId || (memberIds && memberIds.length > 0 ? (memberIds[0]?._id || memberIds[0])?.toString() : null);
        if (!targetUserId) {
            return res.status(400).json({ message: "Thiếu ID người nhận" });
        }

        let conversation = await Conversation.findOne({
            isGroup: false,
            "participants.userId": { $all: [userId, targetUserId] },
        });

        let isNew = false;
        if (!conversation) {
            conversation = new Conversation({
                isGroup: false,
                participants: [
                    { userId, joinAt: new Date() },
                    { userId: targetUserId, joinAt: new Date() }
                ],
                lastMessageAt: new Date(),
                unreadCounts: new Map()
            });
            await conversation.save();
            isNew = true;
        }

        await conversation.populate([
            { path: "participants.userId", select: "displayName avatarURL username" },
            { path: 'seenBy', select: 'displayName avatarURL username' },
            { path: "lastMessage.senderId", select: "displayName avatarURL username" }
        ]);

        const participants = (conversation.participants || []).map((p) => ({
            _id: p.userId?._id || p.userId,
            displayName: p.userId?.displayName,
            avatarURL: p.userId?.avatarURL ?? null,
            username: p.userId?.username ?? null,
            joinedAt: p.joinedAt,
        }));

        const formatted = {
            ...conversation.toObject(),
            unreadCounts: conversation.unreadCounts || {},
            participants,
        };

        if (isNew) {
            try {
                io.to(targetUserId.toString()).emit("newConversation", formatted);
            } catch (socketErr) {
                console.error("Error emitting newConversation:", socketErr);
            }
        }

        return res.status(isNew ? 201 : 200).json({ conversation: formatted });
    } catch (error) {
        console.error("Error creating conversation", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const getConversation = async (req, res) => {
    try {
        const userId = req.user._id;

        // Auto-ensure 1-on-1 conversations exist for all existing friends in DB
        try {
            const friendships = await Friend.find({
                $or: [{ userA: userId }, { userB: userId }]
            });

            const friendUserIds = friendships.map(f =>
                f.userA.toString() === userId.toString() ? f.userB : f.userA
            );

            if (friendUserIds.length > 0) {
                const existingConvos = await Conversation.find({
                    isGroup: false,
                    "participants.userId": userId
                });

                const existingPartnerIds = new Set();
                existingConvos.forEach(c => {
                    c.participants.forEach(p => {
                        const pId = p.userId?._id || p.userId;
                        if (pId && pId.toString() !== userId.toString()) {
                            existingPartnerIds.add(pId.toString());
                        }
                    });
                });

                const missingFriendIds = friendUserIds.filter(fId => fId && !existingPartnerIds.has(fId.toString()));
                if (missingFriendIds.length > 0) {
                    const newConvos = missingFriendIds.map(fId => ({
                        isGroup: false,
                        participants: [
                            { userId, joinAt: new Date() },
                            { userId: fId, joinAt: new Date() }
                        ],
                        lastMessageAt: new Date(0),
                        unreadCounts: new Map()
                    }));
                    await Conversation.insertMany(newConvos);
                }
            }
        } catch (syncErr) {
            console.error("Error auto-syncing friend conversations:", syncErr);
        }

        const conversations = await Conversation.find({
            'participants.userId': userId,
        })
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .populate({
                path: "participants.userId",
                select: "displayName avatarURL username"
            }).populate({
                path: "lastMessage.senderId",
                select: "displayName avatarURL username"
            }).populate({
                path: "seenBy",
                select: "displayName avatarURL username"
            });

        const formatted = conversations.map(formatConversation);
        return res.status(200).json({ conversations: formatted });
    } catch (err) {
        console.error("Error getting conversation", err);
        return res.status(500).json({ message: "System error" });
    }
};


export const getMessage = async (req, res) => {
    try {
        const {conversationId} = req.params;
        const {limit = 20, cursor} = req.query;
        const userId = req.user._id;
        const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

        const query = {
            conversationId,
            deletedForUsers: { $ne: userId }
        };

        if(cursor){
            query.createdAt = {$lt: new Date(cursor)};
        }

        let messages = await Message.find(query)
            .sort({createdAt: -1, _id: -1 })
            .limit(parsedLimit + 1)
            .populate('poll.options.votes', 'username displayName avatarURL');

        let nextCursor = null;
        if(messages.length > parsedLimit){
            messages.pop();
            const oldestInBatch = messages[messages.length - 1];
            nextCursor = oldestInBatch ? oldestInBatch.createdAt.toISOString() : null;
        }
        messages = messages.reverse();
        return res.status(200).json({messages, nextCursor});
    }catch (error) {
        console.error("Error getting message", error);
        return res.status(500).json({message: "System error"});
    }
}

export const getSharedMedia = async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        // Find messages with images or files
        const messages = await Message.find({
            conversationId,
            $or: [
                { imgUrl: { $exists: true, $ne: null } },
                { fileUrl: { $exists: true, $ne: null } }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(100); // Limit to last 100 media items for now

        const media = {
            images: [],
            files: []
        };

        messages.forEach(msg => {
            if (msg.imgUrl) {
                media.images.push({
                    _id: msg._id,
                    url: msg.imgUrl,
                    createdAt: msg.createdAt,
                    senderId: msg.senderId
                });
            }
            if (msg.fileUrl) {
                media.files.push({
                    _id: msg._id,
                    url: msg.fileUrl,
                    fileName: msg.content || "Unknown file", // Usually content stores filename or we might need separate field
                    createdAt: msg.createdAt,
                    senderId: msg.senderId
                });
            }
        });

        return res.status(200).json(media);
    } catch (error) {
        console.error("Error getting shared media", error);
        return res.status(500).json({ message: "System error" });
    }
}

export const markConversationAsRead = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        // Reset unread count for this user
        // Note: Map keys in Mongoose are strings.
        if (conversation.unreadCounts) {
            conversation.unreadCounts.set(userId.toString(), 0);
        } else {
            conversation.unreadCounts = new Map();
            conversation.unreadCounts.set(userId.toString(), 0);
        }

        await conversation.save();

        return res.status(200).json({ message: "Marked as read", unreadCounts: conversation.unreadCounts });
    } catch (error) {
        console.error("Error marking conversation as read", error);
        return res.status(500).json({ message: "System error" });
    }
}

export const getPinnedMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id;

        const pinnedMessages = await Message.find({
            conversationId,
            isPinned: true,
            deletedForUsers: { $ne: userId }
        })
        .sort({ pinnedAt: -1 })
        .populate('pinnedBy', 'username displayName avatarURL');

        return res.status(200).json({ pinnedMessages });
    } catch (error) {
        console.error("Error in getPinnedMessages:", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const addMembersToGroup = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { memberIds } = req.body || {};
        const userId = req.user._id;

        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ message: "Vui lòng chọn thành viên để thêm" });
        }

        const convo = await Conversation.findById(conversationId);
        if (!convo || !convo.isGroup) {
            return res.status(404).json({ message: "Nhóm không tồn tại" });
        }

        const isAdmin = isGroupAdmin(convo, userId);

        if (!isAdmin) {
            return res.status(403).json({ message: "Chỉ quản trị viên mới có quyền thêm thành viên vào nhóm" });
        }

        const existingSet = new Set(convo.participants.map(p => (p.userId?._id || p.userId)?.toString()));
        if (memberIds.some(id => !mongoose.isObjectIdOrHexString(id?._id || id))) {
            return res.status(400).json({ message: 'ID thành viên không hợp lệ' });
        }
        const cleanIds = [...new Set(memberIds.map(id => new mongoose.Types.ObjectId(id?._id || id).toString()))]
            .filter(id => !existingSet.has(id));

        if (cleanIds.length === 0) {
            return res.status(400).json({ message: "Các thành viên đã có trong nhóm" });
        }

        const addedUsers = await User.find({ _id: { $in: cleanIds } }).select('displayName username');
        if (addedUsers.length !== cleanIds.length) {
            return res.status(400).json({ message: 'Thành viên không tồn tại' });
        }
        const updated = await Conversation.findOneAndUpdate({
            _id: convo._id, 'participants.userId': { $nin: cleanIds },
            $or: [
                { 'group.createdBy': userId, 'participants.userId': userId },
                { participants: { $elemMatch: { userId, role: 'admin' } } },
            ],
        }, { $push: { participants: { $each: cleanIds.map(id => ({ userId: id, role: 'member', joinAt: new Date() })) } } }, { new: true });
        if (!updated) return res.status(409).json({ message: 'Nhóm đã thay đổi, vui lòng tải lại' });
        convo.participants = updated.participants;

        await convo.populate([
            { path: "participants.userId", select: "displayName avatarURL username" },
            { path: 'seenBy', select: 'displayName avatarURL username' },
            { path: "lastMessage.senderId", select: "displayName avatarURL username" }
        ]);

        const formatted = formatConversation(convo);

        cleanIds.forEach(uid => {
            io.to(uid).emit("newConversation", formatted);
        });
        existingSet.forEach(uid => {
            io.to(uid).emit("conversationUpdated", formatted);
        });

        const addedNames = addedUsers.map(u => u.displayName || u.username).join(", ");
        const adminName = req.user.displayName || req.user.username || "Admin";

        const sysMsg = await Message.create({
            conversationId,
            senderId: userId,
            content: `${adminName} đã thêm ${addedNames} vào nhóm`,
            messageType: 'text'
        });
        const populatedMsg = await Message.findById(sysMsg._id).populate("senderId", "displayName username avatarURL");

        convo.participants.forEach(p => {
            const uid = (p.userId?._id || p.userId)?.toString();
            if (uid) io.to(uid).emit("newMessage", populatedMsg);
        });

        return res.status(200).json({ conversation: formatted });
    } catch (error) {
        console.error("Error adding members to group:", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const updateMemberRole = async (req, res) => {
    try {
        const { conversationId, memberId } = req.params;
        const { role } = req.body || {};
        const userId = req.user._id;

        if (!mongoose.isObjectIdOrHexString(memberId)) {
            return res.status(400).json({ message: 'ID thành viên không hợp lệ' });
        }

        if (!['admin', 'member'].includes(role)) {
            return res.status(400).json({ message: "Vai trò không hợp lệ" });
        }

        const convo = await Conversation.findById(conversationId);
        if (!convo || !convo.isGroup) {
            return res.status(404).json({ message: "Nhóm không tồn tại" });
        }

        if (!isGroupLeader(convo, userId)) {
            return res.status(403).json({ message: "Chỉ quản trị viên mới có quyền phân quyền" });
        }

        const targetP = convo.participants.find(p => userIdOf(p.userId) === new mongoose.Types.ObjectId(memberId).toString());
        if (!targetP) {
            return res.status(404).json({ message: "Thành viên không tồn tại trong nhóm" });
        }

        if (userIdOf(targetP.userId) === userIdOf(convo.group.createdBy)) {
            return res.status(400).json({ message: 'Không thể thay đổi vai trò trưởng nhóm' });
        }
        const updated = await Conversation.findOneAndUpdate({
            _id: convo._id, 'group.createdBy': userId, 'participants.userId': targetP.userId,
        }, { $set: { 'participants.$.role': role } }, { new: true });
        if (!updated) return res.status(409).json({ message: 'Nhóm đã thay đổi, vui lòng tải lại' });
        convo.participants = updated.participants;

        await convo.populate([
            { path: "participants.userId", select: "displayName avatarURL username" },
            { path: 'seenBy', select: 'displayName avatarURL username' },
            { path: "lastMessage.senderId", select: "displayName avatarURL username" }
        ]);

        const formatted = formatConversation(convo);

        convo.participants.forEach(p => {
            const uid = (p.userId?._id || p.userId)?.toString();
            if (uid) io.to(uid).emit("conversationUpdated", formatted);
        });

        return res.status(200).json({ conversation: formatted });
    } catch (error) {
        console.error("Error updating member role:", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const leaveGroup = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id;

        const convo = await Conversation.findById(conversationId);
        if (!convo || !convo.isGroup) {
            return res.status(404).json({ message: "Nhóm không tồn tại" });
        }

        const isMember = convo.participants.some(p => (p.userId?._id || p.userId)?.toString() === userId.toString());
        const isCreator = isGroupLeader(convo, userId);
        if (!isMember) {
            return res.status(400).json({ message: "Bạn không phải thành viên nhóm" });
        }

        convo.participants = convo.participants.filter(p => (p.userId?._id || p.userId)?.toString() !== userId.toString());

        if (convo.participants.length === 0) {
            await removeUsersFromGroupCall(conversationId, [userId.toString()]);
            io.to(userId.toString()).emit('conversationRemoved', { conversationId, reason: 'left' });
            await Conversation.findByIdAndDelete(conversationId);
            await Message.deleteMany({ conversationId });
            return res.status(200).json({ message: "Đã rời nhóm và giải tán nhóm trống" });
        }

        if (isCreator) {
            const successor = convo.participants.find(p => p.role === 'admin') || convo.participants[0];
            convo.group.createdBy = successor.userId;
            successor.role = 'leader';
        }
        convo.seenBy = convo.seenBy.filter(id => userIdOf(id) !== userId.toString());
        convo.unreadCounts.delete(userId.toString());
        await convo.save();
        await removeUsersFromGroupCall(conversationId, [userId.toString()]);

        await convo.populate([
            { path: "participants.userId", select: "displayName avatarURL username" },
            { path: 'seenBy', select: 'displayName avatarURL username' },
            { path: "lastMessage.senderId", select: "displayName avatarURL username" }
        ]);

        const formatted = formatConversation(convo);

        io.to(userId.toString()).emit("conversationRemoved", { conversationId });

        convo.participants.forEach(p => {
            const uid = (p.userId?._id || p.userId)?.toString();
            if (uid) io.to(uid).emit("conversationUpdated", formatted);
        });

        const userName = req.user.displayName || req.user.username || "Thành viên";
        const sysMsg = await Message.create({
            conversationId,
            senderId: userId,
            content: `${userName} đã rời khỏi nhóm`,
            messageType: 'text'
        });
        const populatedMsg = await Message.findById(sysMsg._id).populate("senderId", "displayName username avatarURL");

        convo.participants.forEach(p => {
            const uid = (p.userId?._id || p.userId)?.toString();
            if (uid) io.to(uid).emit("newMessage", populatedMsg);
        });

        return res.status(200).json({ message: "Rời nhóm thành công" });
    } catch (error) {
        console.error("Error leaving group:", error);
        return res.status(500).json({ message: "System error" });
    }
};
