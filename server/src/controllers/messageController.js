import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Friend from "../models/Friend.js";
import {upDateConversationAfterCreateMessage} from "../utils/messageHelper.js";
import { getReceiverSocketId, io } from "../socket/socket.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { isGroupAdmin } from '../utils/conversationHelper.js';


export const sendDirectMessage = async (req, res) => {
    try {
        const {recipientId, content, conversationId, image, file, type} = req.body;
        const senderId = req.user._id;

        // --- CHECK BLOCK STATUS ---
        // 1. Check if recipient has blocked sender (Can't send)
        // 2. Check if sender has blocked recipient (Shouldn't happen via UI but good to block API)
        const [recipient, sender] = await Promise.all([
            User.findById(recipientId).select('blockedUsers'),
            User.findById(senderId).select('blockedUsers')
        ]);

        if (!recipient) {
             return res.status(404).json({ message: "Recipient not found" });
        }

        const isSenderBlockedByRecipient = recipient.blockedUsers.includes(senderId);
        if (isSenderBlockedByRecipient) {
            return res.status(403).json({ message: "You cannot send messages to this user." });
        }

        const isRecipientBlockedBySender = sender.blockedUsers.includes(recipientId);
        if (isRecipientBlockedBySender) {
            return res.status(400).json({ message: "You have blocked this user. Unblock to send messages." });
        }
        // ---------------------------

        let conversation;

        if (!content && !image && !file) {
            return res.status(400).json({message: "Content or file not found"});
        }

        // 1. Nếu Client có gửi conversationId -> Tìm theo ID
        if (conversationId) {
            conversation = await Conversation.findById(conversationId);
            if (!conversation || conversation.isGroup ||
                !conversation.participants.some(p => p.userId.toString() === senderId.toString()) ||
                !conversation.participants.some(p => p.userId.toString() === recipientId.toString())) {
                return res.status(403).json({ message: 'Bạn không có quyền gửi tin nhắn vào cuộc trò chuyện này' });
            }
        }

        // 2. [QUAN TRỌNG] Nếu chưa tìm thấy (hoặc Client không gửi ID),
        // HÃY TÌM xem 2 người này đã có cuộc trò chuyện nào chưa
        if (!conversation) {
            conversation = await Conversation.findOne({
                isGroup: false,
                "participants.userId": { $all: [senderId, recipientId] }
            });
        }

        // 3. Nếu vẫn không tìm thấy -> Lúc này mới Tạo Mới
        if (!conversation) {
            conversation = await Conversation.create({
                isGroup: false,
                participants: [
                    {userId: senderId, joinedAt: new Date()},
                    {userId: recipientId, joinedAt: new Date()}
                ],
                lastMessageAt: new Date(),
                unreadCounts: new Map(),
            });
        }

        const messageData = {
            conversationId: conversation._id,
            senderId,
            content: content || "",
            messageType: type || 'text',
        };

        if (image) messageData.imgUrl = image;
        if (file) messageData.fileUrl = file;
        if ((image || file) && (!type || type === 'text')) {
             messageData.messageType = image ? 'image' : 'file';
        }

        const message = await Message.create(messageData);

        upDateConversationAfterCreateMessage(conversation, message, senderId);
        await conversation.save();

        // REALTIME SOCKET
        const targetUserId = recipientId?.toString();
        if (targetUserId) {
            io.to(targetUserId).emit("newMessage", message);
        }

        return res.status(201).json({message});
    } catch (error) {
        console.error("Error in sendDirectMessage", error);
        return res.status(500).json({message: "System error"});
    }

}

