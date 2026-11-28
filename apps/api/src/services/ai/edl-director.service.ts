import { z } from 'zod';
import {
  EdlSchema,
  type BriefRulebook,
  type ClipEndingMode,
  type EdlDocument,
  type PacingBlueprint,
  type SilenceInterval,
  type TargetConfig,
  type TranscriptPayload
} from '@clip/shared';
import { generateStructuredJsonWithByok, getActiveKeyForRole } from './llm-json.adapter.js';
import {
  resolveContentLanguage,
  snapSegmentToSpeechBoundary
} from './content-language.helper.js';

export interface DirectorRawSource {
  id: string;
  originalFilename?: string;
  durationSec: number;
  transcript: TranscriptPayload | null;
  silences: SilenceInterval[];
}

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

const AiCompactSegmentSchema = z.object({
  mediaAssetId: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  zoom: z.number().min(1).max(2.5).optional(),
  cropX: z.enum(['left', 'center', 'right']).optional()
});

const AiCompactClipSchema = z.object({
  angleTitle: z.string().min(2).max(140),
  hookSummary: z.string().min(2).max(220),
  hookBannerText: z.string().max(120).optional(),
  ctaText: z.string().max(120).optional(),
  segments: z.array(AiCompactSegmentSchema).min(1).optional(),
  edl: z.object({
    segments: z.array(AiCompactSegmentSchema).min(1),
    hookBanner: z.object({ text: z.string().max(120).optional() }).optional(),
    complianceOverlays: z.object({ ctaText: z.string().max(120).optional() }).optional()
  }).optional()
});

const AiDirectorResponseSchema = z.object({
  clips: z.array(AiCompactClipSchema).min(1)
});

const INDONESIAN_LEAK_REGEX = /\b(ikuti|simpan untuk|kebanyakan orang|wajib tahu|jangan lewatkan|langkah di sini|cek detail sekarang|sudut kontras|hook langsung|poin cepat|pemancing diskusi)\b/i;

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
  const estimatedOutputTokens = params.batchCount * 550;
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

