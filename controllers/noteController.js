const Note = require('../models/Note');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');

const NOTES_FILE = 'notes.json';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

let bucket;
let useMongo = false;

const setBucket = (b) => { bucket = b; };
const setMongoMode = (val) => { useMongo = val; }; 

// Helper to check if a string is a valid MongoDB ObjectId
function isValidObjectId(id) {
    return /^[0-9a-fA-F]{24}$/.test(id);
}

// Helper for local data
function getLocalNotes() {
    if (fs.existsSync(NOTES_FILE)) {
        return JSON.parse(fs.readFileSync(NOTES_FILE));
    }
    return [];
}

function saveLocalNotes(notes) {
    fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
}

// 1. Get all notes with search and sort
exports.getNotes = async (req, res) => {
    try {
        const { subject, search, sort } = req.query;
        
        if (useMongo && Note.db.readyState === 1) {
            let query = {};
            if (subject) query.subject = subject;
            if (search) {
                query.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { subject: { $regex: search, $options: 'i' } }
                ];
            }

            let notesQuery = Note.find(query);
            if (sort === 'likes') notesQuery = notesQuery.sort({ likes: -1, uploadDate: -1 });
            else notesQuery = notesQuery.sort({ uploadDate: -1 });

            const notes = await notesQuery;
            return res.json(notes);
        } else {
            // Local Fallback
            let notes = getLocalNotes();
            if (subject) notes = notes.filter(n => n.subject.toLowerCase() === subject.toLowerCase());
            if (search) {
                const s = search.toLowerCase();
                notes = notes.filter(n => 
                    n.title.toLowerCase().includes(s) || 
                    n.subject.toLowerCase().includes(s)
                );
            }

            if (sort === 'likes') notes.sort((a, b) => (b.likes || 0) - (a.likes || 0));
            else notes.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

            return res.json(notes);
        }
    } catch (error) {
        console.error('Fetch notes error:', error);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
};

// 2. Handle Like
exports.likeNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.body;

        if (useMongo && Note.db.readyState === 1 && isValidObjectId(id)) {
            const note = await Note.findById(id);
            if (!note) return res.status(404).json({ error: 'Note not found' });
            
            if (!note.likedBy) note.likedBy = [];
            if (note.likedBy.includes(username)) return res.status(400).json({ error: 'Already liked' });
            
            // If already disliked, remove dislike
            if (note.dislikedBy && note.dislikedBy.includes(username)) {
                note.dislikedBy = note.dislikedBy.filter(u => u !== username);
                note.dislikes = (note.dislikes || 1) - 1;
            }

            note.likes = (note.likes || 0) + 1;
            note.likedBy.push(username);
            await note.save();

            // Notify owner
            if (note.username !== username) {
                const owner = await User.findOne({ username: note.username });
                if (owner) {
                    owner.notifications.push({
                        type: 'like',
                        fromUser: username,
                        message: `${username} liked your note "${note.title}"`,
                        noteId: note._id
                    });
                    owner.stats.totalLikesReceived += 1;
                    await owner.save();
                }
            }

            return res.json({ likes: note.likes, dislikes: note.dislikes });
        } else {
            // Local Fallback or Invalid Mongo ID
            const notes = getLocalNotes();
            const note = notes.find(n => n.id === id || n._id === id);
            if (!note) return res.status(404).json({ error: 'Note not found' });
            
            if (!note.likedBy) note.likedBy = [];
            if (note.likedBy.includes(username)) return res.status(400).json({ error: 'Already liked' });
            
            // If already disliked, remove dislike
            if (note.dislikedBy && note.dislikedBy.includes(username)) {
                note.dislikedBy = note.dislikedBy.filter(u => u !== username);
                note.dislikes = (note.dislikes || 1) - 1;
            }

            note.likes = (note.likes || 0) + 1;
            note.likedBy.push(username);
            saveLocalNotes(notes);
            return res.json({ likes: note.likes, dislikes: note.dislikes });
        }
    } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({ error: 'Like failed: ' + error.message });
    }
};

// 3. Handle Dislike
exports.dislikeNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.body;

        if (useMongo && Note.db.readyState === 1 && isValidObjectId(id)) {
            const note = await Note.findById(id);
            if (!note) return res.status(404).json({ error: 'Note not found' });
            
            if (!note.dislikedBy) note.dislikedBy = [];
            if (note.dislikedBy.includes(username)) return res.status(400).json({ error: 'Already disliked' });
            
            // If already liked, remove like
            if (note.likedBy && note.likedBy.includes(username)) {
                note.likedBy = note.likedBy.filter(u => u !== username);
                note.likes = (note.likes || 1) - 1;
                // Update owner's stats
                await User.findOneAndUpdate({ username: note.username }, { $inc: { 'stats.totalLikesReceived': -1 } });
            }

            note.dislikes = (note.dislikes || 0) + 1;
            note.dislikedBy.push(username);
            await note.save();

            return res.json({ likes: note.likes, dislikes: note.dislikes });
        } else {
            // Local Fallback
            const notes = getLocalNotes();
            const note = notes.find(n => n.id === id || n._id === id);
            if (!note) return res.status(404).json({ error: 'Note not found' });
            
            if (!note.dislikedBy) note.dislikedBy = [];
            if (note.dislikedBy.includes(username)) return res.status(400).json({ error: 'Already disliked' });
            
            // If already liked, remove like
            if (note.likedBy && note.likedBy.includes(username)) {
                note.likedBy = note.likedBy.filter(u => u !== username);
                note.likes = (note.likes || 1) - 1;
            }

            note.dislikes = (note.dislikes || 0) + 1;
            note.dislikedBy.push(username);
            saveLocalNotes(notes);
            return res.json({ likes: note.likes, dislikes: note.dislikes });
        }
    } catch (error) {
        console.error('Dislike error:', error);
        res.status(500).json({ error: 'Dislike failed: ' + error.message });
    }
};

