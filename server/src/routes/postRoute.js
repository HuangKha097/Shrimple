import express from "express";
import {
    createPost,
    getAllPosts,
    getUserPosts,
    getPostById,
    likePost,
    addComment,
    deletePost,
    getVideoFeed,
    reactToComment,
    replyComment,
    reactToReply,
    updatePostPrivacy,
    repostPost,
    updatePost,
    getTrends,
    searchPosts,
} from "../controllers/postController.js";

import { upload } from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.get("/", getAllPosts);
router.get("/videos", getVideoFeed);
router.get("/trends", getTrends);
router.get("/search", searchPosts);
router.get("/user/:userId", getUserPosts);
router.get("/single/:id", getPostById);
router.post("/create", upload.any(), createPost);
router.put("/like/:id", likePost);
router.put("/comment/:id", addComment);
router.put("/:id/edit", updatePost);
router.put("/:id/privacy", updatePostPrivacy);
router.put("/:id/repost", repostPost);
router.put("/:id", updatePost);
router.delete("/:id", deletePost);
router.put("/:postId/comment/:commentId/like", reactToComment);
router.post("/:postId/comment/:commentId/reply", replyComment);
router.put("/:postId/comment/:commentId/reply/:replyId/like", reactToReply);

export default router;
