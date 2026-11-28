import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { resolveSafeStoragePath } from '../config/storage.js';
import { pacingController } from '../controllers/pacing.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const uploadRef = multer({
  dest: resolveSafeStoragePath('temp'),
  limits: {
    fileSize: 250 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.mp4', '.mov', '.mkv', '.webm', '.m4v'];
    if (allowedExt.includes(ext) || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Format video referensi tidak didukung. Gunakan .mp4, .mov, .mkv, atau .webm.'));
    }
  }
});

export const pacingRouter = Router();

pacingRouter.use(requireAuth);

pacingRouter.get('/pacing-profiles', pacingController.list);
pacingRouter.post('/pacing-profiles/analyze', uploadRef.single('file'), pacingController.analyze);
pacingRouter.delete('/pacing-profiles/:id', pacingController.remove);
