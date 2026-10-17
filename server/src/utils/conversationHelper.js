export const userIdOf = (value) => (value?._id || value)?.toString();

export const isConversationMember = (conversation, userId) =>
    !!conversation?.participants?.some(p => userIdOf(p.userId) === userIdOf(userId));

// Ownership is derived from the creator, independent of delegated admin roles.
export const isGroupLeader = (conversation, userId) =>
    !!conversation?.isGroup && isConversationMember(conversation, userId) &&
    userIdOf(conversation.group?.createdBy) === userIdOf(userId);

export const isGroupAdmin = (conversation, userId) =>
    isGroupLeader(conversation, userId) || (!!conversation?.isGroup &&
        conversation.participants?.some(p => userIdOf(p.userId) === userIdOf(userId) && p.role === 'admin'));

export const formatConversation = (conversation) => {
    const data = conversation.toObject ? conversation.toObject({ flattenMaps: true }) : { ...conversation };
    if (data.group) {
        data.group = { ...data.group };
        delete data.group.inviteToken;
        delete data.group.inviteCode;
    }
    return {
        ...data,
        participants: (conversation.participants || []).map(p => ({
            _id: p.userId?._id || p.userId,
            displayName: p.userId?.displayName,
            avatarURL: p.userId?.avatarURL ?? null,
            username: p.userId?.username ?? null,
            joinedAt: p.joinAt,
            role: conversation.isGroup && userIdOf(p.userId) === userIdOf(conversation.group?.createdBy)
                ? 'leader' : (p.role === 'admin' ? 'admin' : 'member'),
        })),
    };
};

export const populateConversation = (conversation) => conversation.populate([
    { path: 'participants.userId', select: 'displayName avatarURL username' },
    { path: 'seenBy', select: 'displayName avatarURL username' },
    { path: 'lastMessage.senderId', select: 'displayName avatarURL username' },
]);
