import express from "express";
import {
    sendDirectMessage,
    sendGroupMessage,
    reactToMessage,
    uploadChatFile,
    recallMessage,
    deleteMessageForMe,
    togglePinMessage,
    forwardMessage,
    createPoll,
    votePoll,
    closePoll
} from "../controllers/messageController.js";
import {checkFriendship, checkGroupMembership} from "../middlewares/friendMiddleware.js";
import {chatUpload} from "../middlewares/uploadMiddleware.js";
import { requireConversationMember, requireMessageMember } from '../middlewares/conversationMiddleware.js';

const router = express.Router();

router.post("/direct", checkFriendship, sendDirectMessage)
router.post("/group", checkGroupMembership,sendGroupMessage)
router.post("/reaction", requireMessageMember, reactToMessage)
router.post("/upload", chatUpload.single("file"), uploadChatFile);

router.put("/:id/recall", requireMessageMember, recallMessage);
router.put("/:id/delete-for-me", requireMessageMember, deleteMessageForMe);
router.put("/:id/pin", requireMessageMember, togglePinMessage);
router.post("/:id/forward", requireMessageMember, forwardMessage);

// Poll / Vote
router.post("/poll", requireConversationMember, createPoll);
router.post("/:id/vote", requireMessageMember, votePoll);
router.put("/:id/poll/close", requireMessageMember, closePoll);

export default router;
