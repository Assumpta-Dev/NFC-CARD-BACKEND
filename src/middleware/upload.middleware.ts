
import multer from 'multer';
import { AppError } from './error.middleware';

export const uploadPhoto = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError(400, 'Only JPEG, PNG, and WebP images are allowed'));
    }
    cb(null, true);
  },
}).single('photo'); // 'photo' is the form field name expected from the client
