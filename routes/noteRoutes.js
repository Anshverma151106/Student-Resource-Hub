const express = require('express');
const router = express.Router();
const noteController = require('../controllers/noteController');

router.get('/', noteController.getNotes);
router.post('/:id/like', noteController.likeNote);
router.post('/:id/dislike', noteController.dislikeNote);
router.post('/:id/comment', noteController.addComment);
router.put('/:id', noteController.updateNote);
router.delete('/:id', noteController.deleteNote);

// Production Features
router.get('/dashboard/:username', noteController.getUserDashboard);
router.get('/leaderboard', noteController.getLeaderboard);
router.post('/:id/track-download', noteController.trackDownload);
router.get('/public/:shareId', noteController.getPublicNote);
router.get('/notifications/:username', noteController.getNotifications);
router.post('/notifications/:username/read', noteController.markNotificationsRead);

// Admin
router.get('/admin/users', noteController.getAllUsers);
router.delete('/admin/notes/:id', noteController.adminDeleteNote);

module.exports = router;
