import { Router } from 'express';
import { presetController } from '../controllers/preset.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const presetRouter = Router();

presetRouter.use(requireAuth);
presetRouter.get('/presets', presetController.listPresets);
presetRouter.post('/presets', presetController.createPreset);
presetRouter.patch('/presets/:id', presetController.updatePreset);
presetRouter.delete('/presets/:id', presetController.deletePreset);

presetRouter.get('/target-profiles', presetController.listTargetProfiles);
presetRouter.post('/target-profiles', presetController.createTargetProfile);
presetRouter.delete('/target-profiles/:id', presetController.deleteTargetProfile);
