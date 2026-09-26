export const upDateConversationAfterCreateMessage = (conversation, message, senderId) => {
    conversation.set({
        seenBy: [],
        lastMessageAt: message.createdAt,
        lastMessage: {
            _id: message._id,
            content: message.content,
            senderId,
            createdAt: message.createdAt,
            messageType: message.messageType,
        }
    });

    if (!conversation.unreadCounts) {
        conversation.unreadCounts = new Map();
    }

    conversation.participants.forEach((p) => {
        const memberId = (p.userId?._id || p.userId)?.toString();
        if (!memberId) return;
        const isSender = memberId === senderId?.toString();
        let prevCount = 0;
        if (typeof conversation.unreadCounts.get === 'function') {
            prevCount = conversation.unreadCounts.get(memberId) || 0;
            conversation.unreadCounts.set(memberId, isSender ? 0 : prevCount + 1);
        } else {
            prevCount = conversation.unreadCounts[memberId] || 0;
            conversation.unreadCounts[memberId] = isSender ? 0 : prevCount + 1;
        }
    });
};