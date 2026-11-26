import type { NextFunction, Request, Response } from 'express';
import {
  CreateMasterPresetInputSchema,
  CreateTargetProfileInputSchema,
  UpdateMasterPresetInputSchema
} from '@clip/shared';
import { presetService } from '../services/preset.service.js';
import { sendServiceResult } from '../utils/http.js';

export const presetController = {
  async listPresets(req: Request, res: Response, next: NextFunction) {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const onlyActive = req.query.active === 'true';
      const result = await presetService.listPresets(category, onlyActive);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async createPreset(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = CreateMasterPresetInputSchema.parse(req.body);
      const result = await presetService.createPreset(parsed);
      sendServiceResult(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async updatePreset(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = UpdateMasterPresetInputSchema.parse(req.body);
      const result = await presetService.updatePreset(String(req.params.id), parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async deletePreset(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await presetService.deletePreset(String(req.params.id));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async listTargetProfiles(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await presetService.listTargetProfiles(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async createTargetProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = CreateTargetProfileInputSchema.parse(req.body);
      const result = await presetService.createTargetProfile(req.user!.sub, parsed);
      sendServiceResult(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async deleteTargetProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await presetService.deleteTargetProfile(req.user!.sub, String(req.params.id));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
