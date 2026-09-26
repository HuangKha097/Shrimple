import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import Friend from "../models/Friend.js";
import Post from "../models/Post.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

export const authMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select(
            "-password +antiPeepData.isEnabled +antiPeepData.faceDescriptor "
            + "+antiPeepData.faceDescriptors +antiPeepData.modelVersion"
        );

        return res.status(200).json({ user });
    } catch (error) {
        console.log("Error during call authMe", error);
        return res.status(500).json({ message: "System error" });
    }
};
export const test = async (req, res) => {
    return res.sendStatus(204);
}
export const getUserByUsername = async (req, res) => {
    try {

        let {username} = req.query;

        if (!username) {
            return res.status(400).json({message: "Vui lòng nhập từ khóa"});
        }

        const cleanKeyword = username.trim().replace(/^[@#]+/, "");

        if (!cleanKeyword) {
            return res.status(400).json({message: "Từ khóa không hợp lệ"});
        }


        const users = await User.find({
            username: {
                $regex: cleanKeyword,
                $options: "i"
            }
        }).select("-password");

        return res.status(200).json(users);

    } catch (error) {
        console.log("Error search user:", error);
        return res.status(500).json({message: "Lỗi hệ thống"});
    }
}

export const toggleSavePost = async (req, res) => {
    try {
        const { postId } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const isSaved = user.savedPosts.includes(postId);

        if (isSaved) {
            user.savedPosts = user.savedPosts.filter(id => id.toString() !== postId);
            await user.save();
            return res.status(200).json({ message: "Post unsaved", savedPosts: user.savedPosts });
        } else {
            user.savedPosts.push(postId);
            await user.save();
            return res.status(200).json({ message: "Post saved", savedPosts: user.savedPosts });
        }

    } catch (error) {
        console.error("Error in toggleSavePost:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export const getSavedPosts = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).populate({
            path: 'savedPosts',
            populate: [
                { path: 'author', select: 'username displayName avatarURL' },
                { path: 'comments.postedBy', select: 'username displayName avatarURL' }
            ]
        });

        if (!user) return res.status(404).json({ message: "User not found" });

        // We return the reversed array to show newest saved first (optional, but good UX)
        // Or just return as is.
        const reversedSavedPosts = [...user.savedPosts].reverse();

        return res.status(200).json(reversedSavedPosts);

    } catch (error) {
        console.error("Error in getSavedPosts:", error);
    }
}

export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ message: "User not found" });
        }
        const user = await User.findById(id).select("-password");
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json(user);
    } catch (error) {
        console.error("Error fetching user by ID:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}
export const updateProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const { displayName, bio, username, location, school, major, workplace, birthday, gender } = req.body;
        
        const updateData = {};
        if (displayName) updateData.displayName = displayName;
        if (bio !== undefined) updateData.bio = String(bio || "").trim().slice(0, 500);
        if (username) updateData.username = username;
        if (school !== undefined) updateData.school = String(school || "").trim().slice(0, 150);
        if (major !== undefined) updateData.major = String(major || "").trim().slice(0, 150);
        if (workplace !== undefined) updateData.workplace = String(workplace || "").trim().slice(0, 150);
        if (birthday) {
            const parsedBirth = new Date(birthday);
            if (!Number.isNaN(parsedBirth.getTime())) {
                updateData.birthday = parsedBirth;
            }
        }
        if (gender && ["male", "female", "other"].includes(gender)) {
            updateData.gender = gender;
        }
        if (location !== undefined) {
            let parsedLocation = location;
            if (typeof location === "string") {
                try {
                    parsedLocation = JSON.parse(location);
                } catch {
                    return res.status(400).json({ message: "Location data is invalid" });
                }
            }
            const latitude = parsedLocation?.latitude;
            const longitude = parsedLocation?.longitude;
            if (latitude !== undefined && (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90)) {
                return res.status(400).json({ message: "Latitude is invalid" });
            }
            if (longitude !== undefined && (!Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180)) {
                return res.status(400).json({ message: "Longitude is invalid" });
            }
            updateData.location = {
                province: String(parsedLocation?.province || "").trim().slice(0, 100),
                city: String(parsedLocation?.city || "").trim().slice(0, 100),
                ward: String(parsedLocation?.ward || "").trim().slice(0, 100),
                country: String(parsedLocation?.country || "").trim().slice(0, 100),
                ...(latitude !== undefined ? { latitude: Number(latitude) } : {}),
                ...(longitude !== undefined ? { longitude: Number(longitude) } : {})
            };
        }

        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file.path, "shrimple_avatars");
            
            if (uploadResult) {
                updateData.avatarURL = uploadResult.secure_url;
                updateData.avatarId = uploadResult.public_id;
            } else {
                 return res.status(500).json({ message: "Failed to upload avatar" });
            }
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true }).select("-password");

        return res.status(200).json(updatedUser);
    } catch (error) {
        console.error("Error updating profile:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}

export const updateSettings = async (req, res) => {
    try {
        const userId = req.user._id;
        const { soundEnabled, desktopNotifications } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (soundEnabled !== undefined) user.settings.soundEnabled = soundEnabled;
        if (desktopNotifications !== undefined) user.settings.desktopNotifications = desktopNotifications;

        await user.save();
        return res.status(200).json(user.settings);
    } catch (error) {
        console.error("Error updating settings:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const blockUser = async (req, res) => {
    try {
        const userId = req.user._id;
        const { userId: targetId } = req.body;

        if (userId.toString() === targetId.toString()) {
            return res.status(400).json({ message: "Cannot block yourself" });
        }

        const user = await User.findById(userId);
        if (user.blockedUsers.includes(targetId)) {
            return res.status(400).json({ message: "User already blocked" });
        }

        user.blockedUsers.push(targetId);
        await user.save();
        
        // --- AUTO UNFRIEND ON BLOCK ---
        // Find and delete friendship regardless of who is userA/userB
        await Friend.findOneAndDelete({
            $or:[
                {userA: userId, userB: targetId},
                {userA: targetId, userB: userId}
            ]
        });
        // ------------------------------
        
        // Return full list or just success? Full list is nice for updates.
        // We can just return success for now or the list id.
        return res.status(200).json({ message: "User blocked successfully", blockedUsers: user.blockedUsers });
    } catch (error) {
        console.error("Error blocking user:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const unblockUser = async (req, res) => {
    try {
        const userId = req.user._id;
        const { userId: targetId } = req.body;

        const user = await User.findById(userId);
        user.blockedUsers = user.blockedUsers.filter(id => id.toString() !== targetId.toString());
        await user.save();

        return res.status(200).json({ message: "User unblocked successfully", blockedUsers: user.blockedUsers });
    } catch (error) {
        console.error("Error unblocking user:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getBlockedUsers = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).populate("blockedUsers", "username displayName avatarURL");
        
        if (!user) return res.status(404).json({ message: "User not found" });

        return res.status(200).json(user.blockedUsers);
    } catch (error) {
        console.error("Error fetching blocked users:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

const ANTI_PEEP_MODEL_VERSION = "human-faceres-v3.3.6";
const ANTI_PEEP_DESCRIPTOR_LENGTH = 1024;
const ANTI_PEEP_PIN_WINDOW_MS = 5 * 60 * 1000;
const ANTI_PEEP_PIN_MAX_ATTEMPTS = 5;
const antiPeepPinAttempts = new Map();

const getAntiPeepSettings = (antiPeepData) => ({
    isEnabled: antiPeepData?.isEnabled || false,
    faceDescriptor: antiPeepData?.faceDescriptor || [],
    faceDescriptors: antiPeepData?.faceDescriptors || [],
    modelVersion: antiPeepData?.modelVersion || "",
});

export const updateAntiPeepSettings = async (req, res) => {
    try {
        const userId = req.user._id;
        const {
            isEnabled,
            pin,
            faceDescriptor,
            faceDescriptors,
            modelVersion,
        } = req.body;

        const normalizedFaceDescriptor = faceDescriptor === undefined
            ? undefined
            : Array.isArray(faceDescriptor)
                ? faceDescriptor
                : faceDescriptor && typeof faceDescriptor === "object"
                    ? Object.values(faceDescriptor)
                    : faceDescriptor;

        const isFiniteDescriptor = (descriptor, validLengths) => (
            Array.isArray(descriptor)
            && validLengths.includes(descriptor.length)
            && descriptor.every((value) => Number.isFinite(value) && Math.abs(value) <= 100)
        );

        if (isEnabled !== undefined && typeof isEnabled !== "boolean") {
            return res.status(400).json({ message: "isEnabled must be boolean" });
        }
        if (pin !== undefined && !/^\d{4}$/.test(pin)) {
            return res.status(400).json({ message: "PIN must contain exactly 4 digits" });
        }
        if (
            normalizedFaceDescriptor !== undefined
            && !isFiniteDescriptor(normalizedFaceDescriptor, [128, ANTI_PEEP_DESCRIPTOR_LENGTH])
        ) {
            return res.status(400).json({ message: "faceDescriptor is invalid" });
        }

        const hasGallery = faceDescriptors !== undefined;
        const hasModelVersion = modelVersion !== undefined;
        if (hasGallery !== hasModelVersion) {
            return res.status(400).json({
                message: "faceDescriptors and modelVersion must be updated together",
            });
        }
        if (
            hasGallery
            && (
                !Array.isArray(faceDescriptors)
                || faceDescriptors.length !== 5
                || !faceDescriptors.every((descriptor) => (
                    isFiniteDescriptor(descriptor, [ANTI_PEEP_DESCRIPTOR_LENGTH])
                ))
                || modelVersion !== ANTI_PEEP_MODEL_VERSION
            )
        ) {
            return res.status(400).json({ message: "Face enrollment payload is invalid" });
        }

        const user = await User.findById(userId).select(
            "+antiPeepData.isEnabled +antiPeepData.faceDescriptor "
            + "+antiPeepData.faceDescriptors +antiPeepData.modelVersion +antiPeepData.pin"
        );
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.antiPeepData === undefined) {
            user.antiPeepData = {
                isEnabled: false,
                pin: "",
                faceDescriptor: [],
                faceDescriptors: [],
                modelVersion: "",
            };
        }

        if (isEnabled !== undefined) user.antiPeepData.isEnabled = isEnabled;
        if (pin !== undefined) user.antiPeepData.pin = await bcrypt.hash(pin, 10);
        if (normalizedFaceDescriptor !== undefined) {
            user.antiPeepData.faceDescriptor = normalizedFaceDescriptor;
        }
        if (faceDescriptors !== undefined) user.antiPeepData.faceDescriptors = faceDescriptors;
        if (modelVersion !== undefined) user.antiPeepData.modelVersion = modelVersion;

        await user.save();
        return res.status(200).json(getAntiPeepSettings(user.antiPeepData));
    } catch (error) {
        console.error("Error updateAntiPeepSettings:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const verifyAntiPeepPin = async (req, res) => {
    try {
        const pin = String(req.body?.pin || "");
        if (!/^\d{4}$/.test(pin)) {
            return res.status(400).json({ message: "PIN must contain exactly 4 digits" });
        }

        const key = req.user._id.toString();
        const now = Date.now();
        const attempt = antiPeepPinAttempts.get(key);
        if (
            attempt
            && now - attempt.startedAt < ANTI_PEEP_PIN_WINDOW_MS
            && attempt.count >= ANTI_PEEP_PIN_MAX_ATTEMPTS
        ) {
            return res.status(429).json({
                message: "Too many incorrect PIN attempts. Try again in a few minutes.",
            });
        }
        if (attempt && now - attempt.startedAt >= ANTI_PEEP_PIN_WINDOW_MS) {
            antiPeepPinAttempts.delete(key);
        }

        // Reserve synchronously before DB/bcrypt awaits.
        const current = antiPeepPinAttempts.get(key);
        antiPeepPinAttempts.set(key, current
            ? { ...current, count: current.count + 1 }
            : { count: 1, startedAt: now });
        for (const [entryKey, entry] of antiPeepPinAttempts) {
            if (now - entry.startedAt >= ANTI_PEEP_PIN_WINDOW_MS) antiPeepPinAttempts.delete(entryKey);
        }
        const user = await User.findById(req.user._id).select("+antiPeepData.pin");
        if (!user) return res.status(404).json({ message: "User not found" });

        const storedPin = user.antiPeepData?.pin || "";
        const isHash = /^\$2[aby]\$/.test(storedPin);
        const valid = isHash
            ? await bcrypt.compare(pin, storedPin)
            : storedPin.length > 0 && pin === storedPin;

        if (!valid) {

            return res.status(401).json({ valid: false, message: "Incorrect PIN" });
        }

        antiPeepPinAttempts.delete(key);
        if (!isHash) {
            user.antiPeepData.pin = await bcrypt.hash(pin, 10);
            await user.save();
        }
        return res.status(200).json({ valid: true });
    } catch (error) {
        console.error("Error verifyAntiPeepPin:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};
export const completeProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const { displayName, birthday, gender, username, bio, school, major, workplace } = req.body;

        const cleanDisplayName = String(displayName || "").trim();
        const cleanUsername = String(username || "").trim().toLowerCase();
        const birthDate = new Date(birthday);

        if (cleanDisplayName.length < 2 || !birthday || !cleanUsername) {
            return res.status(400).json({ message: "Name, birthday and username are required" });
        }
        if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
            return res.status(400).json({ message: "Username must be 3-20 letters, numbers or underscores" });
        }
        if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
            return res.status(400).json({ message: "Birthday is invalid" });
        }
        if (gender && !["male", "female", "other"].includes(gender)) {
            return res.status(400).json({ message: "Gender is invalid" });
        }

        const existingUser = await User.findOne({ username: cleanUsername, _id: { $ne: userId } });
        if (existingUser) {
            return res.status(409).json({ message: "Username is already taken" });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                displayName: cleanDisplayName,
                birthday: birthDate,
                gender: gender || "other",
                username: cleanUsername,
                ...(bio ? { bio: String(bio).trim().slice(0, 500) } : {}),
                ...(school ? { school: String(school).trim().slice(0, 150) } : {}),
                ...(major ? { major: String(major).trim().slice(0, 150) } : {}),
                ...(workplace ? { workplace: String(workplace).trim().slice(0, 150) } : {}),
                isProfileComplete: true
            },
            { new: true }
        ).select("-password");

        return res.status(200).json({
            success: true,
            message: "Profile completed successfully",
            user: updatedUser
        });

    } catch (error) {
        console.error("Error completing profile:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const updatePrivacy = async (req, res) => {
    try {
        const userId = req.user._id;
        const { 
            showBirthday, 
            birthdayVisibility,
            showOnlineStatus,
            showWorkplace,
            showSchool,
            showLocation,
            showBio,
            whoCanMessage
        } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (!user.privacy) {
            user.privacy = { showBirthday: true, showOnlineStatus: true, birthdayVisibility: "full" };
        }

        if (showBirthday !== undefined) user.privacy.showBirthday = Boolean(showBirthday);
        if (birthdayVisibility !== undefined && ["full", "day_month", "friends", "private"].includes(birthdayVisibility)) {
            user.privacy.birthdayVisibility = birthdayVisibility;
        }
        if (showOnlineStatus !== undefined) user.privacy.showOnlineStatus = Boolean(showOnlineStatus);
        if (showWorkplace !== undefined) user.privacy.showWorkplace = Boolean(showWorkplace);
        if (showSchool !== undefined) user.privacy.showSchool = Boolean(showSchool);
        if (showLocation !== undefined) user.privacy.showLocation = Boolean(showLocation);
        if (showBio !== undefined) user.privacy.showBio = Boolean(showBio);
        if (whoCanMessage !== undefined) user.privacy.whoCanMessage = whoCanMessage;

        await user.save();
        return res.status(200).json(user.privacy);
    } catch (error) {
        console.error("Error updating privacy settings:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};

export const deleteAccount = async (req, res) => {
    try {
        const userId = req.user._id;

        // In a real app, you might want to delete their posts, friends, messages, or just anonymize them.
        // For simplicity, we'll just delete the user document.
        await User.findByIdAndDelete(userId);
        
        // Also delete their sessions
        // await Session.deleteMany({ userId }); // If Session model is imported

        return res.status(200).json({ message: "Account deleted successfully" });
    } catch (error) {
        console.error("Error deleting account:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};
