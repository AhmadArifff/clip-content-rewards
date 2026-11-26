import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { doctorService } from '../services/doctor.service.js';
import { sendServiceResult } from '../utils/http.js';

export const systemRouter = Router();

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
