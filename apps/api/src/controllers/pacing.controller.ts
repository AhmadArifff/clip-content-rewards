import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { pacingService } from '../services/pacing.service.js';
import { sendServiceResult } from '../utils/http.js';

export const pacingController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await pacingService.list(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async analyze(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      if (!file) {
        sendServiceResult(res, {
          ok: false,
          code: 'REFERENCE_VIDEO_REQUIRED',
          message: 'Unggah 1 berkas video referensi (.mp4, .mov, .mkv, atau .webm) untuk dianalisis.',
          statusCode: 400
        });
        return;
      }

      const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
      const result = await pacingService.analyzeAndSave(req.user!.sub, {
        name,
        originalFilename: file.originalname,
        tempFilePath: file.path
      });
      sendServiceResult(res, result, 201);
    } catch (err) {
      if (req.file?.path) {
        fs.rmSync(req.file.path, { force: true });
      }
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await pacingService.remove(req.user!.sub, String(req.params.id));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
