require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfModule = require('pdf-parse');
const pdf = typeof pdfModule === 'function' ? pdfModule : (pdfModule.default || pdfModule);
const Tesseract = require('tesseract.js');
const cors = require('cors');
const admin = require('firebase-admin');
const mongoose = require('mongoose');
const Note = require('./models/Note');
const User = require('./models/User');
const noteController = require('./controllers/noteController');

const app = express();
const PORT = 3000;

const USERS_FILE = 'users.json';
const NOTES_FILE = 'notes.json';

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/student_resource_hub', {
    serverSelectionTimeoutMS: 5000 // 5 second timeout
})
.then(() => {
    console.log('✅ Connected to MongoDB');
    noteController.enableMongo();
})
.catch(err => {
    console.error('⚠️ MongoDB Connection Failed. Operating in LOCAL mode.');
    console.log('ℹ️ Reason:', err.message);
});

// Middleware
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin || origin === 'null') return callback(null, true);
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// --- STORAGE CONFIGURATION ---
let db;
let bucket;
let isFirebaseEnabled = false;

const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

if (fs.existsSync(serviceAccountPath)) {
    try {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            storageBucket: "your-app-id.appspot.com"
        });
        db = admin.firestore();
        bucket = admin.storage().bucket();
        isFirebaseEnabled = true;
        noteController.setBucket(bucket);
        console.log('✅ Firebase initialized successfully.');
    } catch (err) {
        console.error('❌ Failed to initialize Firebase:', err.message);
    }
}

// --- MULTER CONFIG ---
const storage = isFirebaseEnabled ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

// --- API ROUTES ---

app.use('/api/notes', require('./routes/noteRoutes'));

// --- AUTH ROUTES (Local Fallback) ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Try MongoDB first
    if (mongoose.connection.readyState === 1) {
        const user = await User.findOne({ username, password });
        if (user) {
            return res.json({ message: 'Login successful', user: { email: user.username, role: user.role, nickname: user.nickname } });
        }
    }

    // Local Fallback
    const users = getLocalUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
        res.json({ message: 'Login successful', user: { email: user.username, role: 'user', nickname: user.nickname } });
    } else {
        res.status(401).json({ error: 'Invalid username or password' });
    }
});

app.post('/api/register', async (req, res) => {
    const { username, password, nickname } = req.body;

    // Try MongoDB first
    if (mongoose.connection.readyState === 1) {
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'User already exists' });
        
        const newUser = new User({ username, password, nickname });
        await newUser.save();
        return res.status(201).json({ message: 'User registered successfully' });
    }

    // Local Fallback
    const users = getLocalUsers();
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'User already exists' });
    }
    users.push({ username, password, nickname });
    saveLocalUsers(users);
    res.status(201).json({ message: 'User registered successfully' });
});

// Helper for local data
function getLocalUsers() {
    if (fs.existsSync(USERS_FILE)) {
        return JSON.parse(fs.readFileSync(USERS_FILE));
    }
    return [];
}

function saveLocalUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function getLocalNotes() {
    if (fs.existsSync(NOTES_FILE)) {
        return JSON.parse(fs.readFileSync(NOTES_FILE));
    }
    return [];
}

function saveLocalNotes(notes) {
    fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
}

// Upload Route
app.post('/api/upload', (req, res) => {
    upload.single('file')(req, res, async function (err) {
        if (err) return res.status(400).json({ error: err.message });
        
        try {
            const { title, subject, username, nickname } = req.body;
            const file = req.file;
            if (!title || !subject || !file || !username) return res.status(400).json({ error: 'Missing required fields' });

            // Extract text for searchability
            let extractedText = "";
            let tags = [subject]; // Simple tag for now
            
            if (file.mimetype === 'application/pdf') {
                try {
                    const data = await pdf(isFirebaseEnabled ? file.buffer : fs.readFileSync(path.join(UPLOADS_DIR, file.filename)));
                    extractedText = data.text.substring(0, 4000); 
                } catch (err) {
                    console.error('PDF extraction failed:', err);
                }
            } else if (file.mimetype.startsWith('image/')) {
                try {
                    const { data: { text } } = await Tesseract.recognize(
                        isFirebaseEnabled ? file.buffer : path.join(UPLOADS_DIR, file.filename),
                        'eng'
                    );
                    extractedText = text.substring(0, 4000);
                } catch (err) {
                    console.error('OCR extraction failed:', err);
                }
            }

            const finishUpload = async (downloadUrl, filename) => {
                const noteData = {
                    title, subject, username, nickname, filename,
                    originalName: file.originalname,
                    downloadUrl,
                    uploadDate: new Date().toISOString(),
                    likes: 0,
                    likedBy: [],
                    comments: [],
                    extractedText,
                    tags: tags
                };

                // Save to MongoDB if available
                if (mongoose.connection.readyState === 1) {
                    const newNote = new Note(noteData);
                    await newNote.save();
                    return res.status(201).json({ message: 'Uploaded', note: newNote });
                } else {
                    // Local Fallback
                    const newNote = { id: Date.now().toString(), ...noteData };
                    const notes = getLocalNotes();
                    notes.push(newNote);
                    saveLocalNotes(notes);
                    return res.status(201).json({ message: 'Uploaded', note: newNote });
                }
            };

            if (isFirebaseEnabled) {
                const firebaseFilename = `${Date.now()}-${file.originalname}`;
                const blob = bucket.file(firebaseFilename);
                const blobStream = blob.createWriteStream({ metadata: { contentType: file.mimetype }, resumable: false });
                
                blobStream.on('error', (e) => res.status(500).json({ error: e.message }));
                blobStream.on('finish', async () => {
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
                    await finishUpload(publicUrl, firebaseFilename);
                });
                blobStream.end(file.buffer);
            } else {
                const localUrl = `/uploads/${file.filename}`;
                await finishUpload(localUrl, file.filename);
            }
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: 'Failed to process note' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
