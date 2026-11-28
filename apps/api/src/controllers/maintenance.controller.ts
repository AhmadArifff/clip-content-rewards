import type { NextFunction, Request, Response } from 'express';
import {
  ClipRetentionActionInputSchema,
  MaintenanceBulkClipsInputSchema,
  MaintenanceDeleteRawAssetsInputSchema,
  UpdateRetentionPolicyInputSchema
} from '@clip/shared';
import { maintenanceService } from '../services/maintenance.service.js';
import { sendServiceResult } from '../utils/http.js';

export const maintenanceController = {
  async overview(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await maintenanceService.getOverview(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async alertSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await maintenanceService.getAlertSummary(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async updatePolicy(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = UpdateRetentionPolicyInputSchema.parse(req.body ?? {});
      const result = await maintenanceService.updatePolicy(req.user!.sub, parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async clipRetention(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = ClipRetentionActionInputSchema.parse(req.body ?? {});
      const result = await maintenanceService.updateClipRetention(
        req.user!.sub,
        String(req.params.clipId),
        parsed
      );
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async pruneMedia(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = MaintenanceBulkClipsInputSchema.parse(req.body ?? {});
      const result = await maintenanceService.pruneClipsMedia(req.user!.sub, parsed.clipIds);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async deleteClips(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = MaintenanceBulkClipsInputSchema.parse(req.body ?? {});
      const result = await maintenanceService.deleteClipsPermanently(req.user!.sub, parsed.clipIds);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async cleanupInactiveVersions(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await maintenanceService.cleanupInactiveVersions(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async cleanupOrphans(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await maintenanceService.cleanupOrphansAndFailed(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async deleteRawAssets(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = MaintenanceDeleteRawAssetsInputSchema.parse(req.body ?? {});
      const result = await maintenanceService.deleteRawAssets(req.user!.sub, parsed.mediaAssetIds);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
