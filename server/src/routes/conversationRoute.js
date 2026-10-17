import express from "express";
import {
    createConversation,
    getConversation,
    getMessage,
    getSharedMedia,
    markConversationAsRead,
    getPinnedMessages,
    addMembersToGroup,
    updateMemberRole,
    leaveGroup,
} from "../controllers/conversationController.js";
import {checkFriendship} from "../middlewares/friendMiddleware.js";
import { requireConversationMember } from '../middlewares/conversationMiddleware.js';
import { updateGroup, removeGroupMember, deleteGroup, getGroupInvite, rotateGroupInvite, previewGroupInvite, joinGroupInvite } from '../controllers/groupController.js';

const router = express.Router();

router.post("/",checkFriendship,createConversation)
router.get("/", getConversation)
router.get('/invites/:token', previewGroupInvite);
router.post('/invites/:token/join', joinGroupInvite);
router.post('/join/:inviteCode', joinGroupInvite);
router.use('/:conversationId', requireConversationMember);
router.patch('/:conversationId/group', updateGroup);
router.delete('/:conversationId/group', deleteGroup);
router.delete('/:conversationId/members/:memberId', removeGroupMember);
router.get('/:conversationId/invite', getGroupInvite);
router.post('/:conversationId/invite', rotateGroupInvite);
router.get("/:conversationId/messages", getMessage)
router.get("/:conversationId/media", getSharedMedia)
router.patch("/:conversationId/read", markConversationAsRead)
router.get("/:conversationId/pins", getPinnedMessages)

// Group role and member management
router.post("/:conversationId/members", addMembersToGroup)
router.patch("/:conversationId/members/:memberId/role", updateMemberRole)
router.post("/:conversationId/leave", leaveGroup)
router.delete("/:conversationId", deleteGroup)

export default router;
