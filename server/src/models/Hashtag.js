import mongoose from "mongoose";

const hashtagSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            index: true,
        },
        count: {
            type: Number,
            default: 1,
            min: 0,
        },
        postIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Post",
            },
        ],
        lastUsedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

const Hashtag = mongoose.model("Hashtag", hashtagSchema);
export default Hashtag;
