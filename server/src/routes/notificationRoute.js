import express from "express";
import {
    getNotifications,
    markAsRead,
    markAllAsRead,
} from "../controllers/notificationController.js";
import { protectedRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protectedRoute, getNotifications);
router.put("/:id/read", protectedRoute, markAsRead);
router.put("/read-all", protectedRoute, markAllAsRead);

export default router;
