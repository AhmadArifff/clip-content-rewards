import { Router } from 'express';
import multer from 'multer';
import { mediaController } from '../controllers/media.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 } // Maks 12 MB per chunk upload
});

export const mediaRouter = Router();

mediaRouter.use(requireAuth);
mediaRouter.post('/campaigns/:id/media/chunk', chunkUpload.single('chunk'), mediaController.uploadChunk);
mediaRouter.post('/campaigns/:id/media/complete', mediaController.completeUpload);
mediaRouter.post('/media/:mediaId/transcribe', mediaController.transcribe);
mediaRouter.post('/media/:mediaId/detect-subtitle', mediaController.detectSubtitle);
mediaRouter.patch('/media/:mediaId/embedded-subtitle', mediaController.setEmbeddedSubtitle);
mediaRouter.delete('/media/:mediaId', mediaController.remove);
