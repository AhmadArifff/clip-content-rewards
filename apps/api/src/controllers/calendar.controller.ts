import type { NextFunction, Request, Response } from 'express';
import { AutoScheduleInputSchema, UpdateClipScheduleInputSchema } from '@clip/shared';
import { calendarService, type CalendarFilterInput } from '../services/calendar.service.js';
import { streamXlsxWorkbook } from '../services/export/xlsx-report.builder.js';
import { sendServiceResult } from '../utils/http.js';

function parseCalendarFilters(query: Request['query']): CalendarFilterInput {
  const minScoreRaw = typeof query.minScore === 'string' ? Number.parseInt(query.minScore, 10) : undefined;
  return {
    campaignId: typeof query.campaignId === 'string' && query.campaignId ? query.campaignId : undefined,
    batchId: typeof query.batchId === 'string' && query.batchId ? query.batchId : undefined,
    platform: typeof query.platform === 'string' && query.platform ? query.platform : undefined,
    publishStatus: typeof query.publishStatus === 'string' && query.publishStatus ? query.publishStatus : undefined,
    onlyApproved: query.onlyApproved === 'true',
    minScore: typeof minScoreRaw === 'number' && !Number.isNaN(minScoreRaw) ? minScoreRaw : undefined
  };
}

export const calendarController = {
  async overview(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = parseCalendarFilters(req.query);
      const result = await calendarService.getCalendarOverview(req.user!.sub, filters);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async updateSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = UpdateClipScheduleInputSchema.parse(req.body ?? {});
      const result = await calendarService.updateClipSchedule(req.user!.sub, String(req.params.clipId), parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async autoSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = AutoScheduleInputSchema.parse(req.body ?? {});
      const result = await calendarService.autoScheduleClips(req.user!.sub, parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async exportExcel(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = parseCalendarFilters(req.query);
      const prep = await calendarService.prepareExcelExport(req.user!.sub, filters);
      if (!prep.ok) {
        sendServiceResult(res, prep);
        return;
      }

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${prep.data.filename}"`);
      res.setHeader('Cache-Control', 'no-store');

      await streamXlsxWorkbook(prep.data.sheets, res);
    } catch (err) {
      if (!res.headersSent) {
        next(err);
      } else {
        res.end();
      }
    }
  }
};
