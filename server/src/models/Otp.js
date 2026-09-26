import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true
    },
    codeHash: {
        type: String,
        required: true
    },
    purpose: {
        type: String,
        enum: ["password-reset", "email-signup", "google-signup"],
        default: "password-reset",
        required: true,
        index: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

// Auto delete code if expired
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ email: 1, purpose: 1 });

const Otp = mongoose.model("Otp", otpSchema);
export default Otp;
