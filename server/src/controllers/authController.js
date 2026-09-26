import bcrypt from "bcrypt";
import User from "../models/User.js";
import jwt from "jsonwebtoken"
import crypto from "crypto"
import Session from "../models/Session.js";
import { OAuth2Client } from "google-auth-library";
import Otp from "../models/Otp.js";
import { sendOtpEmail } from "../utils/mailer.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const ACCESS_TOKEN_TTL = '15m' // less than equal 15m, 30m cuz wanna test API
const REFRESH_TOKEN_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days
const OTP_TTL = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const GOOGLE_PENDING_TTL = "10m";
const EMAIL_SIGNUP_PENDING_TTL = "10m";

const normalizeEmail = (email = "") => email.toLowerCase().trim();
const hashOtp = (email, purpose, otp) => crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}:${purpose}:${otp}`)
    .digest("hex");

const publicUser = (user) => ({
    _id: user._id,
    displayName: user.displayName,
    email: user.email,
    username: user.username,
    avatarURL: user.avatarURL,
    birthday: user.birthday,
    gender: user.gender,
    location: user.location,
    isProfileComplete: user.isProfileComplete
});

const issueSession = async (res, user) => {
    const accessToken = jwt.sign(
        { userId: user._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: ACCESS_TOKEN_TTL }
    );
    const refreshToken = crypto.randomBytes(64).toString("hex");

    await Session.create({
        userId: user._id,
        refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL)
    });

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: REFRESH_TOKEN_TTL,
    });

    return { accessToken, user: publicUser(user) };
};

const createOtp = async (email, purpose) => {
    const normalizedEmail = normalizeEmail(email);
    const otp = crypto.randomInt(100000, 1000000).toString();
    await Otp.deleteMany({ email: normalizedEmail, purpose });
    await Otp.create({
        email: normalizedEmail,
        purpose,
        codeHash: hashOtp(normalizedEmail, purpose, otp),
        expiresAt: new Date(Date.now() + OTP_TTL)
    });
    return otp;
};

const readValidOtp = async (email, purpose, otp) => {
    const normalizedEmail = normalizeEmail(email);
    const record = await Otp.findOne({ email: normalizedEmail, purpose });
    if (!record || !record.codeHash || record.expiresAt < new Date() || record.attempts >= OTP_MAX_ATTEMPTS) {
        return null;
    }
    const expected = Buffer.from(record.codeHash, "hex");
    const actual = Buffer.from(hashOtp(normalizedEmail, purpose, String(otp).trim()), "hex");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        record.attempts += 1;
        await record.save();
        return null;
    }
    return record;
};

export const googleLogin = async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({ success: false, message: "ID Token is required" });
        }

        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const { sub: googleId, email, email_verified: emailVerified, name, picture } = ticket.getPayload();
        if (!email || !emailVerified) {
            return res.status(400).json({ success: false, message: "Google email is not verified." });
        }

        const normalizedEmail = normalizeEmail(email);
        let user = await User.findOne({ $or: [{ googleId }, { email: normalizedEmail }] });

        if (!user) {
            const otp = await createOtp(normalizedEmail, "google-signup");
            const mailResult = await sendOtpEmail(normalizedEmail, otp, "google-signup");
            if (!mailResult.success) {
                await Otp.deleteMany({ email: normalizedEmail, purpose: "google-signup" });
                return res.status(502).json({ success: false, message: "We could not send the verification email. Please try again." });
            }
            const pendingToken = jwt.sign({
                purpose: "google-signup",
                googleId,
                email: normalizedEmail,
                displayName: String(name || "New user").slice(0, 100),
                avatarURL: picture || ""
            }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: GOOGLE_PENDING_TTL });

            return res.status(202).json({
                success: true,
                requiresOtp: true,
                pendingToken,
                email: normalizedEmail,
                message: "We sent a verification code to your email.",
                loggedToConsole: !!mailResult.loggedToConsole
            });
        } else if (!user.googleId) {
            user.googleId = googleId;
            if (!user.avatarURL) user.avatarURL = picture;
            await user.save();
        }

        const session = await issueSession(res, user);

        return res.status(200).json({
            success: true,
            message: `User ${user.displayName} logged in via Google!`,
            ...session
        });

    } catch (error) {
        console.error("Error during googleLogin:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

const parseGooglePendingToken = (pendingToken) => {
    const payload = jwt.verify(pendingToken, process.env.ACCESS_TOKEN_SECRET);
    if (payload.purpose !== "google-signup") throw new Error("Invalid pending token");
    return payload;
};

export const verifyGoogleSignupOtp = async (req, res) => {
    try {
        const { pendingToken, otp } = req.body;
        if (!pendingToken || !/^\d{6}$/.test(String(otp || ""))) {
            return res.status(400).json({ success: false, message: "A valid 6-digit code is required." });
        }
        const pending = parseGooglePendingToken(pendingToken);
        const otpRecord = await readValidOtp(pending.email, "google-signup", otp);
        if (!otpRecord) {
            return res.status(400).json({ success: false, message: "Invalid, expired, or overused verification code." });
        }
        if (await User.exists({ $or: [{ googleId: pending.googleId }, { email: pending.email }] })) {
            await Otp.deleteMany({ email: pending.email, purpose: "google-signup" });
            return res.status(409).json({ success: false, message: "This account already exists. Please sign in again." });
        }

        const user = await User.create({
            googleId: pending.googleId,
            email: pending.email,
            displayName: pending.displayName,
            avatarURL: pending.avatarURL,
            isProfileComplete: false
        });
        await Otp.deleteMany({ email: pending.email, purpose: "google-signup" });
        const session = await issueSession(res, user);
        return res.status(201).json({
            success: true,
            message: "Email verified. Let's finish your profile.",
            ...session
        });
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(400).json({ success: false, message: "The verification session expired. Sign in with Google again." });
        }
        console.error("Error verifying Google signup OTP:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const resendGoogleSignupOtp = async (req, res) => {
    try {
        const { pendingToken } = req.body;
        if (!pendingToken) return res.status(400).json({ success: false, message: "Verification session is required." });
        const pending = parseGooglePendingToken(pendingToken);
        const recent = await Otp.findOne({ email: pending.email, purpose: "google-signup" });
        if (recent && Date.now() - recent.createdAt.getTime() < 45_000) {
            return res.status(429).json({ success: false, message: "Please wait before requesting another code." });
        }
        const otp = await createOtp(pending.email, "google-signup");
        const mailResult = await sendOtpEmail(pending.email, otp, "google-signup");
        if (!mailResult.success) {
            await Otp.deleteMany({ email: pending.email, purpose: "google-signup" });
            return res.status(502).json({ success: false, message: "We could not send the verification email. Please try again." });
        }
        return res.status(200).json({
            success: true,
            message: "A new verification code was sent.",
            loggedToConsole: !!mailResult.loggedToConsole
        });
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(400).json({ success: false, message: "The verification session expired. Sign in with Google again." });
        }
        console.error("Error resending Google signup OTP:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const signUp = async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        // Minimalist validation
        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "FullName, email and password are required.",
            });
        }

        // Check duplicate email
        const normalizedEmail = normalizeEmail(email);
        const duplicateUser = await User.findOne({ email: normalizedEmail });
        if (duplicateUser) {
            return res.status(409).json({
                success: false,
                message: "Email already exists.",
            });
        }

        const otp = await createOtp(normalizedEmail, "email-signup");
        const mailResult = await sendOtpEmail(normalizedEmail, otp, "email-signup");
        if (!mailResult.success) {
            await Otp.deleteMany({ email: normalizedEmail, purpose: "email-signup" });
            return res.status(502).json({
                success: false,
                message: "We could not send the verification email. Please try again."
            });
        }

        const pendingToken = jwt.sign({
            purpose: "email-signup",
            email: normalizedEmail,
            displayName: fullName.trim(),
            password: await bcrypt.hash(password, 10)
        }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: EMAIL_SIGNUP_PENDING_TTL });

        return res.status(202).json({
            success: true,
            requiresOtp: true,
            pendingToken,
            email: normalizedEmail,
            message: "We sent a verification code to your email.",
            loggedToConsole: !!mailResult.loggedToConsole
        });
    } catch (error) {
        console.error("Error during signUp:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
        });
    }
};

const parseEmailSignupPendingToken = (pendingToken) => {
    const payload = jwt.verify(pendingToken, process.env.ACCESS_TOKEN_SECRET);
    if (payload.purpose !== "email-signup") throw new Error("Invalid pending token");
    return payload;
};

export const verifyEmailSignupOtp = async (req, res) => {
    try {
        const { pendingToken, otp } = req.body;
        if (!pendingToken || !/^\d{6}$/.test(String(otp || ""))) {
            return res.status(400).json({ success: false, message: "A valid 6-digit code is required." });
        }

        const pending = parseEmailSignupPendingToken(pendingToken);
        const otpRecord = await readValidOtp(pending.email, "email-signup", otp);
        if (!otpRecord) {
            return res.status(400).json({ success: false, message: "Invalid, expired, or overused verification code." });
        }
        if (await User.exists({ email: pending.email })) {
            await Otp.deleteMany({ email: pending.email, purpose: "email-signup" });
            return res.status(409).json({ success: false, message: "Email already exists. Please sign in." });
        }

        const user = await User.create({
            password: pending.password,
            email: pending.email,
            displayName: pending.displayName,
            gender: "other",
            isProfileComplete: false,
        });
        await Otp.deleteMany({ email: pending.email, purpose: "email-signup" });
        const session = await issueSession(res, user);
        return res.status(201).json({
            success: true,
            message: "Email verified. Please complete your profile.",
            ...session
        });
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(400).json({ success: false, message: "The verification session expired. Please sign up again." });
        }
        console.error("Error verifying email signup OTP:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const resendEmailSignupOtp = async (req, res) => {
    try {
        const { pendingToken } = req.body;
        if (!pendingToken) return res.status(400).json({ success: false, message: "Verification session is required." });
        const pending = parseEmailSignupPendingToken(pendingToken);
        const recent = await Otp.findOne({ email: pending.email, purpose: "email-signup" });
        if (recent && Date.now() - recent.createdAt.getTime() < 45_000) {
            return res.status(429).json({ success: false, message: "Please wait before requesting another code." });
        }
        const otp = await createOtp(pending.email, "email-signup");
        const mailResult = await sendOtpEmail(pending.email, otp, "email-signup");
        if (!mailResult.success) {
            await Otp.deleteMany({ email: pending.email, purpose: "email-signup" });
            return res.status(502).json({ success: false, message: "We could not send the verification email. Please try again." });
        }
        return res.status(200).json({ success: true, message: "A new verification code was sent." });
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(400).json({ success: false, message: "The verification session expired. Please sign up again." });
        }
        console.error("Error resending email signup OTP:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const signIn = async (req, res) => {
    try {
        // get input from request body ( (email || phone) && password)
        const {email, password} = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "The input is required"
            })

        }
        // check user in database
        const user = await User.findOne({email: normalizeEmail(email)})

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Email or phone does not exist"
            })
        }

        // compare password
        if (!user.password) {
            return res.status(400).json({ message: "This account uses Google sign-in." });
        }
        const passwordCorrect = await bcrypt.compare(password, user.password)
        if (!passwordCorrect) {
            return res.status(401).json({message: "Password is not correct"})
        }
        const session = await issueSession(res, user);
        return res.status(200).json({
            success: true,
            message: `User ${user.displayName} logged in successfully!`,
            ...session
        })

    } catch (error) {
        console.error("Error during signIn:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
        });
    }
}

export const signOut = async (req, res) => {
    try {
        // get refreshToken from cookie
        const token = req.cookies?.refreshToken;

        if (token) {
            // remove refreshToken on Session
            await Session.deleteOne({refreshToken: token})
            // remove cookie
            res.clearCookie("refreshToken")
        }

        return res.status(204).send();
    } catch (error) {
        console.error("Error during signOut:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
        });
    }
}

export const refreshToken = async (req, res) => {
    try {
        // get refresh token in db
        const token = req.cookies?.refreshToken;
        if (!token) {
            return res.status(401).json({message: "Refresh token doesn't exist."})
        }

        // compare with refreshToken in db
        const session = await Session.findOne({refreshToken: token}).populate("userId");
        if (!session || !session.userId) {
            return res.status(403).json({message: "Refresh token is missing or expired."})
        }

        // check if expire
        if (session.expiresAt < new Date()) {
            return res.status(403).json({message: "Refresh token is expired."})
        }

        // create new accessToken
        const accessToken = jwt.sign({
            userId: session.userId._id,
        }, process.env.ACCESS_TOKEN_SECRET, {expiresIn: ACCESS_TOKEN_TTL})

        return res.status(200).json({
            accessToken,
            user: {
                _id: session.userId._id,
                displayName: session.userId.displayName,
                email: session.userId.email,
                avatarURL: session.userId.avatarURL,
                isProfileComplete: session.userId.isProfileComplete
            }
        })
    } catch (error) {
        console.error("Error during call refreshToken:", error);
        return res.status(500).json({message: "Internal server error."});
    }
}



export const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        // protectedRoute attaches 'req.user', not 'req.userId'
        const userId = req.user._id; 

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: "Both old and new passwords are required." });
        }
        
        if (newPassword.length < 6) {
             return res.status(400).json({ message: "New password must be at least 6 characters." });
        }

        // We need to re-fetch user because req.user from middleware has .select("-password")
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Verify old password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect old password." });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({ message: "Password changed successfully." });
    } catch (error) {
        console.error("Error changing password:", error);
        return res.status(500).json({ message: "Internal server error." });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required." });
        }

        // Check if user exists
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ success: false, message: "No account found with this email." });
        }

        const normalizedEmail = normalizeEmail(email);
        const otp = await createOtp(normalizedEmail, "password-reset");
        const mailResult = await sendOtpEmail(normalizedEmail, otp, "password-reset");
        if (!mailResult.success) {
            await Otp.deleteMany({ email: normalizedEmail, purpose: "password-reset" });
            return res.status(502).json({ success: false, message: "We could not send the reset email. Please try again." });
        }

        return res.status(200).json({
            success: true,
            message: "OTP sent successfully! Please check your email inbox.",
            loggedToConsole: !!mailResult.loggedToConsole
        });
    } catch (error) {
        console.error("Error during forgotPassword:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ success: false, message: "Email and OTP code are required." });
        }

        const otpRecord = await readValidOtp(email, "password-reset", otp);
        if (!otpRecord) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP code." });
        }

        return res.status(200).json({
            success: true,
            message: "OTP code verified successfully."
        });
    } catch (error) {
        console.error("Error during verifyOtp:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: "Email, OTP and new password are required." });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: "New password must be at least 6 characters." });
        }

        const otpRecord = await readValidOtp(email, "password-reset", otp);
        if (!otpRecord) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP code." });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // Hash and update password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        // Delete verified OTP so it cannot be used again
        await Otp.deleteMany({ email: normalizeEmail(email), purpose: "password-reset" });

        return res.status(200).json({
            success: true,
            message: "Your password has been reset successfully! You can now log in."
        });
    } catch (error) {
        console.error("Error during resetPassword:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};
