import fs from 'node:fs';
import type { ServiceResult, TargetConfig } from '@clip/shared';
import { resolveSafeStoragePath } from '../config/storage.js';
import { batchRepository } from '../repositories/batch.repository.js';
import { campaignRepository } from '../repositories/campaign.repository.js';
import { estimateBatchCost } from './ai/edl-director.service.js';
import { renderQueueWorker } from '../workers/render-queue.worker.js';

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const batchService = {
  async estimate(
    userId: string,
    campaignId: string,
    targetConfig: TargetConfig
  ): Promise<ServiceResult<unknown>> {
    const campaign = await campaignRepository.findDetailForUser(campaignId, userId);
    if (!campaign) {
      return {
        ok: false,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign tidak ditemukan.',
        statusCode: 404
      };
    }

    const rawVideos = campaign.mediaAssets.filter((m) => m.assetType === 'raw_video');
    if (rawVideos.length === 0) {
      return {
        ok: false,
        code: 'RAW_VIDEO_REQUIRED',
        message: 'Unggah minimal 1 video mentah sebelum menghitung estimasi atau generate.',
        statusCode: 400
      };
    }

    const firstRaw = rawVideos[0];
    const transcript = safeParse<{ words?: unknown[] } | null>(firstRaw.transcriptJson, null);
    const briefLen = campaign.brief?.rawText.length ?? 200;
    const rulebook = safeParse<{ durationRules?: { idealSec?: number } } | null>(
      campaign.brief?.parsedRulebookJson,
      null
    );

    const est = await estimateBatchCost({
      userId,
      briefTextLength: briefLen,
      transcriptWordCount: transcript?.words?.length ?? 0,
      batchCount: targetConfig.batchCount,
      targetDurationSec: Math.min(firstRaw.durationSec ?? 30, rulebook?.durationRules?.idealSec ?? 30)
    });

    return { ok: true, data: est };
  },

  async startBatch(
    userId: string,
    campaignId: string,
    targetConfig: TargetConfig,
    targetProfileId?: string | null
  ): Promise<ServiceResult<unknown>> {
    const campaign = await campaignRepository.findDetailForUser(campaignId, userId);
    if (!campaign) {
      return {
        ok: false,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign tidak ditemukan.',
        statusCode: 404
      };
    }

    const rawVideos = campaign.mediaAssets.filter((m) => m.assetType === 'raw_video');
    if (rawVideos.length === 0) {
      return {
        ok: false,
        code: 'RAW_VIDEO_REQUIRED',
        message: 'Unggah minimal 1 video mentah terlebih dahulu sebelum memulai generate batch.',
        statusCode: 400
      };
    }

    const estRes = await this.estimate(userId, campaignId, targetConfig);
    const estimatedTokens =
      estRes.ok && typeof (estRes.data as { estimatedTotalTokens?: number }).estimatedTotalTokens === 'number'
        ? (estRes.data as { estimatedTotalTokens: number }).estimatedTotalTokens
        : null;

    const batch = await batchRepository.createBatch({
      campaignId,
      targetProfileId: targetProfileId ?? null,
      targetConfigJson: JSON.stringify(targetConfig),
      batchDiversityMode: targetConfig.batchDiversityMode,
      requestedCount: targetConfig.batchCount,
      estimatedTokens
    });

    renderQueueWorker.enqueueBatch(batch.id, userId);

    return {
      ok: true,
      data: {
        id: batch.id,
        campaignId: batch.campaignId,
        status: batch.status,
        requestedCount: batch.requestedCount,
        estimatedTokens: batch.estimatedTokens,
        createdAt: batch.createdAt
      }
    };
  },

  async getBatchDetail(userId: string, batchId: string): Promise<ServiceResult<unknown>> {
    const batch = await batchRepository.findBatchDetailForUser(batchId, userId);
    if (!batch) {
      return {
        ok: false,
        code: 'BATCH_NOT_FOUND',
        message: 'Batch generate tidak ditemukan.',
        statusCode: 404
      };
    }

    const entityIds = [batch.id, ...batch.clips.map((c) => c.id)];
    const jobs = await batchRepository.listJobsByEntityIds(entityIds);
    const latestBatchJob = jobs.find((j) => j.entityId === batch.id) ?? null;

    return {
      ok: true,
      data: {
        id: batch.id,
        campaignId: batch.campaignId,
        campaignTitle: batch.campaign.title,
        status: batch.status,
        requestedCount: batch.requestedCount,
        batchDiversityMode: batch.batchDiversityMode,
        estimatedTokens: batch.estimatedTokens,
        actualTokens: batch.actualTokens,
        targetConfig: safeParse<TargetConfig | null>(batch.targetConfigJson, null),
        latestJob: latestBatchJob
          ? {
              status: latestBatchJob.status,
              progressPct: latestBatchJob.progressPct,
              stageLabel: latestBatchJob.stageLabel,
              errorMessage: latestBatchJob.errorMessage
            }
          : null,
        clips: batch.clips.map((c) => {
          const activeVersion =
            c.versions.find((v) => v.id === c.activeVersionId) ?? c.versions[0] ?? null;
          return {
            id: c.id,
            sequenceIndex: c.sequenceIndex,
            angleTitle: c.angleTitle,
            hookSummary: c.hookSummary,
            status: c.status,
            isApproved: c.isApproved,
            errorMessage: c.errorMessage,
            activeVersionId: activeVersion?.id ?? null,
            activeVersion: activeVersion
              ? {
                  id: activeVersion.id,
                  versionNumber: activeVersion.versionNumber,
                  edl: safeParse(activeVersion.edlJson, null),
                  hasVideo: Boolean(activeVersion.outputVideoPath),
                  hasCover: Boolean(activeVersion.coverImagePath),
                  actualDurationSec: activeVersion.actualDurationSec,
                  viralScoreTotal: activeVersion.viralScoreTotal,
                  briefCompliance: activeVersion.briefCompliance,
                  renderDurationMs: activeVersion.renderDurationMs,
                  createdAt: activeVersion.createdAt
                }
              : null,
            versionCount: c.versions.length
          };
        }),
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt
      }
    };
  },

  async cancelBatch(userId: string, batchId: string): Promise<ServiceResult<{ cancelled: boolean }>> {
    const batch = await batchRepository.findBatchDetailForUser(batchId, userId);
    if (!batch) {
      return {
        ok: false,
        code: 'BATCH_NOT_FOUND',
        message: 'Batch generate tidak ditemukan.',
        statusCode: 404
      };
    }

    renderQueueWorker.markBatchCancelled(batch.id);
    await batchRepository.updateBatch(batch.id, { status: 'cancelled' });
    return { ok: true, data: { cancelled: true } };
  },

  async retryClip(userId: string, clipId: string): Promise<ServiceResult<{ queued: boolean; clipId: string }>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    await batchRepository.updateClip(clip.id, { status: 'queued', errorMessage: null });
    renderQueueWorker.enqueueSingleClipRetry(clip.batchId, clip.id);
    return { ok: true, data: { queued: true, clipId: clip.id } };
  },

  async resolveClipMediaFile(
    userId: string,
    clipId: string,
    kind: 'video' | 'cover',
    versionId?: string
  ): Promise<ServiceResult<{ absPath: string; filename: string; contentType: string; sizeBytes: number }>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const ver =
      (versionId ? clip.versions.find((v) => v.id === versionId) : null) ??
      clip.versions.find((v) => v.id === clip.activeVersionId) ??
      clip.versions[0];

    if (!ver) {
      return {
        ok: false,
        code: 'VERSION_NOT_FOUND',
        message: 'Versi klip belum tersedia.',
        statusCode: 404
      };
    }

    const relPath = kind === 'video' ? ver.outputVideoPath : ver.coverImagePath;
    if (!relPath) {
      return {
        ok: false,
        code: 'RENDER_NOT_READY',
        message: 'Berkas hasil render belum tersedia.',
        statusCode: 404
      };
    }

    const absPath = resolveSafeStoragePath(relPath);
    if (!fs.existsSync(absPath)) {
      return {
        ok: false,
        code: 'FILE_MISSING_ON_DISK',
        message: 'Berkas media tidak ditemukan di penyimpanan lokal.',
        statusCode: 404
      };
    }

    const stat = fs.statSync(absPath);
    return {
      ok: true,
      data: {
        absPath,
        filename: kind === 'video' ? `clip-${clip.sequenceIndex}-v${ver.versionNumber}.mp4` : `cover-v${ver.versionNumber}.jpg`,
        contentType: kind === 'video' ? 'video/mp4' : 'image/jpeg',
        sizeBytes: stat.size
      }
    };
  }
};
