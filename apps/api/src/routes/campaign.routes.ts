import { Router } from 'express';
import multer from 'multer';
import { campaignController } from '../controllers/campaign.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const briefUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // Maks 20 MB untuk dokumen brief
});

export const campaignRouter = Router();

campaignRouter.use(requireAuth);
campaignRouter.get('/', campaignController.list);
campaignRouter.post('/', campaignController.create);
campaignRouter.get('/:id', campaignController.detail);
campaignRouter.patch('/:id', campaignController.update);
campaignRouter.delete('/:id', campaignController.remove);

campaignRouter.post('/:id/brief/upload', briefUpload.single('file'), campaignController.uploadBrief);
campaignRouter.patch('/:id/brief', campaignController.updateBrief);