// 4. Add Comment
exports.addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, text } = req.body;

        if (useMongo && Note.db.readyState === 1 && isValidObjectId(id)) {
            const note = await Note.findById(id);
            if (!note) return res.status(404).json({ error: 'Note not found' });
            
            if (!note.comments) note.comments = [];
            note.comments.push({ username, text });
            await note.save();

            // Notify owner
            if (note.username !== username) {
                const owner = await User.findOne({ username: note.username });
                if (owner) {
                    owner.notifications.push({
                        type: 'comment',
                        fromUser: username,
                        message: `${username} commented on your note "${note.title}"`,
                        noteId: note._id
                    });
                    await owner.save();
                }
            }

            return res.json(note.comments[note.comments.length - 1]);
        } else {
            // Local Fallback or Invalid Mongo ID
            const notes = getLocalNotes();
            const note = notes.find(n => n.id === id || n._id === id);
            if (!note) return res.status(404).json({ error: 'Note not found' });
            
            if (!note.comments) note.comments = [];
            const newComment = { username, text, timestamp: new Date().toISOString() };
            note.comments.push(newComment);
            saveLocalNotes(notes);
            return res.json(newComment);
        }
    } catch (error) {
        console.error('Comment error:', error);
        res.status(500).json({ error: 'Comment failed: ' + error.message });
    }
};

