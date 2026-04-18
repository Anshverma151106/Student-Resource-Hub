const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    username: { type: String, required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const noteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true },
    username: { type: String, required: true }, // Uploader's email/username
    nickname: { type: String },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    downloadUrl: { type: String, required: true },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: String }], // Array of usernames who liked this note
    dislikes: { type: Number, default: 0 },
    dislikedBy: [{ type: String }], // Array of usernames who disliked this note
    comments: [commentSchema],
    // Analytics & Production Features
    views: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    shareId: { type: String, unique: true, default: () => Math.random().toString(36).substring(2, 10) },
    uploadDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Note', noteSchema);
