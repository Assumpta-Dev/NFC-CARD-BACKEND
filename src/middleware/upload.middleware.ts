// ===========================================================
// UPLOAD MIDDLEWARE
// ===========================================================
// Uses multer with memoryStorage so the file buffer is held
// in memory and streamed directly to Cloudinary —
// avoids writing temp files to disk on the server.
//
// Restrictions:
//   - Images only (jpeg, png, webp) — prevents non-image uploads
//   - 5MB max — prevents memory exhaustion from large files
// ===========================================================

import multer from 'multer';
import { AppError } from './error.middleware';

export const uploadPhoto = multer({
  // Store in memory — buffer is passed directly to Cloudinary upload stream
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },

  fileFilter: (_req, file, cb) => {
    // Only allow image formats supported by Cloudinary and browsers
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError(400, 'Only JPEG, PNG, and WebP images are allowed'));
    }
    cb(null, true);
  },
}).single('photo'); // 'photo' is the form field name expected from the client
