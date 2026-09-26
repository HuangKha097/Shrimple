import mongoose from "mongoose";

const level3ReplySchema = new mongoose.Schema({
    text: { type: String, required: true, trim: true },
    created: { type: Date, default: Date.now },
    postedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    replyToUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    reactions: [
        {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            reaction: String,
        },
    ],
});

const level2ReplySchema = new mongoose.Schema({
    text: { type: String, required: true, trim: true },
    created: { type: Date, default: Date.now },
    postedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    replyToUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    reactions: [
        {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            reaction: String,
        },
    ],
    replies: [level3ReplySchema],
});

const commentSchema = new mongoose.Schema({
    text: { type: String, required: true, trim: true },
    created: { type: Date, default: Date.now },
    postedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    reactions: [
        {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            reaction: String,
        },
    ],
    replies: [level2ReplySchema],
});

const postSchema = new mongoose.Schema(
    {
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        content: {
            type: String,
            trim: true,
            maxlength: 2000,
        },
        image: {
            type: String,
            default: "",
        },
        images: [
            {
                type: String,
            },
        ],
        video: {
            type: String,
            default: "",
        },
        privacy: {
            type: String,
            enum: ["public", "friends", "private"],
            default: "public",
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
        editCount: {
            type: Number,
            default: 0,
            max: 1,
        },
        editedAt: {
            type: Date,
        },
        hashtags: [
            {
                type: String,
                trim: true,
                lowercase: true,
            },
        ],
        reposts: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        likes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        comments: [commentSchema],
    },
    { timestamps: true }
);

const Post = mongoose.model("Post", postSchema);
export default Post;
