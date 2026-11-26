import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BriefRulebook, CreateCampaignInput, PlatformTarget, ServiceResult } from '@clip/shared';
import { resolveSafeStoragePath } from '../config/storage.js';
import { campaignRepository } from '../repositories/campaign.repository.js';
import { extractRawTextFromBriefFile, parseBriefTextToRulebook } from './brief-parser.service.js';

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function serializeCampaignSummary(row: {
  id: string;
  title: string;
  brandOwner: string | null;
  platformTargetsJson: string;
  rewardNotes: string | null;
  deadlineAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  brief?: { id: string; sourceType: string; originalFilename: string | null; confirmedByUser: boolean; updatedAt: Date } | null;
  _count?: { mediaAssets: number; batches: number };
}) {
  return {
    id: row.id,
    title: row.title,
    brandOwner: row.brandOwner ?? '',
    platformTargets: safeJsonParse<PlatformTarget[]>(row.platformTargetsJson, ['tiktok']),
    rewardNotes: row.rewardNotes ?? '',
    deadlineAt: row.deadlineAt,
    status: row.status,
    briefSummary: row.brief ?? null,
    counts: row._count ?? { mediaAssets: 0, batches: 0 },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export const campaignService = {
  async listCampaigns(userId: string): Promise<ServiceResult<unknown>> {
    const rows = await campaignRepository.listByUser(userId);
    return {
      ok: true,
      data: rows.map(serializeCampaignSummary)
    };
  },

  async getCampaignDetail(userId: string, campaignId: string): Promise<ServiceResult<unknown>> {
    const row = await campaignRepository.findDetailForUser(campaignId, userId);
    if (!row) {
      return {
        ok: false,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign tidak ditemukan.',
        statusCode: 404
      };
    }

    return {
      ok: true,
      data: {
        id: row.id,
        title: row.title,
        brandOwner: row.brandOwner ?? '',
        platformTargets: safeJsonParse<PlatformTarget[]>(row.platformTargetsJson, ['tiktok']),
        rewardNotes: row.rewardNotes ?? '',
        deadlineAt: row.deadlineAt,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        brief: row.brief
          ? {
              id: row.brief.id,
              sourceType: row.brief.sourceType,
              originalFilename: row.brief.originalFilename,
              rawText: row.brief.rawText,
              rulebook: safeJsonParse<BriefRulebook | null>(row.brief.parsedRulebookJson, null),
              confirmedByUser: row.brief.confirmedByUser,
              updatedAt: row.brief.updatedAt
            }
          : null,
        mediaAssets: row.mediaAssets.map((m) => ({
          id: m.id,
          assetType: m.assetType,
          originalFilename: m.originalFilename,
          mimeType: m.mimeType,
          fileSizeBytes: m.fileSizeBytes,
          durationSec: m.durationSec,
          width: m.width,
          height: m.height,
          fps: m.fps,
          hasAudio: m.hasAudio,
          loudnessLufs: m.loudnessLufs,
          audioDiagnostic: safeJsonParse(m.audioDiagnosticJson, null),
          silences: safeJsonParse(m.silencesJson, []),
          transcript: safeJsonParse(m.transcriptJson, null),
          status: m.status,
          errorMessage: m.errorMessage,
          createdAt: m.createdAt
        })),
        batches: row.batches
      }
    };
  },

  async createCampaign(userId: string, input: CreateCampaignInput): Promise<ServiceResult<unknown>> {
    const created = await campaignRepository.create({
      userId,
      title: input.title,
      brandOwner: input.brandOwner || null,
      platformTargetsJson: JSON.stringify(input.platformTargets),
      rewardNotes: input.rewardNotes || null,
      deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null
    });

    return { ok: true, data: serializeCampaignSummary(created) };
  },

  async updateCampaign(
    userId: string,
    campaignId: string,
    input: {
      title?: string;
      brandOwner?: string;
      platformTargets?: PlatformTarget[];
      rewardNotes?: string;
      deadlineAt?: string | null;
      status?: string;
    }
  ): Promise<ServiceResult<unknown>> {
    const owned = await campaignRepository.findOwnership(campaignId, userId);
    if (!owned) {
      return {
        ok: false,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign tidak ditemukan.',
        statusCode: 404
      };
    }

    const updated = await campaignRepository.update(campaignId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.brandOwner !== undefined ? { brandOwner: input.brandOwner || null } : {}),
      ...(input.platformTargets !== undefined
        ? { platformTargetsJson: JSON.stringify(input.platformTargets) }
        : {}),
      ...(input.rewardNotes !== undefined ? { rewardNotes: input.rewardNotes || null } : {}),
      ...(input.deadlineAt !== undefined
        ? { deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {})
    });

    return { ok: true, data: serializeCampaignSummary(updated) };
  },

  async deleteCampaign(userId: string, campaignId: string): Promise<ServiceResult<{ deletedId: string }>> {
    const detail = await campaignRepository.findDetailForUser(campaignId, userId);
    if (!detail) {
      return {
        ok: false,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign tidak ditemukan.',
        statusCode: 404
      };
    }

    await campaignRepository.deleteById(campaignId);

    // Bersihkan direktori upload fisik milik campaign setelah record dihapus
    try {
      const campaignUploadDir = resolveSafeStoragePath(`uploads/${campaignId}`);
      fs.rmSync(campaignUploadDir, { recursive: true, force: true });
    } catch {
      // Abaikan jika folder belum dibuat
    }

    return { ok: true, data: { deletedId: campaignId } };
  },

  async uploadOrParseBrief(params: {
    userId: string;
    campaignId: string;
    file?: { originalname: string; buffer: Buffer };
    pastedText?: string;
  }): Promise<ServiceResult<unknown>> {
    const { userId, campaignId, file, pastedText } = params;
    const owned = await campaignRepository.findOwnership(campaignId, userId);
    if (!owned) {
      return {
        ok: false,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign tidak ditemukan.',
        statusCode: 404
      };
    }

    let sourceType: 'pdf' | 'docx' | 'doc' | 'text' = 'text';
    let originalFilename: string | null = null;
    let storedRelativePath: string | null = null;
    let rawText = (pastedText ?? '').trim();
    let isLikelyScannedPdf = false;

    if (file) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!['.pdf', '.docx', '.doc', '.txt'].includes(ext)) {
        return {
          ok: false,
          code: 'UNSUPPORTED_BRIEF_FORMAT',
          message: 'Format brief harus berupa .pdf, .docx, .doc, atau .txt.',
          statusCode: 400
        };
      }

      const relDir = `uploads/${campaignId}/briefs`;
      const absDir = resolveSafeStoragePath(relDir);
      fs.mkdirSync(absDir, { recursive: true });
      const safeFilename = `${crypto.randomUUID()}${ext}`;
      storedRelativePath = `${relDir}/${safeFilename}`;
      const absFile = resolveSafeStoragePath(storedRelativePath);
      fs.writeFileSync(absFile, file.buffer);

      originalFilename = file.originalname;
      const extracted = await extractRawTextFromBriefFile(absFile, file.originalname);
      sourceType = extracted.sourceType;
      rawText = extracted.rawText;
      isLikelyScannedPdf = extracted.isLikelyScannedPdf;
    }

    if (!rawText && !isLikelyScannedPdf) {
      return {
        ok: false,
        code: 'EMPTY_BRIEF_CONTENT',
        message: 'Silakan unggah berkas brief atau tempel teks brief campaign terlebih dahulu.',
        statusCode: 400
      };
    }

    const parsed = await parseBriefTextToRulebook({ userId, rawText });
    const saved = await campaignRepository.upsertBrief({
      campaignId,
      sourceType,
      originalFilename,
      storedFilePath: storedRelativePath,
      rawText,
      parsedRulebookJson: JSON.stringify(parsed.rulebook),
      confirmedByUser: false
    });

    return {
      ok: true,
      data: {
        id: saved.id,
        sourceType: saved.sourceType,
        originalFilename: saved.originalFilename,
        rawText: saved.rawText,
        rulebook: parsed.rulebook,
        confirmedByUser: saved.confirmedByUser,
        extractionMode: parsed.extractionMode,
        isLikelyScannedPdf,
        note: isLikelyScannedPdf
          ? 'PDF ini tampak seperti hasil scan gambar (teks kosong). Tempel teks brief atau lengkapi poin aturan secara manual di bawah.'
          : parsed.note
      }
    };
  },

  async updateBriefRulebook(
    userId: string,
    campaignId: string,
    input: { rawText?: string; rulebook: BriefRulebook; confirmedByUser: boolean }
  ): Promise<ServiceResult<unknown>> {
    const owned = await campaignRepository.findOwnership(campaignId, userId);
    if (!owned) {
      return {
        ok: false,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign tidak ditemukan.',
        statusCode: 404
      };
    }

    const existing = await campaignRepository.findBrief(campaignId);
    if (!existing) {
      const created = await campaignRepository.upsertBrief({
        campaignId,
        sourceType: 'text',
        originalFilename: null,
        storedFilePath: null,
        rawText: input.rawText || input.rulebook.campaignGoal,
        parsedRulebookJson: JSON.stringify(input.rulebook),
        confirmedByUser: input.confirmedByUser
      });
      return {
        ok: true,
        data: {
          id: created.id,
          sourceType: created.sourceType,
          originalFilename: created.originalFilename,
          rawText: created.rawText,
          rulebook: input.rulebook,
          confirmedByUser: created.confirmedByUser,
          updatedAt: created.updatedAt
        }
      };
    }

    const updated = await campaignRepository.updateBriefRulebook(campaignId, {
      ...(input.rawText !== undefined ? { rawText: input.rawText } : {}),
      parsedRulebookJson: JSON.stringify(input.rulebook),
      confirmedByUser: input.confirmedByUser
    });

    if (input.confirmedByUser && owned.status === 'draft') {
      await campaignRepository.update(campaignId, { status: 'ready' });
    }

    return {
      ok: true,
      data: {
        id: updated.id,
        sourceType: updated.sourceType,
        originalFilename: updated.originalFilename,
        rawText: updated.rawText,
        rulebook: input.rulebook,
        confirmedByUser: updated.confirmedByUser,
        updatedAt: updated.updatedAt
      }
    };
  }
};
