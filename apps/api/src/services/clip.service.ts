import fs from 'node:fs';
import path from 'node:path';
import {
  EdlSchema,
  type BriefRulebook,
  type CoverDownloadFormat,
  type CriticRoleId,
  type EdlDocument,
  type ServiceResult,
  type TargetConfig,
  type TranscriptPayload,
  type WordTimestamp
} from '@clip/shared';
import { resolveSafeStoragePath } from '../config/storage.js';
import { prisma } from '../config/prisma.js';
import { batchRepository } from '../repositories/batch.repository.js';
import { generateCriticCouncilReview } from './ai/critic-council.service.js';
import { planEdlPatchWithPrompt, type SubtitleOverrideInput } from './ai/edl-patcher.service.js';
import { evaluateClipVersion } from './ai/viral-evaluator.service.js';
import { brandKitService } from './brand-kit.service.js';
import { buildTimedCuesFromEdl } from './media/ass-subtitle.builder.js';
import { renderEdlToMp4, type RenderMediaSource } from './media/edl-renderer.service.js';
import { parseAudioDiagnosticSafe } from './media/embedded-caption-detector.service.js';
import {
  analyzeSubjectFocusTrack,
  extractAndRankCoverCandidates,
  extractCoverAtTimestamp,
  extractCoverVariantAtTimestamp,
  type SegmentFocusResult
} from './media/vision-tracker.service.js';

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const clipService = {
  async getClipDetail(userId: string, clipId: string): Promise<ServiceResult<unknown>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const targetConfig = safeJson<TargetConfig | null>(clip.batch.targetConfigJson, null);
    const shouldSkipEmbedded = (targetConfig?.captionOverlapMode ?? 'auto_skip_embedded') !== 'force_show';
    const wordsByMediaId: Record<string, WordTimestamp[]> = {};
    const skipCaptionMediaIds = new Set<string>();
    for (const m of clip.batch.campaign.mediaAssets) {
      if (m.assetType === 'raw_video') {
        if (m.transcriptJson) {
          const t = safeJson<TranscriptPayload | null>(m.transcriptJson, null);
          wordsByMediaId[m.id] = t?.words ?? [];
        }
        const diag = parseAudioDiagnosticSafe(m.audioDiagnosticJson, m.hasAudio);
        if (shouldSkipEmbedded && diag.hasEmbeddedSubtitles) {
          skipCaptionMediaIds.add(m.id);
        }
      }
    }

    const versions = clip.versions.map((v) => {
      const edl = safeJson<EdlDocument | null>(v.edlJson, null);
      const cues = edl
        ? buildTimedCuesFromEdl(edl, wordsByMediaId, v.actualDurationSec ?? 30, { skipCaptionMediaIds })
        : [];
      const impactCritique = safeJson<{
        briefChecklist?: unknown[];
        projectedImpact?: unknown;
        critiques?: unknown[];
      } | null>(v.impactCritiqueJson, null);

      return {
        id: v.id,
        versionNumber: v.versionNumber,
        userPrompt: v.userPrompt,
        appliedPresets: safeJson<string[]>(v.appliedPresetsJson, []),
        edl,
        cues,
        hasVideo: Boolean(v.outputVideoPath),
        hasSrt: Boolean(v.outputSrtPath),
        hasCover: Boolean(v.coverImagePath),
        actualDurationSec: v.actualDurationSec,
        viralScoreTotal: v.viralScoreTotal,
        briefCompliance: v.briefCompliance,
        scoreBreakdown: safeJson(v.scoreBreakdownJson, null),
        briefChecklist: impactCritique?.briefChecklist ?? [],
        projectedImpact: impactCritique?.projectedImpact ?? null,
        critiques: impactCritique?.critiques ?? [],
        uploadPlaybook: safeJson(v.uploadPlaybookJson, null),
        renderDurationMs: v.renderDurationMs,
        createdAt: v.createdAt
      };
    });

    const activeVersion = versions.find((v) => v.id === clip.activeVersionId) ?? versions[0] ?? null;

    const sourceMediaList = clip.batch.campaign.mediaAssets
      .filter((m) => m.assetType === 'raw_video')
      .map((m) => {
        const diag = parseAudioDiagnosticSafe(m.audioDiagnosticJson, m.hasAudio);
        return {
          id: m.id,
          originalFilename: m.originalFilename,
          durationSec: m.durationSec ?? 5,
          width: m.width,
          height: m.height,
          hasAudio: m.hasAudio,
          hasEmbeddedSubtitles: Boolean(diag.hasEmbeddedSubtitles)
        };
      });

    // Catat interaksi inspeksi terbaru untuk sinyal retensi M18
    const inspectedAt = new Date();
    await prisma.clip.update({
      where: { id: clip.id },
      data: { lastInspectedAt: inspectedAt }
    }).catch(() => {});

    return {
      ok: true,
      data: {
        id: clip.id,
        batchId: clip.batchId,
        campaignId: clip.batch.campaignId,
        campaignTitle: clip.batch.campaign.title,
        sequenceIndex: clip.sequenceIndex,
        angleTitle: clip.angleTitle,
        hookSummary: clip.hookSummary,
        status: clip.status,
        isApproved: clip.isApproved,
        publishStatus: clip.publishStatus,
        lastInspectedAt: inspectedAt.toISOString(),
        lastDownloadedAt: clip.lastDownloadedAt ? clip.lastDownloadedAt.toISOString() : null,
        downloadCount: clip.downloadCount,
        retentionProtected: clip.retentionProtected,
        snoozedUntil: clip.snoozedUntil ? clip.snoozedUntil.toISOString() : null,
        mediaPrunedAt: clip.mediaPrunedAt ? clip.mediaPrunedAt.toISOString() : null,
        activeVersionId: activeVersion?.id ?? null,
        targetConfig,
        sourceMediaList,
        activeVersion,
        versions
      }
    };
  },

  async regenerateClip(
    userId: string,
    clipId: string,
    input: {
      userPrompt: string;
      presetCodes: string[];
      subtitleOverrides?: SubtitleOverrideInput[];
    }
  ): Promise<ServiceResult<unknown>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const baseVer = clip.versions.find((v) => v.id === clip.activeVersionId) ?? clip.versions[0];
    if (!baseVer) {
      return {
        ok: false,
        code: 'BASE_VERSION_MISSING',
        message: 'Versi dasar klip belum tersedia untuk diedit ulang.',
        statusCode: 400
      };
    }

    const currentEdl = EdlSchema.parse(JSON.parse(baseVer.edlJson));
    const targetConfig = JSON.parse(clip.batch.targetConfigJson) as TargetConfig;
    const rulebook = clip.batch.campaign.brief?.parsedRulebookJson
      ? (JSON.parse(clip.batch.campaign.brief.parsedRulebookJson) as BriefRulebook)
      : null;

    const sources: RenderMediaSource[] = [];
    const availableSources: Array<{ id: string; originalFilename: string; durationSec: number }> = [];
    const watermarkPathById = new Map<string, string>();
    for (const m of clip.batch.campaign.mediaAssets) {
      if (m.assetType === 'watermark') {
        watermarkPathById.set(m.id, m.filePath);
      } else if (m.assetType === 'raw_video') {
        const tr = safeJson<TranscriptPayload | null>(m.transcriptJson, null);
        const diag = parseAudioDiagnosticSafe(m.audioDiagnosticJson, m.hasAudio);
        sources.push({
          id: m.id,
          filePath: m.filePath,
          durationSec: m.durationSec ?? 5,
          hasAudio: m.hasAudio,
          words: tr?.words ?? [],
          hasEmbeddedSubtitles: Boolean(diag.hasEmbeddedSubtitles)
        });
        availableSources.push({
          id: m.id,
          originalFilename: m.originalFilename,
          durationSec: m.durationSec ?? 5
        });
      }
    }

    const planned = await planEdlPatchWithPrompt({
      userId,
      currentEdl,
      userPrompt: input.userPrompt,
      presetCodes: input.presetCodes,
      subtitleOverrides: input.subtitleOverrides,
      targetConfig,
      rulebook,
      availableSources
    });

    if (!planned.hasEffectiveChange) {
      return {
        ok: false,
        code: 'PATCH_NO_EFFECTIVE_CHANGE',
        message:
          'Prompt belum menghasilkan perubahan nyata pada video (audio, segmen, warna, framing, hook, atau subtitle masih identik). Perjelas instruksi atau gunakan saran Dewan Kritikus / Preset Cepat.',
        statusCode: 422,
        details: {
          patchSummary: planned.patch.humanSummary,
          hallucinationWarnings: planned.hallucinationWarnings
        }
      };
    }

    const { patch, patchedEdl } = planned;
    const nextVersionNumber = Math.max(...clip.versions.map((v) => v.versionNumber), 0) + 1;

    const wmId = patchedEdl.supportingOverlays.watermarkAssetId;
    let watermarkRelPath = wmId ? watermarkPathById.get(wmId) ?? null : null;
    if (!watermarkRelPath && patchedEdl.supportingOverlays.brandKitId) {
      const kit = await brandKitService.findRawForUser(userId, patchedEdl.supportingOverlays.brandKitId);
      watermarkRelPath = kit?.logoFilePath ?? null;
    }

    const rendered = await renderEdlToMp4({
      batchId: clip.batchId,
      clipId: clip.id,
      versionNumber: nextVersionNumber,
      edl: patchedEdl,
      sources,
      watermarkRelPath,
      skipEmbeddedSubtitles: (targetConfig.captionOverlapMode ?? 'auto_skip_embedded') !== 'force_show'
    });

    const { evaluation, playbook } = await evaluateClipVersion({
      userId,
      edl: rendered.clampedEdl,
      actualDurationSec: rendered.actualDurationSec,
      rulebook,
      targetConfig,
      angleTitle: clip.angleTitle,
      hookSummary: rendered.clampedEdl.hookBanner.text || clip.hookSummary || ''
    });

    const newVer = await batchRepository.createClipVersion({
      clipId: clip.id,
      versionNumber: nextVersionNumber,
      userPrompt: input.userPrompt || patch.humanSummary,
      appliedPresetsJson: JSON.stringify(input.presetCodes),
      edlJson: JSON.stringify(rendered.clampedEdl),
      outputVideoPath: rendered.outputVideoRelPath,
      outputSrtPath: rendered.outputSrtRelPath,
      outputAssPath: rendered.outputAssRelPath,
      coverImagePath: rendered.coverImageRelPath,
      actualDurationSec: rendered.actualDurationSec,
      viralScoreTotal: evaluation.totalScore,
      briefCompliance: evaluation.briefComplianceStatus,
      scoreBreakdownJson: JSON.stringify(evaluation.dimensions),
      impactCritiqueJson: JSON.stringify({
        briefChecklist: evaluation.briefChecklist,
        projectedImpact: evaluation.projectedImpact,
        critiques: evaluation.critiques
      }),
      uploadPlaybookJson: JSON.stringify(playbook),
      renderDurationMs: rendered.renderDurationMs
    });

    await batchRepository.updateClip(clip.id, { activeVersionId: newVer.id, status: 'ready' });

    const detail = await this.getClipDetail(userId, clip.id);
    if (!detail.ok) return detail;

    return {
      ok: true,
      data: {
        patchSummary: patch.humanSummary,
        patchMode: planned.mode,
        appliedChanges: planned.appliedChanges,
        hallucinationWarnings: planned.hallucinationWarnings,
        newVersionId: newVer.id,
        newVersionNumber: nextVersionNumber,
        clip: detail.data
      }
    };
  },

  async previewRegeneratePatch(
    userId: string,
    clipId: string,
    input: {
      userPrompt: string;
      presetCodes: string[];
      subtitleOverrides?: SubtitleOverrideInput[];
    }
  ): Promise<ServiceResult<unknown>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const baseVer = clip.versions.find((v) => v.id === clip.activeVersionId) ?? clip.versions[0];
    if (!baseVer) {
      return {
        ok: false,
        code: 'BASE_VERSION_MISSING',
        message: 'Versi dasar klip belum tersedia untuk diperiksa.',
        statusCode: 400
      };
    }

    const currentEdl = EdlSchema.parse(JSON.parse(baseVer.edlJson));
    const targetConfig = JSON.parse(clip.batch.targetConfigJson) as TargetConfig;
    const rulebook = clip.batch.campaign.brief?.parsedRulebookJson
      ? (JSON.parse(clip.batch.campaign.brief.parsedRulebookJson) as BriefRulebook)
      : null;

    const availableSources = clip.batch.campaign.mediaAssets
      .filter((m) => m.assetType === 'raw_video')
      .map((m) => ({
        id: m.id,
        originalFilename: m.originalFilename,
        durationSec: m.durationSec ?? 5
      }));

    const planned = await planEdlPatchWithPrompt({
      userId,
      currentEdl,
      userPrompt: input.userPrompt,
      presetCodes: input.presetCodes,
      subtitleOverrides: input.subtitleOverrides,
      targetConfig,
      rulebook,
      availableSources
    });

    return {
      ok: true,
      data: {
        patchSummary: planned.patch.humanSummary,
        patchMode: planned.mode,
        hasEffectiveChange: planned.hasEffectiveChange,
        appliedChanges: planned.appliedChanges,
        hallucinationWarnings: planned.hallucinationWarnings
      }
    };
  },

  async runCriticReview(
    userId: string,
    clipId: string,
    input: {
      versionId?: string;
      roleIds: CriticRoleId[];
      focusNote?: string;
    }
  ): Promise<ServiceResult<unknown>> {
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
      (input.versionId ? clip.versions.find((v) => v.id === input.versionId) : null) ??
      clip.versions.find((v) => v.id === clip.activeVersionId) ??
      clip.versions[0];

    if (!ver) {
      return {
        ok: false,
        code: 'VERSION_NOT_FOUND',
        message: 'Versi klip tidak ditemukan untuk dibedah kritikus.',
        statusCode: 404
      };
    }

    const edl = EdlSchema.parse(JSON.parse(ver.edlJson));
    const targetConfig = JSON.parse(clip.batch.targetConfigJson) as TargetConfig;
    const rulebook = clip.batch.campaign.brief?.parsedRulebookJson
      ? (JSON.parse(clip.batch.campaign.brief.parsedRulebookJson) as BriefRulebook)
      : null;

    const wordsByMediaId: Record<string, WordTimestamp[]> = {};
    const sourceFilenamesById: Record<string, string> = {};
    const skipCaptionMediaIds = new Set<string>();
    const shouldSkipEmbedded = (targetConfig.captionOverlapMode ?? 'auto_skip_embedded') !== 'force_show';

    for (const m of clip.batch.campaign.mediaAssets) {
      if (m.assetType === 'raw_video') {
        sourceFilenamesById[m.id] = m.originalFilename;
        if (m.transcriptJson) {
          const t = safeJson<TranscriptPayload | null>(m.transcriptJson, null);
          wordsByMediaId[m.id] = t?.words ?? [];
        }
        const diag = parseAudioDiagnosticSafe(m.audioDiagnosticJson, m.hasAudio);
        if (shouldSkipEmbedded && diag.hasEmbeddedSubtitles) {
          skipCaptionMediaIds.add(m.id);
        }
      }
    }

    const actualDurationSec = ver.actualDurationSec ?? 15;
    const cues = buildTimedCuesFromEdl(edl, wordsByMediaId, actualDurationSec, { skipCaptionMediaIds });

    const review = await generateCriticCouncilReview({
      userId,
      clipId: clip.id,
      angleTitle: clip.angleTitle,
      hookSummary: clip.hookSummary ?? '',
      edl,
      actualDurationSec,
      outputVideoRelPath: ver.outputVideoPath,
      cues,
      targetConfig,
      rulebook,
      sourceFilenamesById,
      viralScoreTotal: ver.viralScoreTotal,
      roleIds: input.roleIds,
      focusNote: input.focusNote
    });

    return { ok: true, data: review };
  },

  async renderCustomEdl(
    userId: string,
    clipId: string,
    input: { edl: EdlDocument; note?: string }
  ): Promise<ServiceResult<unknown>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const validatedEdl = EdlSchema.parse(input.edl);
    const targetConfig = JSON.parse(clip.batch.targetConfigJson) as TargetConfig;
    const rulebook = clip.batch.campaign.brief?.parsedRulebookJson
      ? (JSON.parse(clip.batch.campaign.brief.parsedRulebookJson) as BriefRulebook)
      : null;

    const nextVersionNumber = Math.max(...clip.versions.map((v) => v.versionNumber), 0) + 1;

    const sources: RenderMediaSource[] = [];
    const watermarkPathById = new Map<string, string>();
    for (const m of clip.batch.campaign.mediaAssets) {
      if (m.assetType === 'watermark') {
        watermarkPathById.set(m.id, m.filePath);
      } else if (m.assetType === 'raw_video') {
        const tr = safeJson<TranscriptPayload | null>(m.transcriptJson, null);
        const diag = parseAudioDiagnosticSafe(m.audioDiagnosticJson, m.hasAudio);
        sources.push({
          id: m.id,
          filePath: m.filePath,
          durationSec: m.durationSec ?? 5,
          hasAudio: m.hasAudio,
          words: tr?.words ?? [],
          hasEmbeddedSubtitles: Boolean(diag.hasEmbeddedSubtitles)
        });
      }
    }

    if (sources.length === 0) {
      return {
        ok: false,
        code: 'RAW_VIDEO_MISSING',
        message: 'Video mentah sumber tidak ditemukan untuk merender timeline.',
        statusCode: 400
      };
    }

    const wmId = validatedEdl.supportingOverlays.watermarkAssetId;
    let watermarkRelPath = wmId ? watermarkPathById.get(wmId) ?? null : null;
    if (!watermarkRelPath && validatedEdl.supportingOverlays.brandKitId) {
      const kit = await brandKitService.findRawForUser(userId, validatedEdl.supportingOverlays.brandKitId);
      watermarkRelPath = kit?.logoFilePath ?? null;
    }

    const rendered = await renderEdlToMp4({
      batchId: clip.batchId,
      clipId: clip.id,
      versionNumber: nextVersionNumber,
      edl: validatedEdl,
      sources,
      watermarkRelPath,
      skipEmbeddedSubtitles: (targetConfig.captionOverlapMode ?? 'auto_skip_embedded') !== 'force_show'
    });

    const { evaluation, playbook } = await evaluateClipVersion({
      userId,
      edl: rendered.clampedEdl,
      actualDurationSec: rendered.actualDurationSec,
      rulebook,
      targetConfig,
      angleTitle: clip.angleTitle,
      hookSummary: rendered.clampedEdl.hookBanner.text || clip.hookSummary || ''
    });

    const summary =
      input.note?.trim() ||
      `Visual Timeline (${rendered.clampedEdl.segments.length} segmen, ${rendered.actualDurationSec.toFixed(1)}s, audio ${
        rendered.clampedEdl.audio.muteOriginal
          ? 'Mute 0%'
          : `${Math.round(rendered.clampedEdl.audio.originalVolume * 100)}%`
      })`;

    const newVer = await batchRepository.createClipVersion({
      clipId: clip.id,
      versionNumber: nextVersionNumber,
      userPrompt: summary,
      appliedPresetsJson: JSON.stringify(['visual_timeline_editor']),
      edlJson: JSON.stringify(rendered.clampedEdl),
      outputVideoPath: rendered.outputVideoRelPath,
      outputSrtPath: rendered.outputSrtRelPath,
      outputAssPath: rendered.outputAssRelPath,
      coverImagePath: rendered.coverImageRelPath,
      actualDurationSec: rendered.actualDurationSec,
      viralScoreTotal: evaluation.totalScore,
      briefCompliance: evaluation.briefComplianceStatus,
      scoreBreakdownJson: JSON.stringify(evaluation.dimensions),
      impactCritiqueJson: JSON.stringify({
        briefChecklist: evaluation.briefChecklist,
        projectedImpact: evaluation.projectedImpact,
        critiques: evaluation.critiques
      }),
      uploadPlaybookJson: JSON.stringify(playbook),
      renderDurationMs: rendered.renderDurationMs
    });

    await batchRepository.updateClip(clip.id, { activeVersionId: newVer.id, status: 'ready' });

    const detail = await this.getClipDetail(userId, clip.id);
    if (!detail.ok) return detail;

    return {
      ok: true,
      data: {
        summary,
        newVersionId: newVer.id,
        newVersionNumber: nextVersionNumber,
        clip: detail.data
      }
    };
  },

  async setActiveVersion(userId: string, clipId: string, versionId: string): Promise<ServiceResult<unknown>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const exists = clip.versions.some((v) => v.id === versionId);
    if (!exists) {
      return {
        ok: false,
        code: 'VERSION_NOT_FOUND',
        message: 'Versi yang dipilih tidak ditemukan pada klip ini.',
        statusCode: 404
      };
    }

    await batchRepository.updateClip(clip.id, { activeVersionId: versionId });
    return this.getClipDetail(userId, clip.id);
  },

  async setApproval(userId: string, clipId: string, isApproved: boolean): Promise<ServiceResult<unknown>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    await batchRepository.updateClip(clip.id, { isApproved });
    return this.getClipDetail(userId, clip.id);
  },

  async autoTrackCrop(
    userId: string,
    clipId: string,
    inputSegments?: Array<{ mediaAssetId: string; startSec: number; endSec: number }>
  ): Promise<ServiceResult<unknown>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const activeVer = clip.versions.find((v) => v.id === clip.activeVersionId) ?? clip.versions[0];
    const baseEdl = activeVer ? safeJson<EdlDocument | null>(activeVer.edlJson, null) : null;
    const targetSegments =
      inputSegments && inputSegments.length > 0
        ? inputSegments
        : (baseEdl?.segments ?? []).map((s) => ({
            mediaAssetId: s.mediaAssetId,
            startSec: s.startSec,
            endSec: s.endSec
          }));

    if (targetSegments.length === 0) {
      return {
        ok: false,
        code: 'NO_SEGMENTS_TO_TRACK',
        message: 'Belum ada segmen video yang bisa dipindai fokus subjeknya.',
        statusCode: 400
      };
    }

    const rawById = new Map(
      clip.batch.campaign.mediaAssets
        .filter((m) => m.assetType === 'raw_video')
        .map((m) => [m.id, m])
    );

    const grouped = new Map<string, Array<{ origIdx: number; startSec: number; endSec: number }>>();
    targetSegments.forEach((seg, origIdx) => {
      const list = grouped.get(seg.mediaAssetId) ?? [];
      list.push({ origIdx, startSec: seg.startSec, endSec: seg.endSec });
      grouped.set(seg.mediaAssetId, list);
    });

    const results: Array<SegmentFocusResult & { mediaAssetId: string }> = new Array(targetSegments.length);

    for (const [mediaAssetId, group] of grouped.entries()) {
      const asset = rawById.get(mediaAssetId) ?? Array.from(rawById.values())[0];
      if (!asset) {
        return {
          ok: false,
          code: 'RAW_VIDEO_MISSING',
          message: 'Berkas video sumber untuk analisis auto-crop tidak ditemukan.',
          statusCode: 404
        };
      }
      const absPath = resolveSafeStoragePath(asset.filePath);
      if (!fs.existsSync(absPath)) {
        return {
          ok: false,
          code: 'RAW_VIDEO_FILE_MISSING',
          message: 'File video sumber tidak ditemukan di penyimpanan lokal.',
          statusCode: 404
        };
      }

      const tracked = await analyzeSubjectFocusTrack(
        absPath,
        group.map((g) => ({ startSec: g.startSec, endSec: g.endSec }))
      );

      tracked.forEach((tr, i) => {
        const origIdx = group[i].origIdx;
        results[origIdx] = {
          ...tr,
          index: origIdx,
          mediaAssetId
        };
      });
    }

    return {
      ok: true,
      data: {
        clipId: clip.id,
        recommendedFramingMode: 'auto_face_track',
        segments: results
      }
    };
  },

  async getCoverCandidates(
    userId: string,
    clipId: string,
    versionId?: string
  ): Promise<ServiceResult<unknown>> {
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

    if (!ver || !ver.outputVideoPath) {
      return {
        ok: false,
        code: 'RENDERED_VIDEO_NOT_FOUND',
        message: 'Video hasil render untuk versi ini belum tersedia.',
        statusCode: 404
      };
    }

    const absVideoPath = resolveSafeStoragePath(ver.outputVideoPath);
    if (!fs.existsSync(absVideoPath)) {
      return {
        ok: false,
        code: 'RENDERED_VIDEO_FILE_MISSING',
        message: 'Berkas video hasil render tidak ditemukan di penyimpanan lokal.',
        statusCode: 404
      };
    }

    const absDir = path.dirname(absVideoPath);
    const candidates = await extractAndRankCoverCandidates(
      absVideoPath,
      absDir,
      ver.actualDurationSec ?? 5
    );
    const cacheBust = Date.now();

    return {
      ok: true,
      data: {
        clipId: clip.id,
        versionId: ver.id,
        versionNumber: ver.versionNumber,
        candidates: candidates.map((c) => ({
          ...c,
          imageUrl: `/api/clips/${clip.id}/cover-candidate/${c.index}?versionId=${ver.id}&cb=${cacheBust}`,
          downloadHdUrl: `/api/clips/${clip.id}/cover-candidate/${c.index}?versionId=${ver.id}&download=1&format=hd&ts=${c.timestampSec.toFixed(2)}`,
          downloadYtUrl: `/api/clips/${clip.id}/cover-candidate/${c.index}?versionId=${ver.id}&download=1&format=yt16x9&ts=${c.timestampSec.toFixed(2)}`
        }))
      }
    };
  },

  async resolveCoverCandidateFile(
    userId: string,
    clipId: string,
    candidateIdx: number,
    options?: {
      versionId?: string;
      downloadFormat?: CoverDownloadFormat;
      timestampSec?: number;
    }
  ): Promise<ServiceResult<{ absPath: string; sizeBytes: number; contentType: string; downloadFilename?: string }>> {
    if (!Number.isInteger(candidateIdx) || candidateIdx < 0 || candidateIdx > 5) {
      return {
        ok: false,
        code: 'INVALID_CANDIDATE_INDEX',
        message: 'Indeks kandidat cover tidak valid (harus 0 sampai 5).',
        statusCode: 400
      };
    }

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
      (options?.versionId ? clip.versions.find((v) => v.id === options.versionId) : null) ??
      clip.versions.find((v) => v.id === clip.activeVersionId) ??
      clip.versions[0];

    if (!ver || !ver.outputVideoPath) {
      return {
        ok: false,
        code: 'RENDERED_VIDEO_NOT_FOUND',
        message: 'Versi video tidak ditemukan.',
        statusCode: 404
      };
    }

    const relDir = path.posix.dirname(ver.outputVideoPath.replace(/\\/g, '/'));

    // Mode unduh Full HD atau Thumbnail YouTube 16:9 (1280x720) langsung diekstrak tajam dari video.mp4
    if (options?.downloadFormat) {
      const absVideoPath = resolveSafeStoragePath(ver.outputVideoPath);
      if (!fs.existsSync(absVideoPath)) {
        return {
          ok: false,
          code: 'RENDERED_VIDEO_FILE_MISSING',
          message: 'Berkas video hasil render tidak ditemukan untuk mengekstrak cover HD.',
          statusCode: 404
        };
      }

      let targetTs = typeof options.timestampSec === 'number' && Number.isFinite(options.timestampSec)
        ? options.timestampSec
        : null;

      if (targetTs === null) {
        const metaPath = resolveSafeStoragePath(`${relDir}/cover-candidates.json`);
        if (fs.existsSync(metaPath)) {
          try {
            const list = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Array<{ index: number; timestampSec: number }>;
            const found = list.find((item) => item.index === candidateIdx);
            if (found && Number.isFinite(found.timestampSec)) {
              targetTs = found.timestampSec;
            }
          } catch {
            // Fallback ke rasio durasi
          }
        }
      }

      const dur = Math.max(0.6, ver.actualDurationSec ?? 5);
      if (targetTs === null) {
        const startT = Math.min(0.25, dur * 0.08);
        const endT = Math.max(startT + 0.1, dur - 0.15);
        targetTs = startT + ((endT - startT) * candidateIdx) / 5;
      }
      const clampedTs = Math.round(Math.min(Math.max(0.05, dur - 0.05), Math.max(0.05, targetTs)) * 100) / 100;

      const format = options.downloadFormat;
      const relOut = `${relDir}/cover-cand-${candidateIdx}-${format}.jpg`;
      const absOut = resolveSafeStoragePath(relOut);
      await extractCoverVariantAtTimestamp({
        absVideoPath,
        absCoverOutPath: absOut,
        timestampSec: clampedTs,
        format
      });

      const stat = fs.statSync(absOut);
      const tsTag = `${clampedTs.toFixed(1).replace('.', '_')}s`;
      const downloadFilename =
        format === 'yt16x9'
          ? `yt-thumbnail-klip${clip.sequenceIndex}-v${ver.versionNumber}-${tsTag}-1280x720.jpg`
          : `cover-klip${clip.sequenceIndex}-v${ver.versionNumber}-${tsTag}-hd.jpg`;

      return {
        ok: true,
        data: {
          absPath: absOut,
          sizeBytes: stat.size,
          contentType: 'image/jpeg',
          downloadFilename
        }
      };
    }

    const relThumb = `${relDir}/cover-cand-${candidateIdx}.jpg`;
    const absPath = resolveSafeStoragePath(relThumb);
    if (!fs.existsSync(absPath)) {
      return {
        ok: false,
        code: 'COVER_CANDIDATE_NOT_FOUND',
        message: 'Thumbnail kandidat cover belum dipindai.',
        statusCode: 404
      };
    }

    const stat = fs.statSync(absPath);
    return {
      ok: true,
      data: {
        absPath,
        sizeBytes: stat.size,
        contentType: 'image/jpeg'
      }
    };
  },

  async setCoverFrame(
    userId: string,
    clipId: string,
    input: { versionId?: string; timestampSec: number }
  ): Promise<ServiceResult<unknown>> {
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
      (input.versionId ? clip.versions.find((v) => v.id === input.versionId) : null) ??
      clip.versions.find((v) => v.id === clip.activeVersionId) ??
      clip.versions[0];

    if (!ver || !ver.outputVideoPath) {
      return {
        ok: false,
        code: 'RENDERED_VIDEO_NOT_FOUND',
        message: 'Video hasil render belum tersedia untuk diambil frame cover-nya.',
        statusCode: 404
      };
    }

    const absVideoPath = resolveSafeStoragePath(ver.outputVideoPath);
    if (!fs.existsSync(absVideoPath)) {
      return {
        ok: false,
        code: 'RENDERED_VIDEO_FILE_MISSING',
        message: 'Berkas video hasil render tidak ditemukan.',
        statusCode: 404
      };
    }

    const maxTs = Math.max(0.1, (ver.actualDurationSec ?? 5) - 0.05);
    const clampedTs = Math.round(Math.min(maxTs, Math.max(0.05, input.timestampSec)) * 100) / 100;
    const relDir = path.posix.dirname(ver.outputVideoPath.replace(/\\/g, '/'));
    const relCoverPath = `${relDir}/cover.jpg`;
    const absCoverPath = resolveSafeStoragePath(relCoverPath);

    await extractCoverAtTimestamp(absVideoPath, absCoverPath, clampedTs);

    if (ver.coverImagePath !== relCoverPath) {
      await batchRepository.updateClipVersion(ver.id, { coverImagePath: relCoverPath });
    }

    return {
      ok: true,
      data: {
        updated: true,
        clipId: clip.id,
        versionId: ver.id,
        timestampSec: clampedTs,
        coverUrl: `/api/clips/${clip.id}/cover?versionId=${ver.id}&cb=${Date.now()}`
      }
    };
  }
};
