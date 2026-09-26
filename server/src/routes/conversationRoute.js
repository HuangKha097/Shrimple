import express from "express";
import {
    createConversation,
    getConversation,
    getMessage,
    getSharedMedia,
    markConversationAsRead,
    getPinnedMessages,
    addMembersToGroup,
    removeMemberFromGroup,
    updateMemberRole,
    leaveGroup,
    disbandGroup,
    getGroupInvite,
    joinGroupByInvite
} from "../controllers/conversationController.js";
import {checkFriendship} from "../middlewares/friendMiddleware.js";

const router = express.Router();

router.post("/",checkFriendship,createConversation)
router.get("/", getConversation)
router.get("/:conversationId/messages", getMessage)
router.get("/:conversationId/media", getSharedMedia)
router.patch("/:conversationId/read", markConversationAsRead)
router.get("/:conversationId/pins", getPinnedMessages)

// Group role and member management
router.post("/:conversationId/members", addMembersToGroup)
router.delete("/:conversationId/members/:memberId", removeMemberFromGroup)
router.patch("/:conversationId/members/:memberId/role", updateMemberRole)
router.post("/:conversationId/leave", leaveGroup)
router.delete("/:conversationId", disbandGroup)

// Group QR and Invite
router.get("/:conversationId/invite", getGroupInvite)
router.post("/join/:inviteCode", joinGroupByInvite)

export default router;