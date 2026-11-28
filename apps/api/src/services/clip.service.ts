import {
  EdlSchema,
  type BriefRulebook,
  type EdlDocument,
  type ServiceResult,
  type TargetConfig,
  type TranscriptPayload,
  type WordTimestamp
} from '@clip/shared';
import { batchRepository } from '../repositories/batch.repository.js';
import { planEdlPatchWithPrompt, type SubtitleOverrideInput } from './ai/edl-patcher.service.js';
import { evaluateClipVersion } from './ai/viral-evaluator.service.js';
import { buildTimedCuesFromEdl } from './media/ass-subtitle.builder.js';
import { renderEdlToMp4, type RenderMediaSource } from './media/edl-renderer.service.js';

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
  }
};
