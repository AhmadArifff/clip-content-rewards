import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { EdlSchema } from '@clip/shared';
import { z } from 'zod';
import { clipService } from '../services/clip.service.js';
import { sendServiceResult } from '../utils/http.js';

const RegenerateBodySchema = z.object({
  userPrompt: z.string().max(1500).default(''),
  presetCodes: z.array(z.string()).default([]),
  subtitleOverrides: z.array(z.object({ index: z.number().int().min(0), text: z.string() })).optional()
});

const RenderEdlBodySchema = z.object({
  edl: EdlSchema,
  note: z.string().max(300).optional()
});

const ActiveVersionBodySchema = z.object({
  versionId: z.string().min(1)
});

const ApproveBodySchema = z.object({
  isApproved: z.boolean()
});

const AutoTrackBodySchema = z.object({
  segments: z
    .array(
      z.object({
        mediaAssetId: z.string().min(1),
        startSec: z.number().min(0),
        endSec: z.number().positive()
      })
    )
    .optional()
});

const SetCoverBodySchema = z.object({
  versionId: z.string().min(1).optional(),
  timestampSec: z.number().min(0)
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

  async renderEdl(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = RenderEdlBodySchema.parse(req.body);
      const result = await clipService.renderCustomEdl(req.user!.sub, String(req.params.clipId), parsed);
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
  },

  async autoTrackCrop(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = AutoTrackBodySchema.parse(req.body ?? {});
      const result = await clipService.autoTrackCrop(req.user!.sub, String(req.params.clipId), parsed.segments);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async coverCandidates(req: Request, res: Response, next: NextFunction) {
    try {
      const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
      const result = await clipService.getCoverCandidates(req.user!.sub, String(req.params.clipId), versionId);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async serveCoverCandidate(req: Request, res: Response, next: NextFunction) {
    try {
      const idx = Number.parseInt(String(req.params.idx), 10);
      const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
      const resolved = await clipService.resolveCoverCandidateFile(
        req.user!.sub,
        String(req.params.clipId),
        idx,
        versionId
      );
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

  async setCover(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = SetCoverBodySchema.parse(req.body);
      const result = await clipService.setCoverFrame(req.user!.sub, String(req.params.clipId), parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
