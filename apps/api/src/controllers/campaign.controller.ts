import type { NextFunction, Request, Response } from 'express';
import {
  CreateCampaignInputSchema,
  UpdateBriefRulebookInputSchema,
  UpdateCampaignInputSchema
} from '@clip/shared';
import { campaignService } from '../services/campaign.service.js';
import { sendServiceResult } from '../utils/http.js';

export const campaignController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await campaignService.listCampaigns(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async detail(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await campaignService.getCampaignDetail(req.user!.sub, String(req.params.id));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = CreateCampaignInputSchema.parse(req.body);
      const result = await campaignService.createCampaign(req.user!.sub, parsed);
      sendServiceResult(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = UpdateCampaignInputSchema.parse(req.body);
      const result = await campaignService.updateCampaign(req.user!.sub, String(req.params.id), parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await campaignService.deleteCampaign(req.user!.sub, String(req.params.id));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async uploadBrief(req: Request, res: Response, next: NextFunction) {
    try {
      const pastedText = typeof req.body?.pastedText === 'string' ? req.body.pastedText : undefined;
      const file = req.file ? { originalname: req.file.originalname, buffer: req.file.buffer } : undefined;
      const result = await campaignService.uploadOrParseBrief({
        userId: req.user!.sub,
        campaignId: String(req.params.id),
        file,
        pastedText
      });
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async updateBrief(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = UpdateBriefRulebookInputSchema.parse(req.body);
      const result = await campaignService.updateBriefRulebook(req.user!.sub, String(req.params.id), parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
