import { z } from 'zod';
import {
  EdlSchema,
  type BriefRulebook,
  type EdlDocument,
  type PacingBlueprint,
  type SilenceInterval,
  type TargetConfig,
  type TranscriptPayload
} from '@clip/shared';
import { generateStructuredJsonWithByok, getActiveKeyForRole } from './llm-json.adapter.js';

export interface PlannedClipDraft {
  sequenceIndex: number;
  angleTitle: string;
  hookSummary: string;
  edl: EdlDocument;
}

export interface BatchEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedRenderSeconds: number;
  hasActiveBrainKey: boolean;
  activeBrainProvider: string | null;
}

const AiDirectorResponseSchema = z.object({
  clips: z.array(
    z.object({
      angleTitle: z.string().min(2),
      hookSummary: z.string().min(2),
      edl: EdlSchema
    })
  ).min(1)
});

export async function estimateBatchCost(params: {
  userId: string;
  briefTextLength: number;
  transcriptWordCount: number;
  batchCount: number;
  targetDurationSec: number;
}): Promise<BatchEstimate> {
  const brainKey = await getActiveKeyForRole(params.userId, 'brain');
  const briefTokens = Math.ceil(params.briefTextLength / 4);
  const transcriptTokens = Math.ceil(params.transcriptWordCount * 1.4);
  const estimatedInputTokens = 800 + briefTokens + Math.min(transcriptTokens, 8000);
  const estimatedOutputTokens = params.batchCount * 650;
  const estimatedRenderSeconds = Math.max(8, params.batchCount * Math.ceil(params.targetDurationSec * 0.45));

  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
    estimatedRenderSeconds,
    hasActiveBrainKey: Boolean(brainKey),
    activeBrainProvider: brainKey ? `${brainKey.provider.toUpperCase()} (${brainKey.defaultModel})` : null
  };
}

function buildAudioConfig(mode: TargetConfig['initialAudioMode'], platform: TargetConfig['platform']) {
  const platformSound =
    platform === 'tiktok'
      ? 'tiktok_trending_overlay' as const
      : platform === 'youtube_shorts'
        ? 'youtube_shorts_sound_overlay' as const
        : 'none' as const;

  if (mode === 'mute_for_platform_sound') {
    return {
      originalVolume: 0,
      muteOriginal: true,
      normalizeLufs: -14,
      intendedPlatformSound: platformSound
    };
  }
  if (mode === 'ducking_20') {
    return {
      originalVolume: 0.2,
      muteOriginal: false,
      normalizeLufs: -14,
      intendedPlatformSound: platformSound
    };
  }
  return {
    originalVolume: 1.0,
    muteOriginal: false,
    normalizeLufs: -14,
    intendedPlatformSound: 'none' as const
  };
}

function buildPacedSegmentsFromBlueprint(params: {
  mediaAssetId: string;
  windowStartSec: number;
  windowEndSec: number;
  mediaDurationSec: number;
  blueprint: PacingBlueprint;
  variantIdx: number;
}): EdlDocument['segments'] {
  const { mediaAssetId, windowStartSec, windowEndSec, mediaDurationSec, blueprint, variantIdx } = params;
  const availableDur = Math.max(0.8, windowEndSec - windowStartSec);
  const maxCuts = Math.min(8, Math.max(2, Math.floor(availableDur / 0.6)));
  const sourceShots = blueprint.shots.slice(0, maxCuts);

  if (sourceShots.length <= 1 || availableDur < 1.5) {
    return [
      {
        mediaAssetId,
        startSec: Math.round(windowStartSec * 100) / 100,
        endSec: Math.round(Math.min(mediaDurationSec, Math.max(windowStartSec + 0.6, windowEndSec)) * 100) / 100,
        zoom: variantIdx % 2 === 1 ? 1.1 : 1.0,
        cropX: 'center'
      }
    ];
  }

  const totalRefDur = sourceShots.reduce((sum, s) => sum + s.durationSec, 0) || 1;
  const segments: EdlDocument['segments'] = [];
  let cursor = windowStartSec;

  for (let i = 0; i < sourceShots.length; i += 1) {
    const shot = sourceShots[i];
    const isLast = i === sourceShots.length - 1;
    const scaledDur = isLast
      ? Math.max(0.45, windowEndSec - cursor)
      : Math.max(0.45, (shot.durationSec / totalRefDur) * availableDur);

    const segStart = Math.min(Math.max(0, cursor), Math.max(0, mediaDurationSec - 0.5));
    const segEnd = Math.min(mediaDurationSec, Math.max(segStart + 0.45, segStart + scaledDur));
    const baseZoom = shot.suggestedZoom;
    const zoom = variantIdx % 2 === 1 && baseZoom <= 1.01 ? 1.06 : baseZoom;

    segments.push({
      mediaAssetId,
      startSec: Math.round(segStart * 100) / 100,
      endSec: Math.round(segEnd * 100) / 100,
      zoom: Math.round(Math.min(1.5, Math.max(1.0, zoom)) * 100) / 100,
      cropX: 'center'
    });

    cursor = segEnd;
    if (cursor >= Math.min(windowEndSec, mediaDurationSec) - 0.45) break;
  }

  return segments.length > 0
    ? segments
    : [
        {
          mediaAssetId,
          startSec: Math.round(windowStartSec * 100) / 100,
          endSec: Math.round(Math.min(mediaDurationSec, windowEndSec) * 100) / 100,
          zoom: 1.0,
          cropX: 'center'
        }
      ];
}

