import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { CreateBrandKitInputSchema, UpdateBrandKitInputSchema } from '@clip/shared';
import { brandKitService } from '../services/brand-kit.service.js';
import { sendServiceResult } from '../utils/http.js';

export const brandKitController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await brandKitService.list(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = CreateBrandKitInputSchema.parse(req.body ?? {});
      const result = await brandKitService.create(req.user!.sub, parsed);
      sendServiceResult(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = UpdateBrandKitInputSchema.parse(req.body ?? {});
      const result = await brandKitService.update(req.user!.sub, String(req.params.kitId), parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async uploadLogo(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      if (!file) {
        sendServiceResult(res, {
          ok: false,
          code: 'MISSING_LOGO_FILE',
          message: 'Pilih berkas gambar logo (PNG/JPG/WebP) terlebih dahulu.',
          statusCode: 400
        });
        return;
      }
      const result = await brandKitService.uploadLogo(req.user!.sub, String(req.params.kitId), {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname
      });
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async serveLogo(req: Request, res: Response, next: NextFunction) {
    try {
      const resolved = await brandKitService.resolveLogoFile(req.user!.sub, String(req.params.kitId));
      if (!resolved.ok) {
        sendServiceResult(res, resolved);
        return;
      }
      res.setHeader('Content-Type', resolved.data.contentType);
      res.setHeader('Content-Length', String(resolved.data.sizeBytes));
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(resolved.data.absPath).pipe(res);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await brandKitService.remove(req.user!.sub, String(req.params.kitId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
