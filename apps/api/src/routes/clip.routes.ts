import { Router } from 'express';
import { clipController } from '../controllers/clip.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const clipRouter = Router();

clipRouter.use(requireAuth);
clipRouter.get('/:clipId', clipController.detail);
clipRouter.post('/:clipId/regenerate', clipController.regenerate);
clipRouter.post('/:clipId/render-edl', clipController.renderEdl);
clipRouter.post('/:clipId/auto-track-crop', clipController.autoTrackCrop);
clipRouter.get('/:clipId/cover-candidates', clipController.coverCandidates);
clipRouter.get('/:clipId/cover-candidate/:idx', clipController.serveCoverCandidate);
clipRouter.patch('/:clipId/cover', clipController.setCover);
clipRouter.patch('/:clipId/active-version', clipController.setActiveVersion);
clipRouter.patch('/:clipId/approve', clipController.setApproval);