export function buildHeuristicMultiVariantEdls(params: {
  mediaAssetId: string;
  mediaDurationSec: number;
  rulebook: BriefRulebook | null;
  targetConfig: TargetConfig;
  silences: SilenceInterval[];
  pacingBlueprint?: PacingBlueprint | null;
}): PlannedClipDraft[] {
  const { mediaAssetId, mediaDurationSec, rulebook, targetConfig, pacingBlueprint } = params;
  const count = targetConfig.batchCount;
  const totalDur = Math.max(1.5, mediaDurationSec);
  const isVertical = targetConfig.platform !== 'youtube_long';
  const resolution = isVertical
    ? { width: 1080, height: 1920, fps: 30 }
    : { width: 1920, height: 1080, fps: 30 };

  const safeZonePreset =
    targetConfig.platform === 'tiktok'
      ? 'tiktok_9_16'
      : targetConfig.platform === 'youtube_shorts'
        ? 'youtube_shorts_9_16'
        : 'youtube_16_9';

  const idealClipDur = Math.min(
    totalDur,
    rulebook?.durationRules.idealSec ??
      Math.min(45, Math.max(15, Math.round(totalDur / Math.max(1, count))))
  );

  const angleTemplates = [
    { title: 'Angle Hook Langsung', hook: `Stop scroll! Ini rahasia ${targetConfig.personaNiche}` },
    { title: 'Angle Sudut Kontras', hook: 'Kebanyakan orang masih salah langkah di sini' },
    { title: 'Angle Poin Cepat', hook: `Wajib tahu sebelum terlambat (${targetConfig.countryCode})` },
    { title: 'Angle Pemancing Diskusi', hook: 'Setuju atau tidak dengan cara ini?' },
    { title: 'Angle Bukti & Hasil', hook: 'Lihat perbedaannya dalam hitungan detik' }
  ];

  const ctaLine =
    rulebook?.requiredHashtags?.length
      ? `Cek detail sekarang ${rulebook.requiredHashtags.slice(0, 2).join(' ')}`
      : 'Ikuti dan simpan untuk referensi!';

  const drafts: PlannedClipDraft[] = [];

  for (let i = 0; i < count; i += 1) {
    const tpl = angleTemplates[i % angleTemplates.length];
    let startSec = 0;
    let endSec = totalDur;

    if (targetConfig.batchDiversityMode === 'distinct_moments' && totalDur > idealClipDur + 1) {
      const maxStart = Math.max(0, totalDur - idealClipDur);
      const step = count > 1 ? maxStart / (count - 1) : 0;
      startSec = Math.round(step * i * 100) / 100;
      endSec = Math.round(Math.min(totalDur, startSec + idealClipDur) * 100) / 100;
    } else {
      // Mode A/B Hook Test atau video mentah sangat pendek: variasikan framing/zoom & hook banner
      const sliceLen = Math.min(totalDur, Math.max(1.2, idealClipDur));
      startSec = Math.min(Math.max(0, totalDur - sliceLen), i * 0.25);
      endSec = Math.min(totalDur, startSec + sliceLen);
    }

    const segments = pacingBlueprint
      ? buildPacedSegmentsFromBlueprint({
          mediaAssetId,
          windowStartSec: startSec,
          windowEndSec: endSec,
          mediaDurationSec: totalDur,
          blueprint: pacingBlueprint,
          variantIdx: i
        })
      : [
          {
            mediaAssetId,
            startSec: Math.round(startSec * 100) / 100,
            endSec: Math.round(Math.max(startSec + 0.6, endSec) * 100) / 100,
            zoom: i % 2 === 1 ? 1.08 : 1.0,
            cropX: 'center' as const
          }
        ];

    const edl = EdlSchema.parse({
      schemaVersion: '1.1',
      aspectRatio: isVertical ? '9:16' : '16:9',
      framingMode: targetConfig.framingMode,
      resolution,
      segments,
      audio: buildAudioConfig(targetConfig.initialAudioMode, targetConfig.platform),
      hookBanner: {
        enabled: true,
        text: tpl.hook,
        startSec: 0,
        endSec: Math.min(3.0, Math.max(1.0, (endSec - startSec) * 0.6)),
        position: 'top_safe_zone'
      },
      captions: {
        enabled: targetConfig.captionStyle !== 'off',
        style: targetConfig.captionStyle,
        fontFamily: 'Segoe UI',
        safeZonePreset,
        verticalOffsetPct: targetConfig.platform === 'tiktok' ? 72 : 75,
        overrides: []
      },
      supportingOverlays: {
        watermarkAssetId: targetConfig.supportingAssets?.watermarkAssetId ?? null,
        watermarkPosition: 'top_left_safe',
        watermarkOpacity: 0.85,
        outroAssetId: targetConfig.supportingAssets?.outroAssetId ?? null
      },
      complianceOverlays: {
        ctaText: ctaLine.slice(0, 110),
        ctaStartSec: Math.max(0, Math.round((endSec - startSec - 3.5) * 100) / 100),
        disclosureText: ''
      }
    });

    drafts.push({
      sequenceIndex: i + 1,
      angleTitle: `${tpl.title} #${i + 1}`,
      hookSummary: tpl.hook,
      edl
    });
  }

  return drafts;
}

