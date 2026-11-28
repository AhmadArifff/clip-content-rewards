import type { NextFunction, Request, Response } from 'express';
import {
  CreateClipAnnotationInputSchema,
  UpdateClipAnnotationInputSchema
} from '@clip/shared';
import { annotationService } from '../services/annotation.service.js';
import { sendServiceResult } from '../utils/http.js';

export const annotationController = {
  async listByClip(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await annotationService.listByClip(req.user!.sub, String(req.params.clipId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = CreateClipAnnotationInputSchema.parse(req.body ?? {});
      const result = await annotationService.create(req.user!.sub, String(req.params.clipId), parsed);
      sendServiceResult(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = UpdateClipAnnotationInputSchema.parse(req.body ?? {});
      const result = await annotationService.update(req.user!.sub, String(req.params.annotationId), parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await annotationService.remove(req.user!.sub, String(req.params.annotationId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