export const sendGroupMessage = async (req, res) => {
    try {
        const {conversationId, content, image, file, type} = req.body;
        const senderId = req.user._id;

        let conversation = req.conversation;
        if(!conversation && conversationId) {
            conversation = await Conversation.findById(conversationId).populate('participants.userId');
        }

        if (!content && !image && !file) {
            return res.status(400).json({message: "Content or file not found"});
        }
        
        const messageData = {
            conversationId,
            senderId,
            content: content || "",
            messageType: type || 'text',
        };
        
        if (image) messageData.imgUrl = image;
        if (file) messageData.fileUrl = file;
        if ((image || file) && (!type || type === 'text')) {
             messageData.messageType = image ? 'image' : 'file';
        }

        const message = await Message.create(messageData)

        upDateConversationAfterCreateMessage(conversation, message, senderId);
        await conversation.save();

        // REALTIME GROUP SOCKET
        // Emit to all participants except sender
        if (conversation && conversation.participants) {
            conversation.participants.forEach(p => {
                 // Handling populated vs non-populated participants structure just in case, 
                 // though usually it is { userId: ... } or just ID if not populated.
                 // The schema says participants: [{ userId: ObjectId, ... }]
                const participantId = p.userId?._id?.toString() || p.userId?.toString();
                
                if (participantId && participantId !== senderId.toString()) {
                    io.to(participantId).emit("newMessage", message);
                }
            });
        }

        return res.status(201).json({message});
    }catch (error) {
        console.error("Error in sendGroupMessage", error);
        return res.status(500).json({message: "System error"});
    }
}

export const reactToMessage = async (req, res) => {
    try {
        const { messageId, reaction } = req.body;
        const userId = req.user._id;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        const existingReactionIndex = message.reactions.findIndex(r => r.userId.toString() === userId.toString());

        if (existingReactionIndex !== -1) {
            // User already reacted
            if (message.reactions[existingReactionIndex].reaction === reaction) {
                // Same reaction -> remove it
                message.reactions.splice(existingReactionIndex, 1);
            } else {
                // Different reaction -> update it
                message.reactions[existingReactionIndex].reaction = reaction;
            }
        } else {
            // New reaction
            message.reactions.push({ userId, reaction });
        }

        await message.save();

        const populatedMessage = await Message.findById(messageId).populate('reactions.userId', 'username displayName avatarURL');

        // Get conversation to find participants for socket
        const conversation = await Conversation.findById(message.conversationId).populate('participants.userId');
        
        if (conversation && conversation.participants) {
             conversation.participants.forEach(p => {
                const participantId = p.userId?._id?.toString() || p.userId?.toString();
                if (participantId) {
                    io.to(participantId).emit("messageReaction", { messageId, reactions: populatedMessage.reactions, conversationId: message.conversationId });
                }
            });
        }

        return res.status(200).json({ message: "Reaction updated", reactions: populatedMessage.reactions });

    } catch (error) {
        console.error("Error in reactToMessage", error);
        return res.status(500).json({ message: "System error" });
    }
}

