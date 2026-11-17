const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Uploaded files are stored on disk in backend/uploads/ (git-ignored).
// Each file is saved as "<attachment id><extension>", so names never clash.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

fs.mkdirSync(UPLOAD_DIR, { recursive : true });

const storage = multer.diskStorage({
    destination : UPLOAD_DIR,
    filename : (req, file, cb) => {
        // Browsers send file names as latin1; convert so names like "résumé.pdf" survive
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

        const attachmentId = crypto.randomUUID();
        req.attachmentId = attachmentId;
        cb(null, attachmentId + path.extname(file.originalname).toLowerCase());
    }
});

const upload = multer({
    storage : storage,
    limits : { fileSize : MAX_FILE_SIZE, files : 1 }
});

// Path on disk for an attachment row from the database
function storedFilePath(attachment) {
    return path.join(UPLOAD_DIR, attachment.id + path.extname(attachment.file_name).toLowerCase());
}

exports.uploadAttachment = upload.single('file');
exports.storedFilePath = storedFilePath;
exports.MAX_FILE_SIZE = MAX_FILE_SIZE;
