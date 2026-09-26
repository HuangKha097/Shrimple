import express from "express";
import {refreshToken, signIn, signOut, signUp, verifyEmailSignupOtp, resendEmailSignupOtp, changePassword, googleLogin, verifyGoogleSignupOtp, resendGoogleSignupOtp, forgotPassword, verifyOtp, resetPassword} from "../controllers/authController.js";
import { protectedRoute } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/signup", signUp);
router.post("/signup/verify-otp", verifyEmailSignupOtp);
router.post("/signup/resend-otp", resendEmailSignupOtp);

router.post("/signin", signIn)

router.post("/signout", signOut)

router.post("/refresh", refreshToken);
router.post("/google", googleLogin);
router.post("/google/verify-otp", verifyGoogleSignupOtp);
router.post("/google/resend-otp", resendGoogleSignupOtp);
router.put("/change-password", protectedRoute, changePassword);

// Password reset routes
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

export default router;
