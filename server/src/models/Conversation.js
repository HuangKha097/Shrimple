import mongoose from "mongoose";

const participantSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    role: {
        type: String,
        enum: ['leader', 'admin', 'member'],
        default: 'member',
    },
    joinAt: {
        type: Date,
        default: Date.now,
    },

}, {_id: false});

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    descriptionGroup: {
        type: String,
        required: false,
    },
    avatarURL: {
        type: String, // Link CDN (ví dụ Cloudinary)
        default: "",
    },
    avatarId: {
        type: String, // Cloudinary public_id (nếu muốn xóa ảnh)
        default: "",
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    inviteCode: {
        type: String,
        select: false,
    },
    inviteToken: {
        type: String,
        select: false,
    },
}, {
    _id: false // khong tao ra _id moi
});

const lastMessageSchema = new mongoose.Schema({
    _id: {type: String},
    content: {
        type: String,
        default: null,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    createdAt: {
        type: Date,
        default: null,
    },
    messageType: {
        type: String,
        default: 'text',
    },
    isRecalled: {
        type: Boolean,
        default: false,
    }
}, {
    _id: false // khong tao ra _id moi
})

const conversationSchema = new mongoose.Schema({
    isGroup: {
        type: Boolean,
        default: false,
        required: true,
    },
    participants: {
        type: [participantSchema],
        required: true,
    },
    group: {
        type: groupSchema,
    },
    lastMessageAt: {
        type: Date
    },
    seenBy:[ {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    lastMessage: {
        type: lastMessageSchema,
        default: null,
    },
    unreadCounts: {
        type: Map,
        of: Number,
        default: {},
    }

}, {
    timestamps: true
})

conversationSchema.index({
    "participants.userId": 1,
    lastMessageAt: -1
})
conversationSchema.index({ 'group.inviteToken': 1 }, { unique: true, sparse: true });

const Conversation = mongoose.model("Conversation", conversationSchema)
export default Conversation
