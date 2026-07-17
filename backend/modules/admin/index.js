const express = require('express');
const router = express.Router();
const adminController = require('./controllers/adminController');
const authMiddleware = require('../../middlewares/auth');
const roleMiddleware = require('../../middlewares/role');
const upload = require('../../middlewares/upload');

// Protect route: Only Admin can upload
router.post('/upload',
    authMiddleware,
    roleMiddleware(['admin']),
    (req, res, next) => {
        upload.single('file')(req, res, (err) => {
            if (err) {
                console.error(`[Upload] multer error on ${req.method} ${req.originalUrl}:`, err.message);
                return res.status(400).json({ message: err.message });
            }
            next();
        });
    },
    adminController.uploadCsv
);

// Protect route: Only Admin can delete
router.delete('/projects/:id',
    authMiddleware,
    roleMiddleware(['admin']),
    adminController.deleteProject
);

module.exports = router;
