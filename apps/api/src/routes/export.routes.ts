import { Router } from 'express';
import { exportController } from '../controllers/export.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const exportRouter = Router();

exportRouter.use(requireAuth);

exportRouter.get('/clips/:clipId/download', exportController.downloadSingle);
exportRouter.post('/batches/:batchId/export-zip', exportController.exportBatchZip);
