import fs from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { TargetConfigSchema } from '@clip/shared';
import { batchService } from '../services/batch.service.js';
import { sendServiceResult } from '../utils/http.js';
import { renderQueueWorker, type BatchProgressEvent } from '../workers/render-queue.worker.js';

const StartBatchBodySchema = z.object({
  targetConfig: TargetConfigSchema,
  targetProfileId: z.string().nullable().optional()
});

export const batchController = {
  async estimate(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = TargetConfigSchema.parse(req.body?.targetConfig ?? req.body);
      const result = await batchService.estimate(req.user!.sub, String(req.params.id), parsed);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async start(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = StartBatchBodySchema.parse(req.body);
      const result = await batchService.startBatch(
        req.user!.sub,
        String(req.params.id),
        parsed.targetConfig,
        parsed.targetProfileId
      );
      sendServiceResult(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async detail(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await batchService.getBatchDetail(req.user!.sub, String(req.params.batchId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async streamProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const batchId = String(req.params.batchId);
      const check = await batchService.getBatchDetail(req.user!.sub, batchId);
      if (!check.ok) {
        sendServiceResult(res, check);
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const writeEvent = (payload: unknown) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      const initialData = check.data as {
        status: string;
        latestJob?: { progressPct: number; stageLabel: string; errorMessage: string | null } | null;
      };
      writeEvent({
        batchId,
        status: initialData.status,
        progressPct: initialData.latestJob?.progressPct ?? (initialData.status === 'completed' ? 100 : 0),
        stageLabel: initialData.latestJob?.stageLabel ?? 'Menghubungkan status batch...',
        errorMessage: initialData.latestJob?.errorMessage ?? null,
        timestamp: new Date().toISOString()
      });

      const listener = (ev: BatchProgressEvent) => {
        writeEvent(ev);
      };

      const heartbeat = setInterval(() => {
        res.write(': ping\n\n');
      }, 15000);

      renderQueueWorker.bus.on(`batch:${batchId}`, listener);
      req.on('close', () => {
        clearInterval(heartbeat);
        renderQueueWorker.bus.off(`batch:${batchId}`, listener);
        res.end();
      });
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await batchService.cancelBatch(req.user!.sub, String(req.params.batchId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async retryClip(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await batchService.retryClip(req.user!.sub, String(req.params.clipId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async streamVideo(req: Request, res: Response, next: NextFunction) {
    try {
      const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
      const resolved = await batchService.resolveClipMediaFile(
        req.user!.sub,
        String(req.params.clipId),
        'video',
        versionId
      );
      if (!resolved.ok) {
        sendServiceResult(res, resolved);
        return;
      }

      const { absPath, sizeBytes, contentType, filename } = resolved.data;
      const download = req.query.download === 'true';
      if (download) {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? Math.min(parseInt(parts[1], 10), sizeBytes - 1) : sizeBytes - 1;
        if (Number.isNaN(start) || start < 0 || start >= sizeBytes || end < start) {
          res.status(416).setHeader('Content-Range', `bytes */${sizeBytes}`).end();
          return;
        }
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${sizeBytes}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType
        });
        fs.createReadStream(absPath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, {
        'Content-Length': sizeBytes,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType
      });
      fs.createReadStream(absPath).pipe(res);
    } catch (err) {
      next(err);
    }
  },

  async serveCover(req: Request, res: Response, next: NextFunction) {
    try {
      const versionId = typeof req.query.versionId === 'string' ? req.query.versionId : undefined;
      const resolved = await batchService.resolveClipMediaFile(
        req.user!.sub,
        String(req.params.clipId),
        'cover',
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
  }
};
