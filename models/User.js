const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    type: { type: String, enum: ['like', 'comment', 'system'], required: true },
    fromUser: { type: String }, // Username who triggered notification
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note' },
    createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    nickname: { type: String },
    password: { type: String }, // Local auth
    email: { type: String, unique: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    avatar: { type: String, default: 'https://ui-avatars.com/api/?name=User' },
    bio: { type: String },
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Note' }],
    notifications: [notificationSchema],
    totalDownloads: { type: Number, default: 0 },
    stats: {
        totalLikesReceived: { type: Number, default: 0 },
        totalUploads: { type: Number, default: 0 }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
