import { Router } from 'express';
import multer from 'multer';
import { annotationController } from '../controllers/annotation.controller.js';
import { brandKitController } from '../controllers/brand-kit.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

export const m15Router = Router();

m15Router.use(requireAuth);

// Frame-by-Frame Visual Annotations
m15Router.get('/clips/:clipId/annotations', annotationController.listByClip);
m15Router.post('/clips/:clipId/annotations', annotationController.create);
m15Router.patch('/annotations/:annotationId', annotationController.update);
m15Router.delete('/annotations/:annotationId', annotationController.remove);

// Reusable Brand Asset Kits
m15Router.get('/brand-kits', brandKitController.list);
m15Router.post('/brand-kits', brandKitController.create);
m15Router.patch('/brand-kits/:kitId', brandKitController.update);
m15Router.post('/brand-kits/:kitId/logo', logoUpload.single('logo'), brandKitController.uploadLogo);
m15Router.get('/brand-kits/:kitId/logo', brandKitController.serveLogo);
m15Router.delete('/brand-kits/:kitId', brandKitController.remove);
