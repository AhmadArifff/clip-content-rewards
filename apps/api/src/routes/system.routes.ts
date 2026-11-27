import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { doctorService } from '../services/doctor.service.js';
import { sendServiceResult } from '../utils/http.js';

export const systemRouter = Router();

const CleanupBodySchema = z.object({
  includeInactiveVersions: z.boolean().default(false)
});

systemRouter.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: 'clip-content-rewards-api',
      status: 'ok',
      timestamp: new Date().toISOString()
    },
    error: null
  });
});

systemRouter.get('/system/doctor', requireAuth, async (req, res, next) => {
  try {
    const result = await doctorService.runCheck(req.user!.sub);
    sendServiceResult(res, result);
  } catch (err) {
    next(err);
  }
});

systemRouter.get('/system/storage', requireAuth, async (_req, res, next) => {
  try {
    const result = await doctorService.getStorageStats();
    sendServiceResult(res, result);
  } catch (err) {
    next(err);
  }
});

systemRouter.post('/system/cleanup-temp', requireAuth, async (req, res, next) => {
  try {
    const parsed = CleanupBodySchema.parse(req.body ?? {});
    const result = await doctorService.cleanupTemp(req.user!.sub, parsed);
    sendServiceResult(res, result);
  } catch (err) {
    next(err);
  }
});
