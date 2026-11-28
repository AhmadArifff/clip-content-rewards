import type { NextFunction, Request, Response } from 'express';
import {
  CompleteChunkUploadInputSchema,
  UpdateEmbeddedSubtitleInputSchema
} from '@clip/shared';
import { mediaService } from '../services/media.service.js';
import { sendServiceResult } from '../utils/http.js';

export const mediaController = {
  async uploadChunk(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        sendServiceResult(res, {
          ok: false,
          code: 'CHUNK_FILE_REQUIRED',
          message: 'Potongan berkas tidak ditemukan pada permintaan.',
          statusCode: 400
        });
        return;
      }

      const uploadId = String(req.body?.uploadId ?? '');
      const chunkIndex = Number(req.body?.chunkIndex);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
        sendServiceResult(res, {
          ok: false,
          code: 'INVALID_CHUNK_INDEX',
          message: 'Nomor urutan potongan file tidak valid.',
          statusCode: 400
        });
        return;
      }

      const result = await mediaService.saveUploadChunk({
        userId: req.user!.sub,
        campaignId: String(req.params.id),
        uploadId,
        chunkIndex,
        buffer: req.file.buffer
      });
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async completeUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = CompleteChunkUploadInputSchema.parse(req.body);
      const result = await mediaService.completeChunkedUpload({
        userId: req.user!.sub,
        campaignId: String(req.params.id),
        ...parsed
      });
      sendServiceResult(res, result, 201);
    } catch (err) {
      next(err);
    }
  },

  async transcribe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await mediaService.transcribeAsset(req.user!.sub, String(req.params.mediaId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async detectSubtitle(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await mediaService.detectEmbeddedSubtitle(req.user!.sub, String(req.params.mediaId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async setEmbeddedSubtitle(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = UpdateEmbeddedSubtitleInputSchema.parse(req.body ?? {});
      const result = await mediaService.setEmbeddedSubtitleOverride(
        req.user!.sub,
        String(req.params.mediaId),
        parsed.hasEmbeddedSubtitles
      );
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await mediaService.deleteAsset(req.user!.sub, String(req.params.mediaId));
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
