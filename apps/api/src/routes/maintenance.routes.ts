import { Router } from 'express';
import { maintenanceController } from '../controllers/maintenance.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export const maintenanceRouter = Router();

maintenanceRouter.get('/maintenance/overview', requireAuth, maintenanceController.overview);
maintenanceRouter.get('/maintenance/alert-summary', requireAuth, maintenanceController.alertSummary);
maintenanceRouter.patch('/maintenance/policy', requireAuth, maintenanceController.updatePolicy);
maintenanceRouter.patch('/maintenance/clips/:clipId/retention', requireAuth, maintenanceController.clipRetention);
maintenanceRouter.post('/maintenance/actions/prune-media', requireAuth, maintenanceController.pruneMedia);
maintenanceRouter.post('/maintenance/actions/delete-clips', requireAuth, maintenanceController.deleteClips);
maintenanceRouter.post('/maintenance/actions/cleanup-inactive-versions', requireAuth, maintenanceController.cleanupInactiveVersions);
maintenanceRouter.post('/maintenance/actions/cleanup-orphans', requireAuth, maintenanceController.cleanupOrphans);
maintenanceRouter.post('/maintenance/actions/delete-raw-assets', requireAuth, maintenanceController.deleteRawAssets);
