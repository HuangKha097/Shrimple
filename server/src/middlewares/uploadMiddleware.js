import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure upload directory exists
const uploadDir = "public/uploads/posts";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Create unique filename: post-{timestamp}-{random}.ext
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "post-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|mov|quicktime/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('video/');

    if (extname || mimetype) { // Logic fix: sometimes mimetype varies, check generic video/
        return cb(null, true);
    } else {
        cb(new Error("Only images and videos are allowed"));
    }
};

export const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: fileFilter,
});

// Chat specific upload configuration allowing documents and audio files
const chatUploadDir = "public/uploads/chat";
if (!fs.existsSync(chatUploadDir)) {
    fs.mkdirSync(chatUploadDir, { recursive: true });
}

const chatStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, chatUploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, "chat-" + uniqueSuffix + path.extname(file.originalname));
    },
});

const chatFileFilter = (req, file, cb) => {
    const allowedExtensions = /jpeg|jpg|png|gif|webp|mp4|webm|mov|quicktime|mp3|wav|ogg|m4a|3gp|3gpp|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar|7z|tar|gz/;
    const ext = path.extname(file.originalname).toLowerCase();
    const extname = allowedExtensions.test(ext);
    const isMimeOk = file.mimetype.startsWith('image/') || 
                     file.mimetype.startsWith('video/') || 
                     file.mimetype.startsWith('audio/') || 
                     file.mimetype.startsWith('application/') || 
                     file.mimetype.startsWith('text/');

    if (extname || isMimeOk) {
        return cb(null, true);
    } else {
        cb(new Error("File type not supported for chat sharing"));
    }
};

export const chatUpload = multer({
    storage: chatStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: chatFileFilter,
});

