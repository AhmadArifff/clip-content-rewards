import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { clipService } from '../services/clip.service.js';
import { sendServiceResult } from '../utils/http.js';

const RegenerateBodySchema = z.object({
  userPrompt: z.string().max(1500).default(''),
  presetCodes: z.array(z.string()).default([]),
  subtitleOverrides: z.array(z.object({ index: z.number().int().min(0), text: z.string() })).optional()
});

const ActiveVersionBodySchema = z.object({
  versionId: z.string().min(1)
});

const ApproveBodySchema = z.object({
  isApproved: z.boolean()
});

export const clipController = {
  async detail(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await clipService.getClipDetail(req.user!.sub, String(req.params.clipId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async regenerate(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = RegenerateBodySchema.parse(req.body);
      if (!parsed.userPrompt.trim() && parsed.presetCodes.length === 0 && !parsed.subtitleOverrides?.length) {
        sendServiceResult(res, {
          ok: false,
          code: 'EMPTY_REGENERATE_INSTRUCTION',
          message: 'Tuliskan prompt penyesuaian atau pilih minimal 1 preset perbaikan.',
          statusCode: 400
        });
        return;
      }
      const result = await clipService.regenerateClip(req.user!.sub, String(req.params.clipId), parsed);
      sendServiceResult(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async setActiveVersion(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = ActiveVersionBodySchema.parse(req.body);
      const result = await clipService.setActiveVersion(req.user!.sub, String(req.params.clipId), parsed.versionId);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async setApproval(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = ApproveBodySchema.parse(req.body);
      const result = await clipService.setApproval(req.user!.sub, String(req.params.clipId), parsed.isApproved);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