// 5. Delete Note
exports.deleteNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.query;

        let note;
        if (useMongo && Note.db.readyState === 1 && isValidObjectId(id)) {
            note = await Note.findById(id);
        } else {
            const notes = getLocalNotes();
            note = notes.find(n => n.id === id || n._id === id);
        }

        if (!note) return res.status(404).json({ error: 'Note not found' });
        if (note.username !== username) return res.status(403).json({ error: 'Unauthorized' });

        // Delete from Storage
        if (bucket) {
            await bucket.file(note.filename).delete().catch(() => {});
        } else {
            const filePath = path.join(UPLOADS_DIR, note.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        if (useMongo && Note.db.readyState === 1 && isValidObjectId(id)) {
            await Note.findByIdAndDelete(id);
        } else {
            const notes = getLocalNotes();
            const updatedNotes = notes.filter(n => n.id !== id && n._id !== id);
            saveLocalNotes(updatedNotes);
        }

        res.json({ message: 'Deleted' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Delete failed: ' + error.message });
    }
};

// 6. User Dashboard Data
exports.getUserDashboard = async (req, res) => {
    try {
        const { username } = req.params;
        console.log('Fetching dashboard for:', username);
        
        if (useMongo && Note.db.readyState === 1) {
            const user = await User.findOne({ username }).select('-password');
            if (!user) return res.status(404).json({ error: 'User not found' });

            const notes = await Note.find({ username }).sort({ uploadDate: -1 });
            
            // Calculate dynamic stats
            const totalLikes = notes.reduce((sum, n) => sum + (n.likes || 0), 0);
            const totalDislikes = notes.reduce((sum, n) => sum + (n.dislikes || 0), 0);
            const totalDownloads = notes.reduce((sum, n) => sum + (n.downloads || 0), 0);

            const response = {
                user,
                notes,
                stats: {
                    totalUploads: notes.length,
                    totalLikesReceived: totalLikes,
                    totalDislikesReceived: totalDislikes,
                    totalDownloads: totalDownloads
                }
            };
            console.log('MongoDB Response Stats:', response.stats);
            return res.json(response);
        } else {
            // Local Fallback for Dashboard
            const allNotes = getLocalNotes();
            const userNotes = allNotes.filter(n => n.username === username);
            const totalLikes = userNotes.reduce((sum, n) => sum + (n.likes || 0), 0);
            const totalDislikes = userNotes.reduce((sum, n) => sum + (n.dislikes || 0), 0);
            const totalDownloads = userNotes.reduce((sum, n) => sum + (n.downloads || 0), 0);

            const response = {
                user: { 
                    username, 
                    role: 'user', 
                    avatar: `https://ui-avatars.com/api/?name=${username}`,
                    notifications: [] 
                },
                notes: userNotes,
                stats: {
                    totalUploads: userNotes.length,
                    totalLikesReceived: totalLikes,
                    totalDislikesReceived: totalDislikes,
                    totalDownloads: totalDownloads
                }
            };
            console.log('Local Response Stats:', response.stats);
            return res.json(response);
        }
    } catch (error) {
        console.error('Dashboard logic error:', error);
        res.status(500).json({ error: 'Dashboard error: ' + error.message });
    }
};

// 7. Leaderboard
exports.getLeaderboard = async (req, res) => {
    try {
        if (useMongo && Note.db.readyState === 1) {
            const topContributors = await User.find()
                .sort({ 'stats.totalLikesReceived': -1, 'stats.totalUploads': -1 })
                .limit(10)
                .select('username avatar stats');

            return res.json(topContributors);
        } else {
            // Local Fallback for Leaderboard
            const allNotes = getLocalNotes();
            const userStats = {};

            allNotes.forEach(note => {
                const u = note.username;
                if (!userStats[u]) {
                    userStats[u] = {
                        username: u,
                        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(u)}&background=random`,
                        stats: { totalUploads: 0, totalLikesReceived: 0 }
                    };
                }
                userStats[u].stats.totalUploads += 1;
                userStats[u].stats.totalLikesReceived += (note.likes || 0);
            });

            const topContributors = Object.values(userStats)
                .sort((a, b) => {
                    if (b.stats.totalLikesReceived !== a.stats.totalLikesReceived) {
                        return b.stats.totalLikesReceived - a.stats.totalLikesReceived;
                    }
                    return b.stats.totalUploads - a.stats.totalUploads;
                })
                .slice(0, 10);

            return res.json(topContributors);
        }
    } catch (error) {
        res.status(500).json({ error: 'Leaderboard error: ' + error.message });
    }
};

// 8. Track Download
exports.trackDownload = async (req, res) => {
    try {
        const { id } = req.params;
        if (useMongo && isValidObjectId(id)) {
            const note = await Note.findById(id);
            if (note) {
                note.downloads = (note.downloads || 0) + 1;
                await note.save();
                
                // Update owner's total download count
                await User.findOneAndUpdate(
                    { username: note.username },
                    { $inc: { totalDownloads: 1 } }
                );
            }
        } else {
            // Local Fallback
            const notes = getLocalNotes();
            const noteIndex = notes.findIndex(n => n.id === id || n._id === id);
            if (noteIndex !== -1) {
                notes[noteIndex].downloads = (notes[noteIndex].downloads || 0) + 1;
                saveLocalNotes(notes);
            }
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 9. Get Public Note (Shareable Link)
exports.getPublicNote = async (req, res) => {
    try {
        const { shareId } = req.params;
        const note = await Note.findOne({ shareId, isPublic: true });
        if (!note) return res.status(404).json({ error: 'Note not found or private' });
        
        note.views = (note.views || 0) + 1;
        await note.save();
        
        res.json(note);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 10. Notifications
exports.getNotifications = async (req, res) => {
    try {
        const { username } = req.params;
        const user = await User.findOne({ username }).select('notifications');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user.notifications.sort((a,b) => b.createdAt - a.createdAt));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.markNotificationsRead = async (req, res) => {
    try {
        const { username } = req.params;
        await User.findOneAndUpdate(
            { username },
            { $set: { "notifications.$[].read": true } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 11. Update Note (Edit)
exports.updateNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subject, isPublic, username } = req.body;

        if (useMongo && isValidObjectId(id)) {
            const note = await Note.findById(id);
            if (!note) return res.status(404).json({ error: 'Note not found' });
            if (note.username !== username) return res.status(403).json({ error: 'Unauthorized' });

            note.title = title || note.title;
            note.subject = subject || note.subject;
            note.isPublic = (isPublic !== undefined) ? isPublic : note.isPublic;
            await note.save();
            return res.json(note);
        } else {
            const notes = getLocalNotes();
            const noteIndex = notes.findIndex(n => n.id === id || n._id === id);
            if (noteIndex === -1) return res.status(404).json({ error: 'Note not found' });
            if (notes[noteIndex].username !== username) return res.status(403).json({ error: 'Unauthorized' });

            notes[noteIndex].title = title || notes[noteIndex].title;
            notes[noteIndex].subject = subject || notes[noteIndex].subject;
            notes[noteIndex].isPublic = (isPublic !== undefined) ? isPublic : notes[noteIndex].isPublic;
            saveLocalNotes(notes);
            return res.json(notes[noteIndex]);
        }
    } catch (error) {
        res.status(500).json({ error: 'Update failed: ' + error.message });
    }
};

// 12. Admin Actions
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.adminDeleteNote = async (req, res) => {
    try {
        const { id } = req.params;
        await Note.findByIdAndDelete(id);
        res.json({ message: 'Deleted by admin' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.setBucket = setBucket;
exports.setMongoMode = setMongoMode;
exports.enableMongo = () => { useMongo = true; };
