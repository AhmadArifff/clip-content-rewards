import { ZipArchive } from 'archiver';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { exportService } from '../services/export.service.js';
import { sendServiceResult } from '../utils/http.js';

const SingleDownloadQuerySchema = z.object({
  type: z.enum(['mp4', 'playbook', 'srt', 'cover']).default('mp4'),
  versionId: z.string().optional()
});

const BatchExportZipBodySchema = z.object({
  filter: z.enum(['all', 'approved', 'high_score', 'selected']).default('all'),
  minScore: z.number().int().min(0).max(100).optional(),
  clipIds: z.array(z.string()).optional()
});

export const exportController = {
  async downloadSingle(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = SingleDownloadQuerySchema.parse(req.query);
      const result = await exportService.resolveSingleClipDownload(
        req.user!.sub,
        String(req.params.clipId),
        parsed.type,
        parsed.versionId
      );

      if (!result.ok) {
        sendServiceResult(res, result);
        return;
      }

      res.setHeader('Content-Type', result.data.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.data.filename}"`);

      if (result.data.kind === 'buffer') {
        res.send(result.data.buffer);
        return;
      }

      res.sendFile(result.data.absPath);
    } catch (err) {
      next(err);
    }
  },

  async exportBatchZip(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = BatchExportZipBodySchema.parse(req.body ?? {});
      const planRes = await exportService.prepareBatchZipExport(
        req.user!.sub,
        String(req.params.batchId),
        parsed
      );

      if (!planRes.ok) {
        sendServiceResult(res, planRes);
        return;
      }

      const plan = planRes.data;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${plan.zipFilename}"`);

      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.on('error', (archiveErr) => {
        if (!res.headersSent) {
          next(archiveErr);
        } else {
          res.end();
        }
      });

      archive.pipe(res);
      archive.append(plan.summaryMarkdown, {
        name: '00-RINGKASAN-CAMPAIGN-DAN-JADWAL-UPLOAD.md'
      });

      for (const item of plan.entries) {
        // MP4 & JPG sudah terkompresi -> store: true mencegah CPU spike & double compression
        archive.file(item.videoAbsPath, {
          name: `${item.folderName}/video-ready-upload.mp4`,
          store: true
        });
        archive.append(item.playbookText, {
          name: `${item.folderName}/upload-playbook.txt`
        });
        if (item.srtAbsPath) {
          archive.file(item.srtAbsPath, {
            name: `${item.folderName}/subtitles.srt`
          });
        }
        if (item.coverAbsPath) {
          archive.file(item.coverAbsPath, {
            name: `${item.folderName}/cover.jpg`,
            store: true
          });
        }
      }

      await archive.finalize();
    } catch (err) {
      next(err);
    }
  }
};
