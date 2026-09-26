import mongoose, * as ongoose from 'mongoose'

const messageSchema = mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,

    },
    content: {type: String, trim: true},
    messageType: {
        type: String,
        required: true,
        enum: ['text', 'image', 'video', 'file', 'audio', 'location', 'group_call', 'poll'],
        default: 'text'
    },
    // For group_call tracking
    callId: {
        type: String,
        default: null,
    },
    callStatus: {
        type: String,
        enum: ['active', 'ended'],
        default: 'ended',
    },
    callDuration: {
        type: String,
        default: null,
    },
    startedAt: {
        type: Date,
        default: null,
    },
    endedAt: {
        type: Date,
        default: null,
    },
    // For polls/votes
    poll: {
        question: { type: String },
        options: [
            {
                id: { type: String, required: true },
                text: { type: String, required: true },
                votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
            }
        ],
        allowMultiple: { type: Boolean, default: false },
        closed: { type: Boolean, default: false },
        closedAt: { type: Date },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    edit: {type: Boolean, default: false},
    editAt: {type: Date, default: Date.now},

    imgUrl: {
        type: String,
    },
    fileUrl: {
        type: String,
    },
    reactions: [
        {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            reaction: {
                type: String, // e.g., 'like', 'love', 'haha', etc. or emoji
                required: true
            }
        }
    ],
    isRecalled: {
        type: Boolean,
        default: false
    },
    deletedForUsers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    ],
    isPinned: {
        type: Boolean,
        default: false
    },
    pinnedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    pinnedAt: {
        type: Date
    },
    isForwarded: {
        type: Boolean,
        default: false
    },
}, {
    timestamps: true
})
// sap xep theo conversationId theo thu tu tang dan, createAt theo thu tu giam dan
//  => tin nhan moi nhat se nam o tren cung
messageSchema.index({conversationId: 1, createdAt: -1})

const Message = mongoose.model('Message', messageSchema);
export default Message