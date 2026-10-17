import express from "express";
import {authMe, getUserByUsername, test, toggleSavePost, getSavedPosts, getUserById, updateProfile, updateSettings, blockUser, unblockUser, getBlockedUsers, updateAntiPeepSettings, verifyAntiPeepPin, completeProfile, updatePrivacy, deleteAccount} from "../controllers/userController.js";
import {protectedRoute} from "../middlewares/authMiddleware.js";
import {upload} from "../middlewares/uploadMiddleware.js";


const router = express.Router();

router.get("/me", protectedRoute, authMe);

router.get("/test", protectedRoute, test);

router.get("/get-user-by-username", protectedRoute, getUserByUsername);

router.post("/toggle-save", protectedRoute, toggleSavePost);
router.get("/saved-posts", protectedRoute, getSavedPosts);
router.put("/update-profile", protectedRoute, upload.single("avatar"), updateProfile);
router.patch("/complete-profile", protectedRoute, completeProfile);

// Settings
router.put("/settings", protectedRoute, updateSettings);
router.put("/anti-peep", protectedRoute, updateAntiPeepSettings);
router.post("/anti-peep/verify-pin", protectedRoute, verifyAntiPeepPin);

// Blocking
router.post("/block", protectedRoute, blockUser);
router.post("/unblock", protectedRoute, unblockUser);
router.get("/blocked", protectedRoute, getBlockedUsers);

// Privacy & Account
router.put("/privacy", protectedRoute, updatePrivacy);
router.delete("/account", protectedRoute, deleteAccount);

router.get("/:id", protectedRoute, getUserById);


export default router;
