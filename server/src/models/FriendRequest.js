import mongoose from "mongoose";

const friendRequestSchema = new mongoose.Schema({
    from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    message: {
        type: String,
        maxLength: 300,

    }
}, {
    timestamps: true
})

// khong cho gui trung loi moi, ( from va to la duy nhat)
friendRequestSchema.index({from: 1, to: 1}, {unique: true});
// tra cuu nhanh loi moi ket ban da gui
friendRequestSchema.index({from: 1},);
// tra cuu nhanh loi moi ket ban da nhan
friendRequestSchema.index({to: 1},);

const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);
export default FriendRequest;