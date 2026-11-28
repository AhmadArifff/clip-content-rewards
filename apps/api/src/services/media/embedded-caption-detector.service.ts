import { z } from 'zod';
import {
  AudioDiagnosticSchema,
  type AudioDiagnostic,
  type EmbeddedSubtitleSource
} from '@clip/shared';
import { mediaRepository } from '../../repositories/media.repository.js';
import { generateStructuredJsonWithByok, getActiveKeyForRole } from '../ai/llm-json.adapter.js';
import { extractVideoStoryboards, type VideoStoryboard } from './vision-storyboard.service.js';

const VisionSubtitleDetectionSchema = z.object({
  hasBurnedInSubtitles: z.boolean(),
  confidence: z.number().min(0).max(1).default(0.5),
  detectedSampleText: z.string().max(180).optional().default(''),
  reason: z.string().max(260).optional().default('')
});

export interface EmbeddedSubtitleCheckResult {
  checked: boolean;
  cached: boolean;
  hasEmbeddedSubtitles: boolean;
  source: EmbeddedSubtitleSource;
  confidence: number;
  sampleText: string;
  note: string;
  updatedDiagnostic: AudioDiagnostic;
}

export function parseAudioDiagnosticSafe(rawJson: string | null | undefined, hasAudio: boolean): AudioDiagnostic {
  if (rawJson) {
    try {
      return AudioDiagnosticSchema.parse(JSON.parse(rawJson));
    } catch {
      // Fallback ke struktur default valid bila data lama tidak lengkap
    }
  }
  return AudioDiagnosticSchema.parse({
    hasAudio,
    meanVolumeDb: null,
    maxVolumeDb: null,
    loudnessLufs: null,
    recommendedAudioMode: hasAudio ? 'original_normalized' : 'mute_for_platform_sound',
    reason: hasAudio
      ? 'Audio terdeteksi pada video sumber.'
      : 'Video tanpa trek audio (Visual-Only).'
  });
}

