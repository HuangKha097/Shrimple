import mongoose from 'mongoose';

const friendSchema = new mongoose.Schema({
    userA: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userB: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
});

friendSchema.pre('save', function (next) {
    const a = this.userA.toString();
    const b = this.userB.toString();

    if (a === b) {
        return next(new Error("A user cannot be friends with themselves."));
    }

    if (a > b) {
        [this.userA, this.userB] = [this.userB, this.userA];
    }

    next();
});

friendSchema.index({userA: 1, userB: 1}, {unique: true});
friendSchema.index({userA: 1});
friendSchema.index({userB: 1});

const Friend = mongoose.model('Friend', friendSchema);
export default Friend;
