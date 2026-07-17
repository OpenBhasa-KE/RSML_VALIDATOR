const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        console.log(`[Upload] Saving to: ${uploadDir}`);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const name = Date.now() + '-' + file.originalname;
        console.log(`[Upload] Incoming file: originalname="${file.originalname}", mimetype="${file.mimetype}", saved as "${name}"`);
        cb(null, name);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        console.log(`[Upload] fileFilter check: originalname="${file.originalname}", ext="${ext}", mimetype="${file.mimetype}"`);
        if (ext === '.csv' || ext === '.parquet') {
            cb(null, true);
        } else {
            console.warn(`[Upload] Rejected file "${file.originalname}" — extension "${ext}" not allowed`);
            cb(new Error('Only CSV or Parquet files are allowed!'), false);
        }
    }
});

module.exports = upload;
