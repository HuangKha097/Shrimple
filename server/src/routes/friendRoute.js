import express from "express";

import {
    acceptFriendRequest,
    blockFriend,
    declineFriendRequest,
    getAllFriends,
    getFriendRequests,
    sendFriendRequest,
    unFriend,
    getSuggestedFriends
} from "../controllers/friendController.js";
import {protectedRoute} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/request", protectedRoute, sendFriendRequest)
router.post("/request/:requestId/accept", protectedRoute, acceptFriendRequest)
router.post("/request/:requestId/decline", protectedRoute, declineFriendRequest)
router.post("/block/:userId", protectedRoute, blockFriend)
router.post("/unFriend/:friendId", protectedRoute, unFriend)

router.get("/", protectedRoute, getAllFriends)
router.get("/requests", protectedRoute, getFriendRequests)
router.get("/suggestions", protectedRoute, getSuggestedFriends)

export default router;