// Mendeteksi apakah video mentah sudah memiliki subtitle bawaan (trek soft-subtitle atau burned-in pixel)
// Hasil disimpan permanen di audioDiagnosticJson sehingga pemindaian Gemini Vision cukup 1x per video (100% gratis Free Tier)
export async function detectEmbeddedSubtitlesForMedia(params: {
  userId: string;
  media: {
    id: string;
    originalFilename: string;
    filePath: string;
    durationSec: number | null;
    hasAudio: boolean;
    audioDiagnosticJson: string | null;
  };
  preloadedStoryboard?: VideoStoryboard | null;
  force?: boolean;
}): Promise<EmbeddedSubtitleCheckResult> {
  const { userId, media, preloadedStoryboard, force = false } = params;
  const currentDiag = parseAudioDiagnosticSafe(media.audioDiagnosticJson, media.hasAudio);

  // Lapisan 0: Hormati keputusan manual pengguna kecuali pengguna menekan pindai ulang secara eksplisit
  if (!force && currentDiag.embeddedSubtitleSource === 'manual_override') {
    const flagged = Boolean(currentDiag.hasEmbeddedSubtitles);
    return {
      checked: true,
      cached: true,
      hasEmbeddedSubtitles: flagged,
      source: 'manual_override',
      confidence: 1,
      sampleText: currentDiag.embeddedSubtitleSample ?? '',
      note: flagged
        ? 'Ditandai manual memiliki subtitle bawaan (auto-skip aktif).'
        : 'Ditandai manual bersih tanpa subtitle bawaan.',
      updatedDiagnostic: currentDiag
    };
  }

  // Lapisan 1: Trek soft-subtitle dari FFprobe (0 token)
  if (!force && currentDiag.hasSoftSubtitleTrack) {
    const nextDiag: AudioDiagnostic = AudioDiagnosticSchema.parse({
      ...currentDiag,
      hasEmbeddedSubtitles: true,
      embeddedSubtitleSource: 'soft_stream',
      embeddedSubtitleConfidence: 1,
      embeddedSubtitleCheckedAt: currentDiag.embeddedSubtitleCheckedAt ?? new Date().toISOString()
    });
    if (!currentDiag.embeddedSubtitleCheckedAt || !currentDiag.hasEmbeddedSubtitles) {
      await mediaRepository.updateAnalysis(media.id, {
        audioDiagnosticJson: JSON.stringify(nextDiag),
        status: 'ready'
      });
    }
    return {
      checked: true,
      cached: Boolean(currentDiag.embeddedSubtitleCheckedAt),
      hasEmbeddedSubtitles: true,
      source: 'soft_stream',
      confidence: 1,
      sampleText: nextDiag.embeddedSubtitleSample ?? '',
      note: 'Trek subtitle tertanam (soft stream) terdeteksi langsung oleh FFprobe.',
      updatedDiagnostic: nextDiag
    };
  }

  // Lapisan cache: jangan ulangi pemanggilan AI untuk video yang sudah pernah dicek
  if (!force && currentDiag.embeddedSubtitleCheckedAt) {
    const flagged = Boolean(currentDiag.hasEmbeddedSubtitles);
    return {
      checked: true,
      cached: true,
      hasEmbeddedSubtitles: flagged,
      source: currentDiag.embeddedSubtitleSource ?? 'none',
      confidence: currentDiag.embeddedSubtitleConfidence ?? 0.8,
      sampleText: currentDiag.embeddedSubtitleSample ?? '',
      note: flagged
        ? 'Subtitle bawaan sudah terdeteksi sebelumnya (cache lokal).'
        : 'Video sudah diverifikasi bersih tanpa subtitle bawaan (cache lokal).',
      updatedDiagnostic: currentDiag
    };
  }

  // Lapisan 2: Gemini Vision pada 3x2 contact-sheet storyboard (6 frame merata sepanjang video)
  const brainKey = await getActiveKeyForRole(userId, 'brain');
  if (!brainKey || brainKey.provider !== 'gemini') {
    return {
      checked: false,
      cached: false,
      hasEmbeddedSubtitles: Boolean(currentDiag.hasEmbeddedSubtitles),
      source: currentDiag.embeddedSubtitleSource ?? 'none',
      confidence: currentDiag.embeddedSubtitleConfidence ?? 0,
      sampleText: currentDiag.embeddedSubtitleSample ?? '',
      note: 'Pasang kunci Google Gemini aktif di Brankas API untuk pemindaian visual otomatis, atau gunakan saklar manual pada kartu video.',
      updatedDiagnostic: currentDiag
    };
  }

  let storyboard = preloadedStoryboard ?? null;
  if (!storyboard) {
    const extracted = await extractVideoStoryboards(
      [
        {
          id: media.id,
          originalFilename: media.originalFilename,
          filePath: media.filePath,
          durationSec: media.durationSec ?? 5
        }
      ],
      1
    );
    storyboard = extracted[0] ?? null;
  }

  if (!storyboard) {
    return {
      checked: false,
      cached: false,
      hasEmbeddedSubtitles: Boolean(currentDiag.hasEmbeddedSubtitles),
      source: currentDiag.embeddedSubtitleSource ?? 'none',
      confidence: currentDiag.embeddedSubtitleConfidence ?? 0,
      sampleText: currentDiag.embeddedSubtitleSample ?? '',
      note: 'Storyboard visual tidak berhasil diekstrak dari berkas video ini.',
      updatedDiagnostic: currentDiag
    };
  }

  const systemPrompt =
    'You are a precision video QC inspector. Examine the 3x2 storyboard image (6 frames sampled across a video) and decide if the video ALREADY has burned-in / hardcoded spoken speech subtitles or captions baked into the video pixels. ' +
    'IMPORTANT distinction: ongoing spoken dialogue captions (e.g. changing speech sentences like "I\'m not going to name names," near lower-middle/center across multiple frames) MUST return hasBurnedInSubtitles=true. ' +
    'By contrast, a static brand logo, single promo poster graphic, or breaking-news headline banner without spoken captions MUST return hasBurnedInSubtitles=false. ' +
    'Return strict valid JSON ONLY: {"hasBurnedInSubtitles":boolean,"confidence":number,"detectedSampleText":string,"reason":string}.';

  const userPrompt = JSON.stringify({
    filename: media.originalFilename,
    durationSec: storyboard.durationSec,
    frameTimestampsSec: storyboard.frameTimestampsSec
  });

  try {
    const aiRes = await generateStructuredJsonWithByok({
      key: brainKey,
      systemPrompt,
      userPrompt,
      images: [
        {
          label: `3x2 storyboard of "${media.originalFilename}" (timestamps sec: [${storyboard.frameTimestampsSec.join(', ')}])`,
          mimeType: storyboard.mimeType,
          dataBase64: storyboard.dataBase64
        }
      ],
      temperature: 0.1,
      maxOutputTokens: 280
    });

    const parsed = VisionSubtitleDetectionSchema.parse(aiRes.json);
    const detected = parsed.hasBurnedInSubtitles && parsed.confidence >= 0.65;
    const sampleText = parsed.detectedSampleText.trim().slice(0, 160);
    const nextDiag: AudioDiagnostic = AudioDiagnosticSchema.parse({
      ...currentDiag,
      hasEmbeddedSubtitles: detected,
      embeddedSubtitleSource: detected ? 'vision_ai' : 'none',
      embeddedSubtitleSample: detected ? sampleText : undefined,
      embeddedSubtitleConfidence: Math.round(parsed.confidence * 100) / 100,
      embeddedSubtitleCheckedAt: new Date().toISOString()
    });

    await mediaRepository.updateAnalysis(media.id, {
      audioDiagnosticJson: JSON.stringify(nextDiag),
      status: 'ready'
    });

    return {
      checked: true,
      cached: false,
      hasEmbeddedSubtitles: detected,
      source: detected ? 'vision_ai' : 'none',
      confidence: nextDiag.embeddedSubtitleConfidence ?? parsed.confidence,
      sampleText,
      note: detected
        ? `Subtitle bawaan terdeteksi oleh ${aiRes.usedModel} Vision AI${sampleText ? ` ("${sampleText}")` : ''}. Subtitle baru akan otomatis dilewati pada segmen video ini.`
        : `Terverifikasi bersih tanpa subtitle bawaan oleh ${aiRes.usedModel} Vision AI.`,
      updatedDiagnostic: nextDiag
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 140) : 'Gagal memindai visual video.';
    return {
      checked: false,
      cached: false,
      hasEmbeddedSubtitles: Boolean(currentDiag.hasEmbeddedSubtitles),
      source: currentDiag.embeddedSubtitleSource ?? 'none',
      confidence: currentDiag.embeddedSubtitleConfidence ?? 0,
      sampleText: currentDiag.embeddedSubtitleSample ?? '',
      note: `Pemindaian otomatis dilewati sementara (${reason}). Anda tetap dapat menandai manual di kartu video.`,
      updatedDiagnostic: currentDiag
    };
  }
}
