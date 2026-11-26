import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { globalErrorHandler } from './middlewares/error.middleware.js';
import { apiKeyRouter } from './routes/api-key.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { presetRouter } from './routes/preset.routes.js';
import { systemRouter } from './routes/system.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));

  app.use('/api', systemRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/api-keys', apiKeyRouter);
  app.use('/api', presetRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: 'NOT_FOUND',
        message: 'Layanan yang diminta tidak ditemukan.'
      }
    });
  });

  app.use(globalErrorHandler);
  return app;
}