function resolveRawSources(params: {
  mediaAssetId: string;
  mediaDurationSec: number;
  rawVideos?: DirectorRawSource[];
  transcript?: TranscriptPayload | null;
  silences?: SilenceInterval[];
}): DirectorRawSource[] {
  if (params.rawVideos && params.rawVideos.length > 0) {
    return params.rawVideos.map((v) => ({
      id: v.id,
      originalFilename: v.originalFilename,
      durationSec: Math.max(1.2, v.durationSec),
      transcript: v.transcript ?? null,
      silences: v.silences ?? []
    }));
  }
  return [
    {
      id: params.mediaAssetId,
      durationSec: Math.max(1.2, params.mediaDurationSec),
      transcript: params.transcript ?? null,
      silences: params.silences ?? []
    }
  ];
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

function getLocalizedTemplates(targetConfig: TargetConfig, rulebook: BriefRulebook | null) {
  const lang = resolveContentLanguage(targetConfig);
  const hashtagsSnippet = rulebook?.requiredHashtags?.slice(0, 2).join(' ') ?? '';

  if (lang.code === 'en') {
    const cleanNiche = /^[a-z0-9\s&/+-]+$/i.test(targetConfig.personaNiche) && !/kreator|pekerja muda/i.test(targetConfig.personaNiche)
      ? targetConfig.personaNiche
      : 'this';
    return {
      lang,
      angles: [
        { title: 'Direct Hook Cut', hook: `Wait until you see this (${cleanNiche})` },
        { title: 'Contrast Angle', hook: 'Most people get this completely wrong' },
        { title: 'Key Takeaway', hook: `Watch this before you scroll (${targetConfig.countryCode})` },
        { title: 'Debate Opener', hook: 'Do you agree with this take?' },
        { title: 'Result Spotlight', hook: 'Watch what happens in the final seconds' }
      ],
      defaultCta: hashtagsSnippet ? `Check details now ${hashtagsSnippet}` : 'Follow & save for later!',
      partTeaserCta: (nextPart: number) =>
        hashtagsSnippet
          ? `Follow for Part ${nextPart}! ${hashtagsSnippet}`
          : `Follow for Part ${nextPart}!`,
      partFinalCta: hashtagsSnippet
        ? `Watch Part 1 on profile! ${hashtagsSnippet}`
        : 'Watch Part 1 on profile & follow for more!'
    };
  }

  return {
    lang,
    angles: [
      { title: 'Angle Hook Langsung', hook: `Stop scroll! Ini rahasia ${targetConfig.personaNiche}` },
      { title: 'Angle Sudut Kontras', hook: 'Kebanyakan orang masih salah langkah di sini' },
      { title: 'Angle Poin Cepat', hook: `Wajib tahu sebelum terlambat (${targetConfig.countryCode})` },
      { title: 'Angle Pemancing Diskusi', hook: 'Setuju atau tidak dengan cara ini?' },
      { title: 'Angle Bukti & Hasil', hook: 'Lihat perbedaannya dalam hitungan detik' }
    ],
    defaultCta: hashtagsSnippet ? `Cek detail sekarang ${hashtagsSnippet}` : 'Ikuti dan simpan untuk referensi!',
    partTeaserCta: (nextPart: number) =>
      hashtagsSnippet
        ? `Lanjut ke Part ${nextPart}! ${hashtagsSnippet}`
        : `Ikuti untuk lanjut ke Part ${nextPart}!`,
    partFinalCta: hashtagsSnippet
      ? `Tonton Part 1 di profil! ${hashtagsSnippet}`
      : 'Tonton Part 1 di profil & simpan video ini!'
  };
}

function buildCompleteEdl(params: {
  targetConfig: TargetConfig;
  segments: EdlDocument['segments'];
  hookText: string;
  ctaText: string;
}): EdlDocument {
  const { targetConfig, segments, hookText, ctaText } = params;
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

  const totalClipDur = segments.reduce((sum, s) => sum + Math.max(0.5, s.endSec - s.startSec), 0);

  return EdlSchema.parse({
    schemaVersion: '1.1',
    aspectRatio: isVertical ? '9:16' : '16:9',
    framingMode: targetConfig.framingMode,
    resolution,
    segments,
    audio: buildAudioConfig(targetConfig.initialAudioMode, targetConfig.platform),
    hookBanner: {
      enabled: Boolean(hookText.trim()),
      text: hookText.trim().slice(0, 115),
      startSec: 0,
      endSec: Math.min(3.0, Math.max(1.0, totalClipDur * 0.45)),
      position: 'top_safe_zone'
    },
    captions: {
      enabled: targetConfig.captionStyle !== 'off',
      style: targetConfig.captionStyle,
      fontFamily: 'Segoe UI',
      safeZonePreset,
      verticalOffsetPct: targetConfig.platform === 'tiktok' ? 66 : 72,
      overrides: []
    },
    supportingOverlays: {
      watermarkAssetId: targetConfig.supportingAssets?.watermarkAssetId ?? null,
      watermarkPosition: 'top_left_safe',
      watermarkOpacity: 0.85,
      outroAssetId: targetConfig.supportingAssets?.outroAssetId ?? null
    },
    complianceOverlays: {
      ctaText: ctaText.trim().slice(0, 110),
      ctaStartSec: Math.max(0, Math.round((totalClipDur - 3.5) * 100) / 100),
      disclosureText: ''
    }
  });
}

export function buildHeuristicMultiVariantEdls(params: {
  mediaAssetId: string;
  mediaDurationSec: number;
  rawVideos?: DirectorRawSource[];
  rulebook: BriefRulebook | null;
  targetConfig: TargetConfig;
  transcript?: TranscriptPayload | null;
  silences: SilenceInterval[];
  pacingBlueprint?: PacingBlueprint | null;
}): PlannedClipDraft[] {
  const { rulebook, targetConfig, pacingBlueprint } = params;
  const rawSources = resolveRawSources(params);
  const count = targetConfig.batchCount;
  const endingMode: ClipEndingMode = targetConfig.clipEndingMode ?? 'complete_story';
  const localized = getLocalizedTemplates(targetConfig, rulebook);

  // Hitung distribusi slot per video mentah agar SEMUA video mentah yang diunggah benar-benar terpakai
  const assignedSourceByIdx = Array.from({ length: count }, (_, i) => rawSources[i % rawSources.length]);
  const totalUsesPerSource = new Map<string, number>();
  for (const src of assignedSourceByIdx) {
    totalUsesPerSource.set(src.id, (totalUsesPerSource.get(src.id) ?? 0) + 1);
  }
  const seenCountPerSource = new Map<string, number>();
  const lastEndBySource = new Map<string, number>();

  const maxRuleDur = rulebook?.durationRules.maxSec ?? 60;
  const drafts: PlannedClipDraft[] = [];

  for (let i = 0; i < count; i += 1) {
    const src = assignedSourceByIdx[i];
    const sourceUseIdx = seenCountPerSource.get(src.id) ?? 0;
    const sourceTotalUses = totalUsesPerSource.get(src.id) ?? 1;
    seenCountPerSource.set(src.id, sourceUseIdx + 1);

    const totalDur = Math.max(1.2, src.durationSec);
    const tpl = localized.angles[i % localized.angles.length];

    let rawStart = 0;
    let rawEnd = totalDur;

    if (endingMode === 'full_source') {
      // Video utuh 100% dari awal hingga akhir tanpa memotong kalimat penutup
      rawStart = 0;
      rawEnd = totalDur;
    } else if (endingMode === 'part_series' && sourceTotalUses > 1 && totalDur >= 4) {
      // Bagi secara berurutan menjadi Part 1 -> Part 2 -> ... tanpa tumpang tindih
      const prevEnd = lastEndBySource.get(src.id) ?? 0;
      const remaining = Math.max(1.2, totalDur - prevEnd);
      const partsLeft = sourceTotalUses - sourceUseIdx;
      const targetPartLen = Math.min(maxRuleDur, Math.max(1.2, remaining / partsLeft));
      rawStart = prevEnd;
      rawEnd = sourceUseIdx === sourceTotalUses - 1 ? totalDur : Math.min(totalDur, prevEnd + targetPartLen);
    } else if (sourceTotalUses === 1 && totalDur <= maxRuleDur + 5) {
      // Video sudah muat di batas durasi brief: JANGAN dipotong paksa di tengah jalan!
      rawStart = 0;
      rawEnd = totalDur;
    } else if (targetConfig.batchDiversityMode === 'distinct_moments' && totalDur > 6) {
      const targetLen = Math.min(
        totalDur,
        maxRuleDur,
        Math.max(rulebook?.durationRules.minSec ?? 15, Math.round(totalDur / Math.max(1, sourceTotalUses)))
      );
      const maxStart = Math.max(0, totalDur - targetLen);
      const step = sourceTotalUses > 1 ? maxStart / (sourceTotalUses - 1) : 0;
      rawStart = step * sourceUseIdx;
      rawEnd = Math.min(totalDur, rawStart + targetLen);
    } else {
      // Mode A/B Hook Test atau video sangat pendek
      const sliceLen = Math.min(totalDur, maxRuleDur);
      rawStart = totalDur > sliceLen + 1 ? Math.min(totalDur - sliceLen, sourceUseIdx * 0.35) : 0;
      rawEnd = Math.min(totalDur, rawStart + sliceLen);
    }

    const snapped = snapSegmentToSpeechBoundary({
      startSec: rawStart,
      endSec: rawEnd,
      mediaDurationSec: totalDur,
      words: src.transcript?.words ?? [],
      silences: src.silences,
      mode: endingMode,
      maxAllowedEndSec: endingMode === 'full_source' ? totalDur : Math.min(totalDur, rawStart + maxRuleDur + 4)
    });

    lastEndBySource.set(src.id, snapped.endSec);

    const startSec = snapped.startSec;
    const endSec = snapped.endSec;
    const sliceDur = Math.max(0.6, endSec - startSec);

    let segments: EdlDocument['segments'];
    if (pacingBlueprint) {
      segments = buildPacedSegmentsFromBlueprint({
        mediaAssetId: src.id,
        windowStartSec: startSec,
        windowEndSec: endSec,
        mediaDurationSec: totalDur,
        blueprint: pacingBlueprint,
        variantIdx: i
      });
    } else if (targetConfig.framingMode === 'auto_face_track' && sliceDur >= 3.5) {
      const winCount = Math.min(4, Math.max(2, Math.round(sliceDur / 2.8)));
      const winLen = sliceDur / winCount;
      segments = Array.from({ length: winCount }, (_, wIdx) => {
        const s = Math.round((startSec + wIdx * winLen) * 100) / 100;
        const e = wIdx === winCount - 1
          ? Math.round(endSec * 100) / 100
          : Math.round((startSec + (wIdx + 1) * winLen) * 100) / 100;
        return {
          mediaAssetId: src.id,
          startSec: s,
          endSec: Math.max(s + 0.5, e),
          zoom: i % 2 === 1 && wIdx % 2 === 1 ? 1.08 : 1.0,
          cropX: 'center' as const,
          focusX: 0.5
        };
      });
    } else {
      segments = [
        {
          mediaAssetId: src.id,
          startSec,
          endSec: Math.max(startSec + 0.6, endSec),
          zoom: i % 2 === 1 ? 1.06 : 1.0,
          cropX: 'center' as const
        }
      ];
    }

    const isPartSeries = endingMode === 'part_series' && count > 1;
    const isLastPart = i === count - 1;
    const ctaText = isPartSeries
      ? (isLastPart ? localized.partFinalCta : localized.partTeaserCta(i + 2))
      : localized.defaultCta;

    const partLabel = isPartSeries ? `Part ${i + 1}` : `#${i + 1}`;
    const angleTitle = `${tpl.title} ${partLabel}`;
    const hookText = isPartSeries && i > 0
      ? (localized.lang.code === 'en' ? `Part ${i + 1}: ${tpl.hook}` : `Part ${i + 1}: ${tpl.hook}`)
      : tpl.hook;

    const edl = buildCompleteEdl({
      targetConfig,
      segments,
      hookText,
      ctaText
    });

    drafts.push({
      sequenceIndex: i + 1,
      angleTitle,
      hookSummary: hookText,
      edl
    });
  }

  return drafts;
}

export async function planMultiVariantEdls(params: {
  userId: string;
  mediaAssetId: string;
  mediaDurationSec: number;
  rawVideos?: DirectorRawSource[];
  rulebook: BriefRulebook | null;
  targetConfig: TargetConfig;
  transcript: TranscriptPayload | null;
  silences: SilenceInterval[];
  pacingBlueprint?: PacingBlueprint | null;
}): Promise<{ drafts: PlannedClipDraft[]; tokensUsed: number; mode: 'ai' | 'local_heuristic' }> {
  const rawSources = resolveRawSources(params);
  const heuristicDrafts = buildHeuristicMultiVariantEdls({
    ...params,
    rawVideos: rawSources
  });
  const brainKey = await getActiveKeyForRole(params.userId, 'brain');
  if (!brainKey) {
    return { drafts: heuristicDrafts, tokensUsed: 0, mode: 'local_heuristic' };
  }

  const localized = getLocalizedTemplates(params.targetConfig, params.rulebook);
  const endingMode: ClipEndingMode = params.targetConfig.clipEndingMode ?? 'complete_story';
  const maxRuleDur = params.rulebook?.durationRules.maxSec ?? 60;

  const endingInstruction =
    endingMode === 'full_source'
      ? 'MODE FULL_SOURCE: Keep each source video COMPLETE from 0 to full durationSec without cutting off the ending.'
      : endingMode === 'part_series'
        ? 'MODE PART_SERIES: Split into clean sequential parts (Part 1, Part 2, ...). Part 1 MUST end at a natural cliffhanger/sentence boundary and include a "Part 2" teaser in ctaText!'
        : 'MODE COMPLETE_STORY: NEVER cut a speaker mid-sentence! Always end at a complete sentence boundary or full video end. If a source video already fits within brief maxSec, keep the complete story intact instead of truncating early.';

  const languageRule =
    localized.lang.code === 'en'
      ? `STRICT LANGUAGE LOCK (${localized.lang.label} for country ${params.targetConfig.countryCode}): ALL angleTitle, hookSummary, hookBannerText, and ctaText MUST be 100% written in natural ${localized.lang.label}. ZERO Indonesian words allowed (to prevent YouTube/TikTok algorithm geo-misclassification)!`
      : 'BAHASA KONTEN: Tulis angleTitle, hookSummary, hookBannerText, dan ctaText dalam Bahasa Indonesia santai dan tajam tanpa em-dash.';

  const systemPrompt =
    'You are an expert Viral Short-Form Video Director for TikTok & YouTube Shorts. ' +
    'Return compact JSON ONLY: {"clips":[{"angleTitle":string,"hookSummary":string,"hookBannerText":string,"ctaText":string,"segments":[{"mediaAssetId":string,"startSec":number,"endSec":number,"zoom":number,"cropX":"center"|"left"|"right"}]}]}. ' +
    `Create EXACTLY ${params.targetConfig.batchCount} clips. ` +
    `MULTI-VIDEO RULE: You are provided ${rawSources.length} raw source video(s) in rawVideos[]. Distribute clips across ALL uploaded rawVideos so every video is utilized (never ignore other rawVideos!). ` +
    'Use ONLY exact mediaAssetId values from rawVideos[] and keep 0 <= startSec < endSec <= durationSec. ' +
    `${endingInstruction} ${languageRule}`;

  const wordsPerVideoBudget = Math.max(55, Math.floor(220 / Math.max(1, rawSources.length)));
  const rawVideosPayload = rawSources.map((src, idx) => {
    const words = src.transcript?.words ?? [];
    const sample = words
      .slice(0, wordsPerVideoBudget)
      .map((w) => `[${w.startSec.toFixed(1)}]${w.word}`)
      .join(' ');
    return {
      index: idx + 1,
      mediaAssetId: src.id,
      filename: src.originalFilename ?? `raw-${idx + 1}.mp4`,
      durationSec: Math.round(src.durationSec * 100) / 100,
      silenceCount: src.silences.length,
      transcriptSample: sample || '(visual only / no transcript yet)'
    };
  });

  const userPrompt = JSON.stringify({
    requestedCount: params.targetConfig.batchCount,
    clipEndingMode: endingMode,
    targetLanguage: localized.lang.label,
    targetConfig: {
      platform: params.targetConfig.platform,
      countryCode: params.targetConfig.countryCode,
      languageStyle: params.targetConfig.languageStyle,
      ageGroup: params.targetConfig.ageGroup,
      personaNiche: params.targetConfig.personaNiche,
      controversyLevel: params.targetConfig.controversyLevel,
      hookType: params.targetConfig.hookType,
      emotionalTrigger: params.targetConfig.emotionalTrigger,
      primaryKpi: params.targetConfig.primaryKpi,
      editingStyle: params.targetConfig.editingStyle,
      batchDiversityMode: params.targetConfig.batchDiversityMode
    },
    briefRulebook: params.rulebook,
    rawVideos: rawVideosPayload,
    referencePacingBlueprint: params.pacingBlueprint
      ? {
          shotCount: params.pacingBlueprint.shotCount,
          avgShotDurationSec: params.pacingBlueprint.avgShotDurationSec,
          estimatedBpm: params.pacingBlueprint.estimatedBpm,
          shots: params.pacingBlueprint.shots.slice(0, 6)
        }
      : null
  });

  try {
    const res = await generateStructuredJsonWithByok({
      key: brainKey,
      systemPrompt,
      userPrompt,
      temperature: 0.4,
      maxOutputTokens: Math.min(4096, Math.max(1400, params.targetConfig.batchCount * 520))
    });
    const parsed = AiDirectorResponseSchema.parse(res.json);
    const sourceMap = new Map(rawSources.map((s) => [s.id, s]));

    const normalized: PlannedClipDraft[] = [];
    const targetCount = params.targetConfig.batchCount;

    for (let idx = 0; idx < targetCount; idx += 1) {
      const aiClip = parsed.clips[idx];
      const fallback = heuristicDrafts[idx];
      if (!aiClip) {
        if (fallback) normalized.push(fallback);
        continue;
      }

      const rawSegs = aiClip.segments ?? aiClip.edl?.segments ?? [];
      const sanitizedSegments: EdlDocument['segments'] = [];

      for (const seg of rawSegs) {
        const src = sourceMap.get(seg.mediaAssetId) ?? rawSources[idx % rawSources.length];
        const snapped = snapSegmentToSpeechBoundary({
          startSec: seg.startSec,
          endSec: seg.endSec,
          mediaDurationSec: src.durationSec,
          words: src.transcript?.words ?? [],
          silences: src.silences,
          mode: endingMode,
          maxAllowedEndSec: endingMode === 'full_source' ? src.durationSec : Math.min(src.durationSec, seg.startSec + maxRuleDur + 4)
        });
        sanitizedSegments.push({
          mediaAssetId: src.id,
          startSec: snapped.startSec,
          endSec: snapped.endSec,
          zoom: Math.round(Math.min(2.5, Math.max(1.0, seg.zoom ?? 1.0)) * 100) / 100,
          cropX: seg.cropX ?? 'center'
        });
      }

      const finalSegments = sanitizedSegments.length > 0 ? sanitizedSegments : fallback.edl.segments;

      const sanitizeCopy = (text: string | undefined, backup: string): string => {
        const cleaned = (text ?? '').trim();
        if (!cleaned) return backup;
        if (localized.lang.code === 'en' && INDONESIAN_LEAK_REGEX.test(cleaned)) {
          return backup;
        }
        return cleaned;
      };

      const angleTitle = sanitizeCopy(aiClip.angleTitle, fallback.angleTitle);
      const hookSummary = sanitizeCopy(aiClip.hookSummary, fallback.hookSummary);
      const hookBannerText = sanitizeCopy(
        aiClip.hookBannerText ?? aiClip.edl?.hookBanner?.text ?? aiClip.hookSummary,
        fallback.edl.hookBanner.text
      );
      const ctaText = sanitizeCopy(
        aiClip.ctaText ?? aiClip.edl?.complianceOverlays?.ctaText,
        fallback.edl.complianceOverlays.ctaText
      );

      normalized.push({
        sequenceIndex: idx + 1,
        angleTitle,
        hookSummary,
        edl: buildCompleteEdl({
          targetConfig: params.targetConfig,
          segments: finalSegments,
          hookText: hookBannerText,
          ctaText
        })
      });
    }

    // Jaminan Multi-Video: jika user mengunggah >= 2 video mentah & minta >= 2 variasi namun AI hanya memakai 1 video,
    // gantikan variasi duplikat dengan rencana sumber video mentah lain yang belum terpakai.
    if (rawSources.length >= 2 && normalized.length >= 2) {
      const usedMediaIds = new Set(normalized.flatMap((d) => d.edl.segments.map((s) => s.mediaAssetId)));
      if (usedMediaIds.size === 1) {
        for (let idx = 1; idx < normalized.length; idx += 1) {
          const expectedSrc = rawSources[idx % rawSources.length];
          if (!usedMediaIds.has(expectedSrc.id) && heuristicDrafts[idx]) {
            normalized[idx] = {
              ...heuristicDrafts[idx],
              sequenceIndex: idx + 1
            };
            usedMediaIds.add(expectedSrc.id);
          }
        }
      }
    }

    return {
      drafts: normalized.length > 0 ? normalized : heuristicDrafts,
      tokensUsed: res.tokensUsed,
      mode: 'ai'
    };
  } catch {
    return { drafts: heuristicDrafts, tokensUsed: 0, mode: 'local_heuristic' };
  }
}
