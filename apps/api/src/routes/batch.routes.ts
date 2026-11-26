import { Router } from 'express';
import { batchController } from '../controllers/batch.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const batchRouter = Router();

batchRouter.use(requireAuth);
batchRouter.post('/campaigns/:id/batches/estimate', batchController.estimate);
batchRouter.post('/campaigns/:id/batches', batchController.start);
batchRouter.get('/batches/:batchId', batchController.detail);
batchRouter.get('/batches/:batchId/stream', batchController.streamProgress);
batchRouter.post('/batches/:batchId/cancel', batchController.cancel);

batchRouter.post('/clips/:clipId/retry', batchController.retryClip);
batchRouter.get('/clips/:clipId/stream-video', batchController.streamVideo);
batchRouter.get('/clips/:clipId/cover', batchController.serveCover);
