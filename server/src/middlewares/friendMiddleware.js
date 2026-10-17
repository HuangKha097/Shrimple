import Friend from "../models/Friend.js";
import Conversation from "../models/Conversation.js";

export const checkFriendship = async (req, res, next) => {
    try {
        const me = req.user._id.toString();
        const recipientId = req.body?.recipientId ?? null;
        const memberIds = req.body?.memberIds ?? [];
        const isGroup = req.body?.isGroup ?? false;

        if (isGroup) {
            const cleanMemberIds = memberIds
                .map(id => (id?._id || id)?.toString())
                .filter(id => id && id !== me);

            if (cleanMemberIds.length < 2) {
                return res.status(400).json({ message: "Nhóm cần tối thiểu 2 thành viên khác bạn" });
            }

            const friendCheck = cleanMemberIds.map(async (memberId) => {
                const friend = await Friend.findOne({
                    $or: [
                        { userA: me, userB: memberId },
                        { userA: memberId, userB: me }
                    ]
                });
                return friend ? null : memberId;
            });

            const results = await Promise.all(friendCheck);
            const notFriends = results.filter(Boolean);

            if (notFriends.length > 0) {
                return res.status(403).json({ message: "Chỉ bạn bè mới có thể tham gia cuộc trò chuyện", notFriends });
            }
            return next();
        }

        // Direct 1-on-1 chat
        const targetUserId = recipientId || (memberIds.length > 0 ? (memberIds[0]?._id || memberIds[0])?.toString() : null);
        if (!targetUserId) {
            return res.status(400).json({ message: "Thiếu thông tin người nhận" });
        }

        if (targetUserId === me) {
            return res.status(400).json({ message: "Không thể tạo cuộc trò chuyện với chính mình" });
        }

        const isFriend = await Friend.findOne({
            $or: [
                { userA: me, userB: targetUserId },
                { userA: targetUserId, userB: me }
            ]
        });

        if (!isFriend) {
            return res.status(403).json({ message: "Bạn chưa kết bạn với người này" });
        }

        return next();
    } catch (err) {
        console.error("Failed during checkFriendship", err);
        return res.status(500).json({ message: "System error" });
    }
};

export const checkGroupMembership = async (req, res, next) => {
    try {
        const {conversationId} = req.body;
        const userId = req.user._id;

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
          return res.status(404).json({message: "not found conversation"});
        }
        const isMember = conversation.participants.some((p)=> p.userId.toString() === userId.toString());

        if (!isMember) {
            return res.status(403).json({message: "You are not member"});
        }

        req.conversation = conversation;
        next();
    } catch (error){
        console.error("Error getting conversation", error);
        return res.status(500).json({message: "System error"});
    }
}