export async function planMultiVariantEdls(params: {
  userId: string;
  mediaAssetId: string;
  mediaDurationSec: number;
  rulebook: BriefRulebook | null;
  targetConfig: TargetConfig;
  transcript: TranscriptPayload | null;
  silences: SilenceInterval[];
  pacingBlueprint?: PacingBlueprint | null;
}): Promise<{ drafts: PlannedClipDraft[]; tokensUsed: number; mode: 'ai' | 'local_heuristic' }> {
  const heuristicDrafts = buildHeuristicMultiVariantEdls(params);
  const brainKey = await getActiveKeyForRole(params.userId, 'brain');
  if (!brainKey) {
    return { drafts: heuristicDrafts, tokensUsed: 0, mode: 'local_heuristic' };
  }

  const systemPrompt =
    'Anda adalah AI Video Director untuk Content Rewards TikTok & YouTube. ' +
    'Buat tepat N variasi rencana edit (EDL JSON v1.1) dalam format {"clips":[{"angleTitle":string,"hookSummary":string,"edl":{...}}]}. ' +
    'Semua startSec dan endSec WAJIB berada di antara 0 dan durasi video sumber. ' +
    'Patuhi framingMode, mode audio, aturan brief, dan jika referencePacingBlueprint tersedia maka ikuti pola panjang shot, ritme potongan multi-segmen, dan aksen zoom-nya pada video sumber campaign tanpa meniru materi video lain.';

  const compactWords = (params.transcript?.words ?? [])
    .slice(0, 450)
    .map((w) => `[${w.startSec.toFixed(1)}]${w.word}`)
    .join(' ');

  const userPrompt = JSON.stringify({
    mediaAssetId: params.mediaAssetId,
    mediaDurationSec: params.mediaDurationSec,
    requestedCount: params.targetConfig.batchCount,
    targetConfig: params.targetConfig,
    briefRulebook: params.rulebook,
    referencePacingBlueprint: params.pacingBlueprint ?? null,
    transcriptSample: compactWords || '(visual only / belum ditranskrip)'
  });

  try {
    const res = await generateStructuredJsonWithByok({
      key: brainKey,
      systemPrompt,
      userPrompt,
      temperature: 0.45
    });
    const parsed = AiDirectorResponseSchema.parse(res.json);
    const normalized = parsed.clips.slice(0, params.targetConfig.batchCount).map((clip, idx) => ({
      sequenceIndex: idx + 1,
      angleTitle: clip.angleTitle,
      hookSummary: clip.hookSummary,
      edl: {
        ...clip.edl,
        audio: buildAudioConfig(params.targetConfig.initialAudioMode, params.targetConfig.platform),
        framingMode: params.targetConfig.framingMode,
        supportingOverlays: {
          ...clip.edl.supportingOverlays,
          watermarkAssetId: params.targetConfig.supportingAssets?.watermarkAssetId ?? null,
          outroAssetId: params.targetConfig.supportingAssets?.outroAssetId ?? null
        }
      }
    }));

    return {
      drafts: normalized.length > 0 ? normalized : heuristicDrafts,
      tokensUsed: res.tokensUsed,
      mode: 'ai'
    };
  } catch {
    return { drafts: heuristicDrafts, tokensUsed: 0, mode: 'local_heuristic' };
  }
}
