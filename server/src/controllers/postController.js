import mongoose from "mongoose";
import Post from "../models/Post.js";
import Friend from "../models/Friend.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import Hashtag from "../models/Hashtag.js";
import { io } from "../socket/socket.js";
import { spawn } from "child_process";
import path from "path";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

export const postPopulateOptions = [
    { path: "author", select: "username displayName avatarURL" },
    { path: "comments.postedBy", select: "username displayName avatarURL" },
    { path: "comments.replies.postedBy", select: "username displayName avatarURL" },
    { path: "comments.replies.replyToUser", select: "username displayName avatarURL" },
    { path: "comments.replies.replies.postedBy", select: "username displayName avatarURL" },
    { path: "comments.replies.replies.replyToUser", select: "username displayName avatarURL" },
];

export const extractHashtags = (text) => {
    if (!text || typeof text !== "string") return [];
    const matches = text.match(/#([A-Za-z0-9_À-ỹ]+)/gi) || [];
    const uniqueTags = [...new Set(matches.map(tag => tag.replace(/^#/, "").trim().toLowerCase()))].filter(Boolean);
    return uniqueTags;
};

export const syncHashtags = async (postId, content) => {
    try {
        const tags = extractHashtags(content);
        if (tags.length === 0) return [];
        for (const tag of tags) {
            await Hashtag.findOneAndUpdate(
                { name: tag },
                {
                    $addToSet: { postIds: postId },
                    $inc: { count: 1 },
                    $set: { lastUsedAt: new Date() }
                },
                { upsert: true, new: true }
            );
        }
        return tags;
    } catch (err) {
        console.error("Error syncing hashtags:", err);
        return [];
    }
};

export const removePostFromHashtags = async (postId) => {
    try {
        await Hashtag.updateMany(
            { postIds: postId },
            {
                $pull: { postIds: postId },
                $inc: { count: -1 }
            }
        );
        await Hashtag.deleteMany({ count: { $lte: 0 } });
    } catch (err) {
        console.error("Error removing post from hashtags:", err);
    }
};

export const notifyMentionedUsers = async (text, senderId, postId, commentId = null, excludeIds = []) => {
    try {
        if (!text || typeof text !== "string") return;
        const matches = text.match(/(?:^|\s)@([A-Za-z0-9_À-ỹ.]+)/gi) || [];
        if (matches.length === 0) return;

        const rawTokens = [...new Set(matches.map(m => m.trim().replace(/^@/, "").toLowerCase()))].filter(Boolean);
        if (rawTokens.length === 0) return;

        const senderIdStr = senderId.toString();
        const excludedSet = new Set([senderIdStr, ...(excludeIds || []).filter(Boolean).map(id => id.toString())]);
        const targetUserIds = new Set();

        // Check @everyone / @all -> notify sender's friends
        if (rawTokens.includes("everyone") || rawTokens.includes("all")) {
            const friendships = await Friend.find({
                $or: [{ userA: senderId }, { userB: senderId }]
            }).lean();
            friendships.forEach(f => {
                const fId = f.userA.toString() === senderIdStr ? f.userB.toString() : f.userA.toString();
                if (!excludedSet.has(fId)) targetUserIds.add(fId);
            });
        }

        const usernames = rawTokens.filter(t => t !== "everyone" && t !== "all");
        if (usernames.length > 0) {
            const regexes = usernames.map(u => new RegExp(`^${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i"));
            const mentionedUsers = await User.find({ username: { $in: regexes } }).select("_id").lean();
            mentionedUsers.forEach(u => {
                const uId = u._id.toString();
                if (!excludedSet.has(uId)) targetUserIds.add(uId);
            });
        }

        for (const recipientId of targetUserIds) {
            const notif = await Notification.create({
                recipient: recipientId,
                sender: senderId,
                type: "mention",
                post: postId,
                commentId,
                text: text.trim().slice(0, 100),
            });

            const populatedNotif = await Notification.findById(notif._id)
                .populate("sender", "displayName username avatarURL")
                .populate("post", "content image images video")
                .lean();

            io.to(recipientId).emit("newNotification", populatedNotif);
        }
    } catch (err) {
        console.error("Error notifying mentioned users:", err);
    }
};

const checkFakeNews = (text) => {
    return new Promise((resolve, reject) => {
        // Path to python script relative to server root
        const scriptPath = path.join(process.cwd(), 'src', 'algorithms', 'TF-IDF_RandomForest', 'predict_news.py');
        
        const pythonProcess = spawn('python', [scriptPath], {
             stdio: ['pipe', 'pipe', 'pipe']
        });

        let dataString = '';
        let errorString = '';

        // Write text to stdin
        pythonProcess.stdin.write(text);
        pythonProcess.stdin.end();

        pythonProcess.stdout.on('data', (data) => {
            dataString += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorString += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error("Python script error:", errorString)
                // Fallback: If python fails (e.g. missing libs), we might allow the post or block. 
                // Let's log and allow for now to avoid blocking service, OR reject specific error.
                // But user requested feature, so let's try to parse error or default to false (Real) 
                // ONLY IF it's a system error. If it's a model error, we might want to know.
                // For now, resolve as Real to prevent blocking valid posts if system is buggy.
                // BUT better to log.
                console.log("Fake news check failed, assuming real (default fallback).");
                resolve({ isFake: false }); 
                return;
            }

            try {
                // Find JSON in output (in case of other prints)
                // We expect just JSON
                const result = JSON.parse(dataString);
                resolve(result);
            } catch (err) {
                console.error("Failed to parse Python output:", dataString);
                resolve({ isFake: false });
            }
        });
    });
};

export const createPost = async (req, res) => {
    try {
        const { content, privacy } = req.body;
        const userId = req.user._id;

        // Check for duplicate post within last 60 seconds
        const thirtySecondsAgo = new Date(Date.now() - 60000);
        const duplicate = await Post.findOne({
            author: userId,
            content: content,
            createdAt: { $gte: thirtySecondsAgo }
        });

        if (duplicate) {
             console.log("Duplicate post blocked for user", userId);
             // If we already have this post, just return it instead of erroring, 
             // to handle client retries gracefully, or return 409
             return res.status(200).json(duplicate);
        }

        let imagesArray = [];
        let videoUrl = "";

        // Support both req.files (array from upload.any) and req.file (single)
        const uploadedFiles = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);

        if (uploadedFiles.length > 0) {
            // Upload files concurrently
            const uploadPromises = uploadedFiles.map(async (file) => {
                const localPath = file.path;
                const cloudResponse = await uploadToCloudinary(localPath);
                return { file, cloudResponse };
            });

            const results = await Promise.all(uploadPromises);

            for (const { cloudResponse } of results) {
                if (cloudResponse) {
                    if (cloudResponse.resource_type === 'video') {
                        if (cloudResponse.duration > 60.5) {
                            await deleteFromCloudinary(cloudResponse.public_id, 'video');
                            return res.status(400).json({ message: "Video must be 60 seconds or less." });
                        }
                        videoUrl = cloudResponse.secure_url;
                    } else {
                        imagesArray.push(cloudResponse.secure_url);
                    }
                }
            }
        }

        // Support raw URLs in body (single or array)
        if (req.body.images) {
            try {
                const parsed = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
                if (Array.isArray(parsed)) {
                    imagesArray.push(...parsed.filter(Boolean));
                } else if (typeof parsed === 'string' && parsed) {
                    imagesArray.push(parsed);
                }
            } catch {
                if (typeof req.body.images === 'string' && req.body.images) {
                    imagesArray.push(req.body.images);
                }
            }
        } else if (req.body.image) {
            imagesArray.push(req.body.image);
        }

        if (req.body.video) {
            videoUrl = req.body.video;
        }
        
        if (!content && imagesArray.length === 0 && !videoUrl) {
            return res.status(400).json({ message: "Post content or media is required" });
        }

        // --- Fake News Detection ---
        if (content && content.length > 50) { // Only check if text is substantial (> 50 chars)
            try {
                const detectionResult = await checkFakeNews(content);
                if (detectionResult.error) {
                     console.error("Model error:", detectionResult.error);
                } else if (detectionResult.isFake) {
                    return res.status(400).json({ 
                        message: "Your post appears to contain fake news or misleading information and cannot be posted.",
                        isFake: true,
                        confidence: detectionResult.confidence
                    });
                }
            } catch (err) {
                console.error("Fake news detection exception:", err);
            }
        }
        // ---------------------------

        const validPrivacy = (privacy && ["public", "friends", "private"].includes(privacy)) ? privacy : "public";
        const tags = extractHashtags(content);

        const newPost = new Post({
            author: req.user._id,
            content,
            image: imagesArray[0] || "",
            images: imagesArray,
            video: videoUrl,
            privacy: validPrivacy,
            hashtags: tags,
        });

        await newPost.save();
        await syncHashtags(newPost._id, content);
        await notifyMentionedUsers(content, req.user._id, newPost._id);
        
        // Populate author and comments details to return immediately
        await newPost.populate(postPopulateOptions);

        res.status(201).json(newPost);
    } catch (error) {
        console.error("Error in createPost controller: ", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getAllPosts = async (req, res) => {
    try {
        const userId = req.user._id;

        // 1. Get all friends
        const friendships = await Friend.find({
            $or: [{ userA: userId }, { userB: userId }]
        });

        const friendIds = friendships.map(f => 
            f.userA.toString() === userId.toString() ? f.userB : f.userA
        );

        const limit = parseInt(req.query.limit) || 10;
        const cursor = req.query.cursor; // Cursor is the ISO date string of the last post

        const query = {
            $or: [
                { author: userId },
                { author: { $in: friendIds }, privacy: { $in: ["public", "friends", null, undefined] } },
                { privacy: "public" }
            ]
        };
        
        if (cursor) {
            query.createdAt = { $lt: new Date(cursor) };
        }

        // Find posts matching privacy criteria
        const posts = await Post.find(query)
            .sort({ createdAt: -1 })
            .limit(limit + 1) // Fetch 1 extra to check if there are more
            .populate(postPopulateOptions);

        let nextCursor = null;
        if (posts.length > limit) {
            const nextPost = posts.pop(); // Remove the extra post
            nextCursor = nextPost.createdAt.toISOString();
        }

        res.status(200).json({ posts, nextCursor });
    } catch (error) {
        console.error("Error in getAllPosts controller: ", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getVideoFeed = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        const cursor = req.query.cursor;

        const query = { 
            video: { $exists: true, $ne: "" },
            privacy: { $in: ["public", null, undefined] }
        };

        if (cursor) {
            query.createdAt = { $lt: new Date(cursor) };
        }

        // Global Video Feed: Find public posts with videos
        const posts = await Post.find(query)
            .sort({ createdAt: -1 })
            .limit(limit + 1)
            .populate(postPopulateOptions);

        let nextCursor = null;
        if (posts.length > limit) {
            const nextPost = posts.pop();
            nextCursor = nextPost.createdAt.toISOString();
        }

        res.status(200).json({ posts, nextCursor });
    } catch (error) {
        console.error("Error in getVideoFeed controller: ", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getUserPosts = async (req, res) => {
    try {
        const { userId: targetUserId } = req.params;
        const { type } = req.query; // 'posts', 'reposts', 'videos'
        const currentUserId = req.user?._id;

        if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
            return res.status(200).json([]);
        }

        let baseQuery = {};
        if (type === 'reposts') {
            baseQuery = { reposts: targetUserId };
        } else if (type === 'videos') {
            baseQuery = { author: targetUserId, video: { $exists: true, $ne: "" } };
        } else {
            baseQuery = { author: targetUserId };
        }

        let privacyFilter = {};
        if (currentUserId && currentUserId.toString() === targetUserId.toString()) {
            // Viewing own profile
            if (type === 'reposts') {
                privacyFilter = {
                    $or: [
                        { author: currentUserId },
                        { privacy: { $in: ["public", null, undefined] } }
                    ]
                };
            }
        } else {
            let isFriend = false;
            if (currentUserId) {
                const friendship = await Friend.findOne({
                    $or: [
                        { userA: currentUserId, userB: targetUserId },
                        { userA: targetUserId, userB: currentUserId }
                    ]
                });
                if (friendship) isFriend = true;
            }

            if (isFriend) {
                privacyFilter = { privacy: { $in: ["public", "friends", null, undefined] } };
            } else {
                privacyFilter = { privacy: { $in: ["public", null, undefined] } };
            }
        }

        const finalQuery = Object.keys(privacyFilter).length > 0
            ? { $and: [baseQuery, privacyFilter] }
            : baseQuery;

        const posts = await Post.find(finalQuery)
            .sort({ createdAt: -1 })
            .populate(postPopulateOptions);

        res.status(200).json(posts);
    } catch (error) {
        console.error("Error in getUserPosts controller: ", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const updatePostPrivacy = async (req, res) => {
    try {
        const { id } = req.params;
        const { privacy } = req.body;
        const userId = req.user._id;

        if (!["public", "friends", "private"].includes(privacy)) {
            return res.status(400).json({ message: "Quyền riêng tư không hợp lệ" });
        }

        const post = await Post.findById(id);
        if (!post) {
            return res.status(404).json({ message: "Không tìm thấy bài viết" });
        }

        if (post.author.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa quyền riêng tư bài viết này" });
        }

        post.privacy = privacy;
        await post.save();

        const updatedPost = await Post.findById(id).populate(postPopulateOptions);

        res.status(200).json(updatedPost);
    } catch (error) {
        console.error("Error in updatePostPrivacy:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const repostPost = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const post = await Post.findById(id);
        if (!post) {
            return res.status(404).json({ message: "Không tìm thấy bài viết" });
        }

        if (!Array.isArray(post.reposts)) {
            post.reposts = [];
        }

        const isReposted = post.reposts.some((uid) => uid.toString() === userId.toString());

        if (isReposted) {
            // Un-repost
            post.reposts = post.reposts.filter((uid) => uid.toString() !== userId.toString());
        } else {
            // Repost
            post.reposts.push(userId);
        }

        await post.save();

        const updatedPost = await Post.findById(id).populate(postPopulateOptions);

        res.status(200).json(updatedPost);
    } catch (error) {
        console.error("Error in repostPost:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const likePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user._id;

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const isLiked = post.likes.includes(userId);

        if (isLiked) {
            // Unlike
            post.likes = post.likes.filter((id) => id.toString() !== userId.toString());
        } else {
            // Like
            post.likes.push(userId);

            // Gửi thông báo đến tác giả nếu người like khác tác giả
            if (post.author.toString() !== userId.toString()) {
                try {
                    const notif = await Notification.create({
                        recipient: post.author,
                        sender: userId,
                        type: "like",
                        post: post._id,
                        text: "đã thích bài viết của bạn.",
                    });

                    const populatedNotif = await Notification.findById(notif._id)
                        .populate("sender", "displayName username avatarURL")
                        .populate("post", "content image images video")
                        .lean();

                    io.to(post.author.toString()).emit("newNotification", populatedNotif);
                } catch (notifErr) {
                    console.error("Error creating like notification:", notifErr);
                }
            }
        }

        await post.save();
        
        const updatedPost = await Post.findById(postId).populate(postPopulateOptions);

        res.status(200).json(updatedPost);
    } catch (error) {
        console.error("Error in likePost controller: ", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const addComment = async (req, res) => {
    try {
        const { text } = req.body;
        const postId = req.params.id;

        if (!text || !text.trim()) {
            return res.status(400).json({ message: "Nội dung bình luận không được để trống" });
        }

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        const comment = {
            text: text.trim(),
            postedBy: req.user._id,
            created: new Date(),
            replies: [],
        };

        post.comments.push(comment);
        await post.save();

        // Gửi thông báo đến tác giả bài viết
        if (post.author.toString() !== req.user._id.toString()) {
            try {
                const notif = await Notification.create({
                    recipient: post.author,
                    sender: req.user._id,
                    type: "comment",
                    post: post._id,
                    text: text.trim().slice(0, 100),
                });

                const populatedNotif = await Notification.findById(notif._id)
                    .populate("sender", "displayName username avatarURL")
                    .populate("post", "content image images video")
                    .lean();

                io.to(post.author.toString()).emit("newNotification", populatedNotif);
            } catch (notifErr) {
                console.error("Error creating comment notification:", notifErr);
            }
        }

        await notifyMentionedUsers(text, req.user._id, post._id, null, [post.author]);
        
        const updatedPost = await Post.findById(postId).populate(postPopulateOptions);

        res.status(200).json(updatedPost);
    } catch (error) {
        console.error("Error in addComment controller: ", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const replyComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const { text, replyToReplyId, replyToUserId } = req.body;
        const userId = req.user._id;

        if (!text || !text.trim()) return res.status(400).json({ message: "Nội dung phản hồi không được để trống" });

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        const comment = post.comments.id(commentId);
        if (!comment) return res.status(404).json({ message: "Comment not found" });

        let recipientId = null;

        // Nếu có replyToReplyId: Người dùng đang trả lời một reply cấp 2 hoặc cấp 3
        if (replyToReplyId) {
            // Tìm trong reply cấp 2
            let targetL2 = comment.replies.id(replyToReplyId);

            if (targetL2) {
                // Trả lời reply cấp 2 -> Thêm vào level 3
                if (!Array.isArray(targetL2.replies)) targetL2.replies = [];
                targetL2.replies.push({
                    text: text.trim(),
                    postedBy: userId,
                    replyToUser: replyToUserId || targetL2.postedBy,
                    created: new Date(),
                });
                recipientId = replyToUserId || targetL2.postedBy;
            } else {
                // Có thể replyToReplyId là một reply cấp 3 -> Tìm cấp 2 cha chứa nó
                const parentL2 = comment.replies.find(r => r.replies && r.replies.id(replyToReplyId));
                if (parentL2) {
                    // Tiếp tục lưu ở cấp 3 của parentL2 (không tạo cấp 4!)
                    parentL2.replies.push({
                        text: text.trim(),
                        postedBy: userId,
                        replyToUser: replyToUserId || parentL2.postedBy,
                        created: new Date(),
                    });
                    recipientId = replyToUserId || parentL2.postedBy;
                } else {
                    // Fallback: Thêm vào cấp 2
                    comment.replies.push({
                        text: text.trim(),
                        postedBy: userId,
                        replyToUser: replyToUserId || comment.postedBy,
                        created: new Date(),
                        replies: [],
                    });
                    recipientId = replyToUserId || comment.postedBy;
                }
            }
        } else {
            // Trả lời comment gốc (cấp 1) -> Tạo reply cấp 2
            comment.replies.push({
                text: text.trim(),
                postedBy: userId,
                replyToUser: replyToUserId || comment.postedBy,
                created: new Date(),
                replies: [],
            });
            recipientId = replyToUserId || comment.postedBy;
        }

        await post.save();

        // Gửi thông báo đến người được trả lời
        if (recipientId && recipientId.toString() !== userId.toString()) {
            try {
                const notif = await Notification.create({
                    recipient: recipientId,
                    sender: userId,
                    type: "reply",
                    post: post._id,
                    commentId: comment._id,
                    text: text.trim().slice(0, 100),
                });

                const populatedNotif = await Notification.findById(notif._id)
                    .populate("sender", "displayName username avatarURL")
                    .populate("post", "content image images video")
                    .lean();

                io.to(recipientId.toString()).emit("newNotification", populatedNotif);
            } catch (notifErr) {
                console.error("Error creating reply notification:", notifErr);
            }
        }

        await notifyMentionedUsers(text, userId, post._id, comment._id, [recipientId]);

        const updatedPost = await Post.findById(postId).populate(postPopulateOptions);

        res.status(200).json(updatedPost);
    } catch (error) {
        console.error("Error in replyComment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const updatePost = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        const post = await Post.findById(id);
        if (!post) {
            return res.status(404).json({ message: "Không tìm thấy bài viết" });
        }

        if (post.author.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Bạn không có quyền chỉnh sửa bài viết này" });
        }

        // Mỗi bài viết chỉ chỉnh sửa được 1 lần
        if (post.isEdited || (post.editCount && post.editCount >= 1)) {
            return res.status(400).json({ message: "Mỗi bài viết chỉ được phép chỉnh sửa 1 lần duy nhất." });
        }

        if (content !== undefined) {
            const trimmed = content.trim();
            if (!trimmed && (!post.images || post.images.length === 0) && !post.video) {
                return res.status(400).json({ message: "Nội dung bài viết không được để trống" });
            }

            // Đồng bộ lại hashtags
            await removePostFromHashtags(post._id);
            const newTags = await syncHashtags(post._id, trimmed);

            post.content = trimmed;
            post.hashtags = newTags;
        }

        post.isEdited = true;
        post.editCount = (post.editCount || 0) + 1;
        post.editedAt = new Date();

        await post.save();

        const updatedPost = await Post.findById(id).populate(postPopulateOptions);

        res.status(200).json(updatedPost);
    } catch (error) {
        console.error("Error in updatePost:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        // Check if user is author
        if (post.author.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: "You are not authorized to delete this post" });
        }

        await removePostFromHashtags(post._id);
        await Notification.deleteMany({ post: post._id });
        await Post.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Post deleted successfully" });
    } catch (error) {
        console.error("Error in deletePost controller: ", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const getPostById = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id).populate(postPopulateOptions);

        if (!post) {
            return res.status(404).json({ message: "Post not found" });
        }

        res.status(200).json(post);
    } catch (error) {
        console.error("Error in getPostById controller: ", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const reactToComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const { reaction } = req.body;
        const userId = req.user._id;

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        const comment = post.comments.id(commentId);
        if (!comment) return res.status(404).json({ message: "Comment not found" });

        const existingReactionIndex = comment.reactions.findIndex(r => r.userId.toString() === userId.toString());

        if (existingReactionIndex > -1) {
            const existingReaction = comment.reactions[existingReactionIndex];
            if (existingReaction.reaction === reaction) {
                comment.reactions.splice(existingReactionIndex, 1);
            } else {
                existingReaction.reaction = reaction;
            }
        } else {
            comment.reactions.push({ userId, reaction });
        }

        await post.save();

        const updatedPost = await Post.findById(postId).populate(postPopulateOptions);

        res.status(200).json(updatedPost);
    } catch (error) {
        console.error("Error in reactToComment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const reactToReply = async (req, res) => {
    try {
        const { postId, commentId, replyId } = req.params;
        const { reaction } = req.body;
        const userId = req.user._id;

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: "Post not found" });

        const comment = post.comments.id(commentId);
        if (!comment) return res.status(404).json({ message: "Comment not found" });

        // Tìm ở cấp 2 hoặc cấp 3
        let reply = comment.replies.id(replyId);
        if (!reply) {
            for (const r of comment.replies) {
                if (r.replies) {
                    const subR = r.replies.id(replyId);
                    if (subR) {
                        reply = subR;
                        break;
                    }
                }
            }
        }

        if (!reply) return res.status(404).json({ message: "Reply not found" });

        const existingReactionIndex = reply.reactions.findIndex(r => r.userId.toString() === userId.toString());

        if (existingReactionIndex > -1) {
             const existingReaction = reply.reactions[existingReactionIndex];
             if (existingReaction.reaction === reaction) {
                 reply.reactions.splice(existingReactionIndex, 1);
             } else {
                 existingReaction.reaction = reaction;
             }
        } else {
            reply.reactions.push({ userId, reaction });
        }

        await post.save();

        const updatedPost = await Post.findById(postId).populate(postPopulateOptions);

        res.status(200).json(updatedPost);
    } catch (error) {
        console.error("Error in reactToReply:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getTrends = async (req, res) => {
    try {
        const trends = await Hashtag.find({ count: { $gt: 0 } })
            .sort({ count: -1, lastUsedAt: -1 })
            .limit(10)
            .lean();

        res.status(200).json(trends);
    } catch (error) {
        console.error("Error in getTrends:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const searchPosts = async (req, res) => {
    try {
        const rawQuery = (req.query.q || "").trim();
        const userId = req.user?._id;

        if (!rawQuery) {
            return res.status(200).json({ posts: [], users: [], hashtag: null });
        }

        const isHashtagSearch = rawQuery.startsWith("#");
        const cleanTag = rawQuery.replace(/^#/, "").trim().toLowerCase();

        // 1. Hashtag details
        let hashtagDoc = null;
        if (cleanTag) {
            hashtagDoc = await Hashtag.findOne({ name: cleanTag }).lean();
        }

        // 2. Tìm người dùng
        const userKeyword = rawQuery.replace(/^[@#]/, "").trim();
        let users = [];
        if (userKeyword) {
            users = await User.find({
                $or: [
                    { username: { $regex: userKeyword, $options: "i" } },
                    { displayName: { $regex: userKeyword, $options: "i" } },
                ]
            })
            .select("displayName username avatarURL bio")
            .limit(10)
            .lean();
        }

        // 3. Tìm bài viết
        let friendIds = [];
        if (userId) {
            const friendships = await Friend.find({
                $or: [{ userA: userId }, { userB: userId }]
            });
            friendIds = friendships.map(f =>
                f.userA.toString() === userId.toString() ? f.userB : f.userA
            );
        }

        const privacyFilter = {
            $or: [
                { author: userId },
                { author: { $in: friendIds }, privacy: { $in: ["public", "friends", null, undefined] } },
                { privacy: { $in: ["public", null, undefined] } }
            ]
        };

        let contentFilter = {};
        if (isHashtagSearch) {
            contentFilter = {
                $or: [
                    { hashtags: cleanTag },
                    { content: { $regex: `#${cleanTag}\\b`, $options: "i" } }
                ]
            };
        } else {
            contentFilter = {
                $or: [
                    { content: { $regex: rawQuery, $options: "i" } },
                    { hashtags: cleanTag }
                ]
            };
        }

        const finalQuery = {
            $and: [privacyFilter, contentFilter]
        };

        const posts = await Post.find(finalQuery)
            .sort({ createdAt: -1 })
            .limit(30)
            .populate(postPopulateOptions);

        res.status(200).json({ posts, users, hashtag: hashtagDoc });
    } catch (error) {
        console.error("Error in searchPosts:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

