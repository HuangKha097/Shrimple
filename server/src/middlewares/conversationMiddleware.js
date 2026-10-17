import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { isConversationMember } from '../utils/conversationHelper.js';

export const requireConversationMember = async (req, res, next) => {
    try {
        const id = req.params.conversationId || req.body?.conversationId;
        if (!mongoose.isObjectIdOrHexString(id)) {
            return res.status(400).json({ message: 'ID cuộc trò chuyện không hợp lệ' });
        }
        const conversation = await Conversation.findById(id);
        if (!conversation) return res.status(404).json({ message: 'Cuộc trò chuyện không tồn tại' });
        if (!isConversationMember(conversation, req.user._id)) {
            return res.status(403).json({ message: 'Bạn không còn là thành viên của cuộc trò chuyện' });
        }
        req.conversation = conversation;
        return next();
    } catch (error) {
        console.error('Conversation access failed', error);
        return res.status(500).json({ message: 'Không thể kiểm tra quyền truy cập' });
    }
};

export const requireMessageMember = async (req, res, next) => {
    try {
        const id = req.params.id || req.body?.messageId;
        if (!mongoose.isObjectIdOrHexString(id)) {
            return res.status(400).json({ message: 'ID tin nhắn không hợp lệ' });
        }
        const message = await Message.findById(id).select('conversationId');
        if (!message) return res.status(404).json({ message: 'Tin nhắn không tồn tại' });
        req.body = { ...req.body, conversationId: message.conversationId.toString() };
        return requireConversationMember(req, res, next);
    } catch (error) {
        console.error('Message access failed', error);
        return res.status(500).json({ message: 'Không thể kiểm tra quyền truy cập' });
    }
};
