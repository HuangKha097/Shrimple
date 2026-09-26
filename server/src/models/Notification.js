import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        type: {
            type: String,
            enum: ["like", "comment", "reply", "friend_request", "friend_accept"],
            required: true,
        },
        post: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Post",
            default: null,
        },
        commentId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        text: {
            type: String,
            default: "",
            trim: true,
            maxlength: 300,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
