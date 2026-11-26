import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { CreateApiKeyInputSchema } from '@clip/shared';
import { apiKeyService } from '../services/api-key.service.js';
import { sendServiceResult } from '../utils/http.js';

const ToggleActiveSchema = z.object({
  isActive: z.boolean()
});

export const apiKeyController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await apiKeyService.listKeys(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = CreateApiKeyInputSchema.parse(req.body);
      const result = await apiKeyService.createKey(req.user!.sub, parsed);
      sendServiceResult(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await apiKeyService.testConnection(req.user!.sub, String(req.params.id));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async toggle(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = ToggleActiveSchema.parse(req.body);
      const result = await apiKeyService.toggleActive(req.user!.sub, String(req.params.id), parsed.isActive);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await apiKeyService.deleteKey(req.user!.sub, String(req.params.id));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
