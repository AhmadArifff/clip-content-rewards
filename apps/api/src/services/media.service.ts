import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MediaAssetType, ServiceResult, TranscriptPayload } from '@clip/shared';
import { resolveSafeStoragePath } from '../config/storage.js';
import { campaignRepository } from '../repositories/campaign.repository.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { getActiveKeyForRole } from './ai/llm-json.adapter.js';
import { transcribeMediaWithAutoChunking } from './ai/stt.adapter.js';
import { probeMediaAsset } from './media/media-probe.service.js';

const ALLOWED_VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm'];
const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

function serializeMedia(m: {
  id: string;
  campaignId: string;
  assetType: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  loudnessLufs: number | null;
  audioDiagnosticJson: string | null;
  silencesJson: string | null;
  transcriptJson: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}) {
  return {
    id: m.id,
    campaignId: m.campaignId,
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
    audioDiagnostic: m.audioDiagnosticJson ? JSON.parse(m.audioDiagnosticJson) : null,
    silences: m.silencesJson ? JSON.parse(m.silencesJson) : [],
    transcript: m.transcriptJson ? JSON.parse(m.transcriptJson) : null,
    status: m.status,
    errorMessage: m.errorMessage,
    createdAt: m.createdAt
  };
}

export const mediaService = {
  async saveUploadChunk(params: {
    userId: string;
    campaignId: string;
    uploadId: string;
    chunkIndex: number;
    buffer: Buffer;
  }): Promise<ServiceResult<{ uploadId: string; chunkIndex: number; receivedBytes: number }>> {
    const owned = await campaignRepository.findOwnership(params.campaignId, params.userId);
    if (!owned) {
      return {
        ok: false,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign tidak ditemukan.',
        statusCode: 404
      };
    }

    if (!/^[a-zA-Z0-9_-]{6,80}$/.test(params.uploadId)) {
      return {
        ok: false,
        code: 'INVALID_UPLOAD_ID',
        message: 'Penanda sesi unggah tidak valid.',
        statusCode: 400
      };
    }

    const chunkDir = resolveSafeStoragePath(`temp/chunks_${params.campaignId}_${params.uploadId}`);
    fs.mkdirSync(chunkDir, { recursive: true });
    const chunkPath = path.join(chunkDir, `part_${String(params.chunkIndex).padStart(5, '0')}`);
    fs.writeFileSync(chunkPath, params.buffer);

    return {
      ok: true,
      data: {
        uploadId: params.uploadId,
        chunkIndex: params.chunkIndex,
        receivedBytes: params.buffer.length
      }
    };
  },

  async completeChunkedUpload(params: {
    userId: string;
    campaignId: string;
    uploadId: string;
    originalFilename: string;
    mimeType: string;
    totalChunks: number;
    assetType: MediaAssetType;
  }): Promise<ServiceResult<unknown>> {
    const { userId, campaignId, uploadId, originalFilename, mimeType, totalChunks, assetType } = params;
    const owned = await campaignRepository.findOwnership(campaignId, userId);
    if (!owned) {
      return {
        ok: false,
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign tidak ditemukan.',
        statusCode: 404
      };
    }

    const ext = path.extname(originalFilename).toLowerCase();
    const allowedExts = assetType === 'watermark' ? ALLOWED_IMAGE_EXTS : ALLOWED_VIDEO_EXTS;
    if (!allowedExts.includes(ext)) {
      return {
        ok: false,
        code: 'UNSUPPORTED_MEDIA_FORMAT',
        message:
          assetType === 'watermark'
            ? 'Format logo/watermark harus PNG, JPG, atau WEBP.'
            : 'Format video harus MP4, MOV, MKV, atau WEBM.',
        statusCode: 400
      };
    }

    const chunkDir = resolveSafeStoragePath(`temp/chunks_${campaignId}_${uploadId}`);
    if (!fs.existsSync(chunkDir)) {
      return {
        ok: false,
        code: 'CHUNKS_NOT_FOUND',
        message: 'Potongan file unggahan tidak ditemukan. Silakan ulangi unggahan.',
        statusCode: 400
      };
    }

    const relDir = `uploads/${campaignId}/media`;
    const absDir = resolveSafeStoragePath(relDir);
    fs.mkdirSync(absDir, { recursive: true });
    const storedFilename = `${crypto.randomUUID()}${ext}`;
    const storedRelPath = `${relDir}/${storedFilename}`;
    const absFinalPath = resolveSafeStoragePath(storedRelPath);

    try {
      const writeStream = fs.createWriteStream(absFinalPath);
      let totalSize = 0;

      for (let i = 0; i < totalChunks; i += 1) {
        const partPath = path.join(chunkDir, `part_${String(i).padStart(5, '0')}`);
        if (!fs.existsSync(partPath)) {
          writeStream.close();
          fs.rmSync(absFinalPath, { force: true });
          return {
            ok: false,
            code: 'MISSING_UPLOAD_CHUNK',
            message: `Potongan unggahan ke-${i + 1} belum diterima lengkap. Silakan ulangi unggahan.`,
            statusCode: 400
          };
        }
        const chunkData = fs.readFileSync(partPath);
        totalSize += chunkData.length;
        writeStream.write(chunkData);
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const probed = await probeMediaAsset(storedRelPath, assetType);
      const initialTranscript: TranscriptPayload | null =
        assetType === 'watermark'
          ? null
          : !probed.hasAudio
            ? {
                mode: 'visual_only',
                fullText: '',
                chunksProcessed: 0,
                words: []
              }
            : {
                mode: 'not_transcribed',
                fullText: '',
                chunksProcessed: 0,
                words: []
              };

      const created = await mediaRepository.create({
        campaignId,
        assetType,
        originalFilename,
        filePath: storedRelPath,
        mimeType,
        fileSizeBytes: totalSize,
        durationSec: probed.durationSec,
        width: probed.width,
        height: probed.height,
        fps: probed.fps,
        hasAudio: probed.hasAudio,
        loudnessLufs: probed.audioDiagnostic?.loudnessLufs ?? null,
        audioDiagnosticJson: probed.audioDiagnostic ? JSON.stringify(probed.audioDiagnostic) : null,
        silencesJson: JSON.stringify(probed.silences),
        transcriptJson: initialTranscript ? JSON.stringify(initialTranscript) : null,
        status: 'ready'
      });

      return { ok: true, data: serializeMedia(created) };
    } catch (err) {
      fs.rmSync(absFinalPath, { force: true });
      return {
        ok: false,
        code: 'MEDIA_PROBE_FAILED',
        message: err instanceof Error ? err.message : 'Gagal memverifikasi berkas media yang diunggah.',
        statusCode: 400
      };
    } finally {
      fs.rmSync(chunkDir, { recursive: true, force: true });
    }
  },

  async transcribeAsset(userId: string, mediaId: string): Promise<ServiceResult<unknown>> {
    const asset = await mediaRepository.findByIdWithOwner(mediaId, userId);
    if (!asset) {
      return {
        ok: false,
        code: 'MEDIA_NOT_FOUND',
        message: 'Berkas media tidak ditemukan.',
        statusCode: 404
      };
    }

    if (asset.assetType === 'watermark') {
      return {
        ok: false,
        code: 'NOT_A_VIDEO',
        message: 'Watermark gambar tidak memerlukan transkripsi suara.',
        statusCode: 400
      };
    }

    if (!asset.hasAudio) {
      const visualOnly: TranscriptPayload = {
        mode: 'visual_only',
        fullText: '',
        chunksProcessed: 0,
        words: []
      };
      const updated = await mediaRepository.updateAnalysis(asset.id, {
        transcriptJson: JSON.stringify(visualOnly),
        status: 'ready'
      });
      return { ok: true, data: serializeMedia(updated) };
    }

    let sttKey = await getActiveKeyForRole(userId, 'stt');
    if (!sttKey) {
      // Fallback hemat gratis: gunakan kunci Gemini Brain aktif untuk transkrip audio langsung (multimodal STT)
      const brainKey = await getActiveKeyForRole(userId, 'brain');
      if (brainKey?.provider === 'gemini') {
        sttKey = brainKey;
      }
    }
    if (!sttKey) {
      return {
        ok: false,
        code: 'STT_KEY_MISSING',
        message: 'Belum ada kunci API Transkrip Video (Groq Whisper gratis / Google Gemini / OpenAI Whisper / Deepgram) aktif di menu Brankas API.',
        statusCode: 400
      };
    }

    await mediaRepository.updateAnalysis(asset.id, { status: 'analyzing', errorMessage: null });

    try {
      const transcript = await transcribeMediaWithAutoChunking({
        mediaId: asset.id,
        mediaRelativePath: asset.filePath,
        durationSec: asset.durationSec ?? 60,
        sttKey
      });

      const updated = await mediaRepository.updateAnalysis(asset.id, {
        transcriptJson: JSON.stringify(transcript),
        status: 'ready',
        errorMessage: null
      });
      return { ok: true, data: serializeMedia(updated) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mentranskrip audio video.';
      await mediaRepository.updateAnalysis(asset.id, {
        status: 'ready',
        errorMessage: msg
      });
      return {
        ok: false,
        code: 'STT_FAILED',
        message: `Transkripsi gagal: ${msg}`,
        statusCode: 502
      };
    }
  },

  async deleteAsset(userId: string, mediaId: string): Promise<ServiceResult<{ deletedId: string }>> {
    const asset = await mediaRepository.findByIdWithOwner(mediaId, userId);
    if (!asset) {
      return {
        ok: false,
        code: 'MEDIA_NOT_FOUND',
        message: 'Berkas media tidak ditemukan.',
        statusCode: 404
      };
    }

    await mediaRepository.deleteById(asset.id);
    try {
      fs.rmSync(resolveSafeStoragePath(asset.filePath), { force: true });
    } catch {
      // Abaikan bila file sudah hilang
    }

    return { ok: true, data: { deletedId: asset.id } };
  }
};
