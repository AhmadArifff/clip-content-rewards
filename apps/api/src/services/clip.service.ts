import fs from 'node:fs';
import path from 'node:path';
import {
  EdlSchema,
  type BriefRulebook,
  type EdlDocument,
  type ServiceResult,
  type TargetConfig,
  type TranscriptPayload,
  type WordTimestamp
} from '@clip/shared';
import { resolveSafeStoragePath } from '../config/storage.js';
import { batchRepository } from '../repositories/batch.repository.js';
import { planEdlPatchWithPrompt, type SubtitleOverrideInput } from './ai/edl-patcher.service.js';
import { evaluateClipVersion } from './ai/viral-evaluator.service.js';
import { buildTimedCuesFromEdl } from './media/ass-subtitle.builder.js';
import { renderEdlToMp4, type RenderMediaSource } from './media/edl-renderer.service.js';
import {
  analyzeSubjectFocusTrack,
  extractAndRankCoverCandidates,
  extractCoverAtTimestamp,
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

    const wordsByMediaId: Record<string, WordTimestamp[]> = {};
    for (const m of clip.batch.campaign.mediaAssets) {
      if (m.assetType === 'raw_video' && m.transcriptJson) {
        const t = safeJson<TranscriptPayload | null>(m.transcriptJson, null);
        wordsByMediaId[m.id] = t?.words ?? [];
      }
    }

    const versions = clip.versions.map((v) => {
      const edl = safeJson<EdlDocument | null>(v.edlJson, null);
      const cues = edl ? buildTimedCuesFromEdl(edl, wordsByMediaId, v.actualDurationSec ?? 30) : [];
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
      .map((m) => ({
        id: m.id,
        originalFilename: m.originalFilename,
        durationSec: m.durationSec ?? 5,
        width: m.width,
        height: m.height,
        hasAudio: m.hasAudio
      }));

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
        activeVersionId: activeVersion?.id ?? null,
        targetConfig: safeJson<TargetConfig | null>(clip.batch.targetConfigJson, null),
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

    const { patch, patchedEdl } = await planEdlPatchWithPrompt({
      userId,
      currentEdl,
      userPrompt: input.userPrompt,
      presetCodes: input.presetCodes,
      subtitleOverrides: input.subtitleOverrides,
      targetConfig,
      rulebook
    });

    const nextVersionNumber = Math.max(...clip.versions.map((v) => v.versionNumber), 0) + 1;

    const sources: RenderMediaSource[] = [];
    const watermarkPathById = new Map<string, string>();
    for (const m of clip.batch.campaign.mediaAssets) {
      if (m.assetType === 'watermark') {
        watermarkPathById.set(m.id, m.filePath);
      } else if (m.assetType === 'raw_video') {
        const tr = safeJson<TranscriptPayload | null>(m.transcriptJson, null);
        sources.push({
          id: m.id,
          filePath: m.filePath,
          durationSec: m.durationSec ?? 5,
          hasAudio: m.hasAudio,
          words: tr?.words ?? []
        });
      }
    }

    const wmId = patchedEdl.supportingOverlays.watermarkAssetId;
    const watermarkRelPath = wmId ? watermarkPathById.get(wmId) ?? null : null;

    const rendered = await renderEdlToMp4({
      batchId: clip.batchId,
      clipId: clip.id,
      versionNumber: nextVersionNumber,
      edl: patchedEdl,
      sources,
      watermarkRelPath
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
        newVersionId: newVer.id,
        newVersionNumber: nextVersionNumber,
        clip: detail.data
      }
    };
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
        sources.push({
          id: m.id,
          filePath: m.filePath,
          durationSec: m.durationSec ?? 5,
          hasAudio: m.hasAudio,
          words: tr?.words ?? []
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
    const watermarkRelPath = wmId ? watermarkPathById.get(wmId) ?? null : null;

    const rendered = await renderEdlToMp4({
      batchId: clip.batchId,
      clipId: clip.id,
      versionNumber: nextVersionNumber,
      edl: validatedEdl,
      sources,
      watermarkRelPath
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
          imageUrl: `/api/clips/${clip.id}/cover-candidate/${c.index}?versionId=${ver.id}&cb=${cacheBust}`
        }))
      }
    };
  },

  async resolveCoverCandidateFile(
    userId: string,
    clipId: string,
    candidateIdx: number,
    versionId?: string
  ): Promise<ServiceResult<{ absPath: string; sizeBytes: number; contentType: string }>> {
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
      (versionId ? clip.versions.find((v) => v.id === versionId) : null) ??
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
