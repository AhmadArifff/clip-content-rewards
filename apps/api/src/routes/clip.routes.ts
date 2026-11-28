import { Router } from 'express';
import { clipController } from '../controllers/clip.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const clipRouter = Router();

clipRouter.use(requireAuth);
clipRouter.get('/:clipId', clipController.detail);
clipRouter.post('/:clipId/regenerate', clipController.regenerate);
clipRouter.post('/:clipId/render-edl', clipController.renderEdl);
clipRouter.patch('/:clipId/active-version', clipController.setActiveVersion);
clipRouter.patch('/:clipId/approve', clipController.setApproval);