export const uploadChatFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const localPath = req.file.path;
        // Upload to Cloudinary. It automatically uses resource_type: "auto"
        const cloudResponse = await uploadToCloudinary(localPath);

        if (!cloudResponse) {
            return res.status(500).json({ message: "Failed to upload file to cloud storage" });
        }

        return res.status(200).json({
            url: cloudResponse.secure_url,
            publicId: cloudResponse.public_id,
            resourceType: cloudResponse.resource_type,
            originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
            size: req.file.size
        });
    } catch (error) {
        console.error("Error in uploadChatFile:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const recallMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(id);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        // Only sender can recall
        if (message.senderId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "You can only recall your own messages" });
        }

        // Limit to 3 hours
        const elapsedMs = Date.now() - new Date(message.createdAt).getTime();
        const threeHoursMs = 3 * 60 * 60 * 1000;
        if (elapsedMs > threeHoursMs) {
            return res.status(400).json({ message: "Messages can only be recalled within 3 hours" });
        }

        // Wipe content and files
        message.isRecalled = true;
        message.content = "Tin nhắn đã bị thu hồi";
        message.messageType = "text";
        message.imgUrl = undefined;
        message.fileUrl = undefined;
        message.reactions = [];
        await message.save();

        // Update Conversation lastMessage if it was the recalled one
        const conversation = await Conversation.findById(message.conversationId);
        if (conversation && conversation.lastMessage && conversation.lastMessage._id?.toString() === message._id?.toString()) {
            conversation.lastMessage.content = "Tin nhắn đã bị thu hồi";
            conversation.lastMessage.messageType = "text";
            conversation.lastMessage.isRecalled = true;
            await conversation.save();
        }

        // Realtime sync via socket
        if (conversation && conversation.participants) {
            conversation.participants.forEach(p => {
                const participantId = p.userId?._id?.toString() || p.userId?.toString();
                if (participantId) {
                    io.to(participantId).emit("messageRecalled", { messageId: message._id, conversationId: message.conversationId });
                }
            });
        }

        return res.status(200).json({ message: "Message recalled", updatedMessage: message });
    } catch (error) {
        console.error("Error in recallMessage:", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const deleteMessageForMe = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(id);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        if (!message.deletedForUsers.includes(userId)) {
            message.deletedForUsers.push(userId);
            await message.save();
        }

        return res.status(200).json({ message: "Message deleted for you" });
    } catch (error) {
        console.error("Error in deleteMessageForMe:", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const togglePinMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(id);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }

        message.isPinned = !message.isPinned;
        if (message.isPinned) {
            // Find currently pinned messages in this conversation, sorted ascending by pinnedAt (oldest first)
            const currentlyPinned = await Message.find({
                conversationId: message.conversationId,
                isPinned: true
            }).sort({ pinnedAt: 1 });

            if (currentlyPinned.length >= 3) {
                const oldestPin = currentlyPinned[0];
                oldestPin.isPinned = false;
                oldestPin.pinnedBy = undefined;
                oldestPin.pinnedAt = undefined;
                await oldestPin.save();

                const populatedOldest = await Message.findById(oldestPin._id).populate('pinnedBy', 'username displayName avatarURL');
                const conversation = await Conversation.findById(oldestPin.conversationId);
                if (conversation && conversation.participants) {
                    conversation.participants.forEach(p => {
                        const participantId = p.userId?._id?.toString() || p.userId?.toString();
                        const socketId = getReceiverSocketId(participantId);
                        if (socketId) {
                            io.to(socketId).emit("messagePinStatus", {
                                messageId: oldestPin._id,
                                conversationId: oldestPin.conversationId,
                                isPinned: false,
                                pinnedMessage: populatedOldest
                            });
                        }
                    });
                }
            }

            message.pinnedBy = userId;
            message.pinnedAt = new Date();
        } else {
            message.pinnedBy = undefined;
            message.pinnedAt = undefined;
        }

        await message.save();

        const populatedMessage = await Message.findById(message._id).populate('pinnedBy', 'username displayName avatarURL');

        // Realtime sync via socket
        const conversation = await Conversation.findById(message.conversationId);
        if (conversation && conversation.participants) {
            conversation.participants.forEach(p => {
                const participantId = p.userId?._id?.toString() || p.userId?.toString();
                if (participantId) {
                    io.to(participantId).emit("messagePinStatus", {
                        messageId: message._id,
                        conversationId: message.conversationId,
                        isPinned: message.isPinned,
                        pinnedMessage: populatedMessage
                    });
                }
            });
        }

        return res.status(200).json({ message: "Message pin status updated", updatedMessage: populatedMessage });
    } catch (error) {
        console.error("Error in togglePinMessage:", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const forwardMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { targetConversationIds } = req.body;
        const senderId = req.user._id;

        if (!targetConversationIds || !Array.isArray(targetConversationIds) || targetConversationIds.length === 0) {
            return res.status(400).json({ message: "Target conversations are required" });
        }

        const originalMessage = await Message.findById(id);
        if (!originalMessage) {
            return res.status(404).json({ message: "Original message not found" });
        }

        // Validate all target conversations first for friendship and block constraints
        for (const targetConvoId of targetConversationIds) {
            const conversation = await Conversation.findById(targetConvoId);
            if (!conversation) {
                return res.status(404).json({ message: "Một hoặc nhiều cuộc trò chuyện không tồn tại" });
            }

            if (!conversation.participants.some(p => p.userId.toString() === senderId.toString())) {
                return res.status(403).json({ message: 'Bạn không còn là thành viên của nhóm nhận tin nhắn' });
            }

            if (!conversation.isGroup) {
                const partnerParticipant = conversation.participants.find(p => {
                    const pId = p.userId?.toString();
                    return pId && pId !== senderId.toString();
                });

                if (!partnerParticipant) continue;
                const partnerId = partnerParticipant.userId;

                // 1. Check friendship
                const friendship = await Friend.findOne({
                    $or: [
                        { userA: senderId, userB: partnerId },
                        { userA: partnerId, userB: senderId }
                    ]
                });
                if (!friendship) {
                    return res.status(400).json({ message: "Bạn không thể chuyển tiếp tin nhắn đến người không phải bạn bè hoặc đã xóa kết bạn." });
                }

                // 2. Check blocks
                const [recipientUser, senderUser] = await Promise.all([
                    User.findById(partnerId).select('blockedUsers'),
                    User.findById(senderId).select('blockedUsers')
                ]);

                if (!recipientUser || !senderUser) {
                    return res.status(404).json({ message: "Không tìm thấy người dùng nhận." });
                }

                const isSenderBlockedByRecipient = recipientUser.blockedUsers.includes(senderId);
                if (isSenderBlockedByRecipient) {
                    return res.status(403).json({ message: "Bạn không thể chuyển tiếp tin nhắn đến người dùng này." });
                }

                const isRecipientBlockedBySender = senderUser.blockedUsers.includes(partnerId);
                if (isRecipientBlockedBySender) {
                    return res.status(400).json({ message: "Bạn đã chặn người dùng này. Bỏ chặn để chuyển tiếp." });
                }
            }
        }

        const forwardedMessages = [];

        for (const targetConvoId of targetConversationIds) {
            const conversation = await Conversation.findById(targetConvoId);
            if (!conversation) continue;

            const messageData = {
                conversationId: targetConvoId,
                senderId,
                content: originalMessage.content || "",
                messageType: originalMessage.messageType || 'text',
                imgUrl: originalMessage.imgUrl,
                fileUrl: originalMessage.fileUrl,
                isForwarded: true
            };

            const newMessage = await Message.create(messageData);

            upDateConversationAfterCreateMessage(conversation, newMessage, senderId);
            await conversation.save();

            // Realtime socket notifications for all participants in target conversation
            conversation.participants.forEach(p => {
                const participantId = p.userId?._id?.toString() || p.userId?.toString();
                if (participantId) {
                    io.to(participantId).emit("newMessage", newMessage);
                }
            });

            forwardedMessages.push(newMessage);
        }

        return res.status(201).json({ message: "Message forwarded successfully", forwardedMessages });
    } catch (error) {
        console.error("Error in forwardMessage:", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const createPoll = async (req, res) => {
    try {
        const { conversationId, question, options, allowMultiple } = req.body;
        const senderId = req.user._id;

        if (!conversationId || typeof question !== 'string' || !question.trim() || !Array.isArray(options) || options.length < 2 ||
            options.some(option => typeof option !== 'string') || (allowMultiple !== undefined && typeof allowMultiple !== 'boolean')) {
            return res.status(400).json({ message: "Vui lòng nhập câu hỏi và ít nhất 2 phương án bình chọn" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation?.isGroup) {
            return res.status(404).json({ message: "Cuộc trò chuyện không tồn tại" });
        }

        const pollOptions = options.map((opt, idx) => ({
            id: `${idx + 1}_${Date.now().toString(36)}`,
            text: (opt || "").trim(),
            votes: []
        })).filter(opt => opt.text.length > 0);

        if (pollOptions.length < 2) {
            return res.status(400).json({ message: "Cần ít nhất 2 phương án hợp lệ" });
        }

        const messageData = {
            conversationId,
            senderId,
            content: question.trim(),
            messageType: 'poll',
            poll: {
                question: question.trim(),
                options: pollOptions,
                allowMultiple: Boolean(allowMultiple),
                closed: false,
                createdBy: senderId
            }
        };

        const message = await Message.create(messageData);
        const populatedMessage = await Message.findById(message._id)
            .populate("senderId", "username displayName avatarURL")
            .populate("poll.options.votes", "username displayName avatarURL");

        upDateConversationAfterCreateMessage(conversation, populatedMessage, senderId);
        await conversation.save();

        if (conversation.participants) {
            conversation.participants.forEach(p => {
                const participantId = (p.userId?._id || p.userId)?.toString();
                if (participantId) {
                    io.to(participantId).emit("newMessage", populatedMessage);
                }
            });
        }

        return res.status(201).json({ message: populatedMessage });
    } catch (error) {
        console.error("Error creating poll:", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const votePoll = async (req, res) => {
    try {
        const { id } = req.params;
        const { optionId } = req.body;
        const userId = req.user._id;

        if (typeof optionId !== 'string' || !optionId) return res.status(400).json({ message: 'Phương án bình chọn không hợp lệ' });

        const message = await Message.findById(id);
        if (!message || message.messageType !== 'poll' || !message.poll) {
            return res.status(404).json({ message: "Cuộc bình chọn không tồn tại" });
        }

        if (message.poll.closed) {
            return res.status(400).json({ message: "Cuộc bình chọn này đã kết thúc" });
        }

        const targetOption = message.poll.options.find(opt => opt.id === optionId);
        if (!targetOption) {
            return res.status(404).json({ message: "Phương án bình chọn không tồn tại" });
        }

        const userIdStr = userId.toString();
        const alreadyVotedIndex = targetOption.votes.findIndex(v => v.toString() === userIdStr);

        if (message.poll.allowMultiple) {
            if (alreadyVotedIndex !== -1) {
                targetOption.votes.splice(alreadyVotedIndex, 1);
            } else {
                targetOption.votes.push(userId);
            }
        } else {
            if (alreadyVotedIndex !== -1) {
                targetOption.votes.splice(alreadyVotedIndex, 1);
            } else {
                message.poll.options.forEach(opt => {
                    opt.votes = opt.votes.filter(v => v.toString() !== userIdStr);
                });
                targetOption.votes.push(userId);
            }
        }

        await message.save();

        const populatedMessage = await Message.findById(message._id)
            .populate("senderId", "username displayName avatarURL")
            .populate("poll.options.votes", "username displayName avatarURL");

        const conversation = await Conversation.findById(message.conversationId);
        if (conversation && conversation.participants) {
            conversation.participants.forEach(p => {
                const participantId = (p.userId?._id || p.userId)?.toString();
                if (participantId) {
                    io.to(participantId).emit("messageUpdated", populatedMessage);
                }
            });
        }

        return res.status(200).json({ message: populatedMessage });
    } catch (error) {
        console.error("Error voting poll:", error);
        return res.status(500).json({ message: "System error" });
    }
};

export const closePoll = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const message = await Message.findById(id);
        if (!message || message.messageType !== 'poll' || !message.poll) {
            return res.status(404).json({ message: "Cuộc bình chọn không tồn tại" });
        }

        const conversation = await Conversation.findById(message.conversationId);
        const isCreator = message.poll.createdBy?.toString() === userId.toString();
        if (!isCreator && !isGroupAdmin(conversation, userId)) {
            return res.status(403).json({ message: "Chỉ người tạo hoặc quản trị viên mới có thể đóng cuộc bình chọn" });
        }

        message.poll.closed = true;
        message.poll.closedAt = new Date();
        await message.save();

        const populatedMessage = await Message.findById(message._id)
            .populate("senderId", "username displayName avatarURL")
            .populate("poll.options.votes", "username displayName avatarURL");

        if (conversation && conversation.participants) {
            conversation.participants.forEach(p => {
                const participantId = (p.userId?._id || p.userId)?.toString();
                if (participantId) {
                    io.to(participantId).emit("messageUpdated", populatedMessage);
                }
            });
        }

        return res.status(200).json({ message: populatedMessage });
    } catch (error) {
        console.error("Error closing poll:", error);
        return res.status(500).json({ message: "System error" });
    }
};
