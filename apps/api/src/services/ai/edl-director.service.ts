import { z } from 'zod';
import {
  EdlSchema,
  SegmentMotionSchema,
  SegmentTransitionSchema,
  type BriefRulebook,
  type CinemaColorGrade,
  type ClipEndingMode,
  type EditAssemblyMode,
  type EdlDocument,
  type PacingBlueprint,
  type SegmentMotion,
  type SegmentTransition,
  type SilenceInterval,
  type TargetConfig,
  type TranscriptPayload
} from '@clip/shared';
import { generateStructuredJsonWithByok, getActiveKeyForRole, type MultimodalImagePart } from './llm-json.adapter.js';
import {
  resolveContentLanguage,
  snapSegmentToSpeechBoundary
} from './content-language.helper.js';
import type { VideoStoryboard } from '../media/vision-storyboard.service.js';

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
  cropX: z.enum(['left', 'center', 'right']).optional(),
  transition: SegmentTransitionSchema.optional(),
  transitionDurationSec: z.number().min(0.1).max(0.8).optional(),
  speed: z.number().min(0.6).max(1.6).optional(),
  motion: SegmentMotionSchema.optional()
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
  const estimatedInputTokens = 1100 + briefTokens + Math.min(transcriptTokens, 8000);
  const estimatedOutputTokens = params.batchCount * 650;
  const estimatedRenderSeconds = Math.max(10, params.batchCount * Math.ceil(params.targetDurationSec * 0.55));

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
        cropX: 'center',
        transition: 'cut',
        transitionDurationSec: 0.3,
        speed: 1.0,
        motion: 'none'
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
      cropX: 'center',
      transition: 'cut',
      transitionDurationSec: 0.3,
      speed: 1.0,
      motion: 'none'
    });

    cursor = segEnd;
    if (cursor >= Math.min(windowEndSec, mediaDurationSec) - 0.45) break;
  }

  return segments;
}

function getLocalizedTemplates(targetConfig: TargetConfig, rulebook: BriefRulebook | null) {
  const lang = resolveContentLanguage(targetConfig);
  const hashtagsSnippet = rulebook?.requiredHashtags?.slice(0, 2).join(' ') ?? '';

  if (lang.code === 'en') {
    const cleanNiche = /^[a-z0-9\s&/+-]+$/i.test(targetConfig.personaNiche) && !/kreator|pekerja muda/i.test(targetConfig.personaNiche)
      ? targetConfig.personaNiche
      : 'this drop';
    return {
      lang,
      cinemaAngles: [
        { title: 'Cinema Trailer Remix', hook: `Wait until you see how this unfolds (${cleanNiche})` },
        { title: 'A-Roll + B-Roll Story Cut', hook: 'Behind the scenes nobody expected' },
        { title: 'Flash-Forward Climax Edit', hook: `Watch the ending first, then see how it started` },
        { title: 'High-Energy Commercial Cut', hook: `Blink and you will miss the best moment` },
        { title: 'Cinematic Showcase Montage', hook: 'Every angle brought together in one reel' }
      ],
      singleAngles: [
        { title: 'Direct Hook Cut', hook: `Wait until you see this (${cleanNiche})` },
        { title: 'Contrast Angle', hook: 'Most people get this completely wrong' },
        { title: 'Key Takeaway', hook: `Watch this before you scroll (${targetConfig.countryCode})` },
        { title: 'Debate Opener', hook: 'Do you agree with this take?' },
        { title: 'Result Spotlight', hook: 'Watch what happens in the final seconds' }
      ],
      defaultCta: hashtagsSnippet ? `Check details now ${hashtagsSnippet}` : 'Follow & save for later!',
      partTeaserCta: (nextPart: number) =>
        hashtagsSnippet ? `Follow for Part ${nextPart}! ${hashtagsSnippet}` : `Follow for Part ${nextPart}!`,
      partFinalCta: hashtagsSnippet ? `Watch Part 1 on profile! ${hashtagsSnippet}` : 'Watch Part 1 on profile & follow for more!'
    };
  }

  return {
    lang,
    cinemaAngles: [
      { title: 'Remix Trailer Sinematik', hook: `Tunggu sampai akhir, begini gabungannya!` },
      { title: 'Cerita A-Roll + B-Roll', hook: 'Momen di balik layar yang bikin nagih' },
      { title: 'Hook Flash-Forward Klimaks', hook: 'Lihat puncaknya dulu, baru awal ceritanya' },
      { title: 'Komersial Cepat Multi-Angle', hook: 'Jangan kedip, semua momen terbaik disatukan' },
      { title: 'Montage Sinematik Penuh', hook: 'Gabungan sudut terbaik dalam satu tayangan' }
    ],
    singleAngles: [
      { title: 'Angle Hook Langsung', hook: `Stop scroll! Ini rahasia ${targetConfig.personaNiche}` },
      { title: 'Angle Sudut Kontras', hook: 'Kebanyakan orang masih salah langkah di sini' },
      { title: 'Angle Poin Cepat', hook: `Wajib tahu sebelum terlambat (${targetConfig.countryCode})` },
      { title: 'Angle Pemancing Diskusi', hook: 'Setuju atau tidak dengan cara ini?' },
      { title: 'Angle Bukti & Hasil', hook: 'Lihat perbedaannya dalam hitungan detik' }
    ],
    defaultCta: hashtagsSnippet ? `Cek detail sekarang ${hashtagsSnippet}` : 'Ikuti dan simpan untuk referensi!',
    partTeaserCta: (nextPart: number) =>
      hashtagsSnippet ? `Lanjut ke Part ${nextPart}! ${hashtagsSnippet}` : `Ikuti untuk lanjut ke Part ${nextPart}!`,
    partFinalCta: hashtagsSnippet ? `Tonton Part 1 di profil! ${hashtagsSnippet}` : 'Tonton Part 1 di profil & simpan video ini!'
  };
}

function clampSlice(src: DirectorRawSource, start: number, len: number): { startSec: number; endSec: number } {
  const dur = Math.max(1.2, src.durationSec);
  const safeStart = Math.max(0, Math.min(start, Math.max(0, dur - 0.8)));
  const safeEnd = Math.min(dur, Math.max(safeStart + 0.7, safeStart + len));
  return {
    startSec: Math.round(safeStart * 100) / 100,
    endSec: Math.round(safeEnd * 100) / 100
  };
}

function buildCompleteEdl(params: {
  targetConfig: TargetConfig;
  segments: EdlDocument['segments'];
  hookText: string;
  ctaText: string;
  colorGrade?: CinemaColorGrade;
  directorMode?: 'ai_vision' | 'ai_text' | 'local_cinema_heuristic';
  directorNote?: string;
}): EdlDocument {
  const { targetConfig, segments, hookText, ctaText, colorGrade, directorMode, directorNote } = params;
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

  const totalClipDur = segments.reduce((sum, s) => sum + Math.max(0.5, (s.endSec - s.startSec) / (s.speed ?? 1.0)), 0);

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
      endSec: Math.min(3.0, Math.max(1.0, totalClipDur * 0.4)),
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
    },
    colorGrade: colorGrade ?? targetConfig.colorGrade ?? 'natural',
    cinemaSfx: false,
    directorMode,
    directorNote
  });
}

// Merakit 5 struktur film Cinema Multi-Video Remix yang benar-benar menggabungkan momen Video 1 + 2 + 3
// ke dalam SATU hasil video baru (bukan 1 video utuh ditempel teks saja!)
function buildCinemaMultiVideoRemixSegments(params: {
  rawSources: DirectorRawSource[];
  variantIdx: number;
  maxRuleDur: number;
  enableTransitions: boolean;
  endingMode: ClipEndingMode;
}): EdlDocument['segments'] {
  const { rawSources, variantIdx, maxRuleDur, enableTransitions, endingMode } = params;
  const sortedByDur = [...rawSources].sort((a, b) => b.durationSec - a.durationSec);
  const mainVid = sortedByDur[0];
  const secondaryVids = sortedByDur.slice(1);
  const tr = (name: SegmentTransition): SegmentTransition => (enableTransitions ? name : 'cut');

  const mkSeg = (
    src: DirectorRawSource,
    rawStart: number,
    len: number,
    opts: {
      zoom?: number;
      transition?: SegmentTransition;
      speed?: number;
      motion?: SegmentMotion;
      snapSpeech?: boolean;
    } = {}
  ): EdlDocument['segments'][number] => {
    const sliced = clampSlice(src, rawStart, len);
    const finalRange = opts.snapSpeech
      ? snapSegmentToSpeechBoundary({
          startSec: sliced.startSec,
          endSec: sliced.endSec,
          mediaDurationSec: src.durationSec,
          words: src.transcript?.words ?? [],
          silences: src.silences,
          mode: endingMode === 'full_source' ? 'complete_story' : endingMode,
          maxAllowedEndSec: Math.min(src.durationSec, sliced.startSec + len + 2.5)
        })
      : sliced;

    return {
      mediaAssetId: src.id,
      startSec: finalRange.startSec,
      endSec: finalRange.endSec,
      zoom: opts.zoom ?? 1.0,
      cropX: 'center',
      transition: opts.transition ?? 'cut',
      transitionDurationSec: 0.3,
      speed: opts.speed ?? 1.0,
      motion: opts.motion ?? 'none'
    };
  };

  // Jika hanya ada 1 video mentah, buat potongan non-linear cinema (Flash-Forward Hook -> Core -> Payoff)
  if (secondaryVids.length === 0) {
    const dur = mainVid.durationSec;
    if (dur < 6) {
      return [mkSeg(mainVid, 0, dur, { zoom: variantIdx % 2 === 1 ? 1.06 : 1.0, motion: 'push_in' })];
    }
    const targetDur = Math.min(dur, Math.max(12, Math.min(maxRuleDur - 2, 34)));
    const climaxStart = Math.max(2, dur * (0.55 + (variantIdx % 3) * 0.1));
    const hookLen = Math.min(2.8, dur * 0.18);
    const bodyLen = Math.max(3, (targetDur - hookLen) * 0.65);
    const outroLen = Math.max(2.5, targetDur - hookLen - bodyLen);

    return [
      mkSeg(mainVid, climaxStart, hookLen, { zoom: 1.06, motion: 'push_in', speed: 1.05 }),
      mkSeg(mainVid, 0, bodyLen, { transition: tr('smoothleft'), snapSpeech: true }),
      mkSeg(mainVid, Math.max(bodyLen, dur - outroLen), outroLen, { transition: tr('dissolve'), motion: 'push_in', snapSpeech: true })
    ];
  }

  const v2 = secondaryVids[0];
  const v3 = secondaryVids[1] ?? secondaryVids[0];
  const budget = Math.max(12, Math.min(maxRuleDur - 2, 42));
  const style = variantIdx % 5;

  if (style === 0) {
    // 1. Movie Trailer Remix: Flash-Forward V2 -> Intro V1 -> Action Cutaway V3 -> Core V1 -> Climax V2 -> Payoff V1
    const segs = [
      mkSeg(v2, Math.min(1.0, v2.durationSec * 0.15), Math.min(2.6, v2.durationSec * 0.45), { zoom: 1.05, motion: 'push_in', speed: 1.05 }),
      mkSeg(mainVid, 0, Math.min(7.5, mainVid.durationSec * 0.25, budget * 0.22), { transition: tr('smoothleft'), snapSpeech: true }),
      mkSeg(v3, Math.min(2.0, v3.durationSec * 0.25), Math.min(3.2, v3.durationSec * 0.45), { transition: tr('wipeleft'), speed: 1.12, motion: 'push_in' }),
      mkSeg(mainVid, mainVid.durationSec * 0.35, Math.min(9.5, mainVid.durationSec * 0.25, budget * 0.26), { transition: tr('dissolve'), snapSpeech: true }),
      mkSeg(v2, Math.max(0, v2.durationSec - 3.2), Math.min(3.0, v2.durationSec * 0.45), { transition: tr('fade'), speed: 0.9, motion: 'push_in' }),
      mkSeg(mainVid, Math.max(0, mainVid.durationSec - Math.min(7.0, mainVid.durationSec * 0.22)), Math.min(6.8, mainVid.durationSec * 0.22), { transition: tr('dissolve'), snapSpeech: true })
    ];
    return segs;
  }

  if (style === 1) {
    // 2. Story A-Roll + B-Roll Intercut: Alur utama V1 disisipi B-Roll dinamis V2 & V3
    return [
      mkSeg(mainVid, 0, Math.min(6.5, mainVid.durationSec * 0.28), { motion: 'push_in', snapSpeech: true }),
      mkSeg(v2, 0.5, Math.min(3.5, v2.durationSec * 0.55), { transition: tr('fade'), zoom: 1.05 }),
      mkSeg(mainVid, mainVid.durationSec * 0.32, Math.min(8.5, mainVid.durationSec * 0.26), { transition: tr('dissolve'), snapSpeech: true }),
      mkSeg(v3, Math.min(1.5, v3.durationSec * 0.2), Math.min(3.5, v3.durationSec * 0.5), { transition: tr('smoothright'), motion: 'push_in', speed: 1.08 }),
      mkSeg(mainVid, Math.max(0, mainVid.durationSec - Math.min(8.0, mainVid.durationSec * 0.25)), Math.min(7.8, mainVid.durationSec * 0.25), { transition: tr('fade'), snapSpeech: true })
    ];
  }

  if (style === 2) {
    // 3. Flash-Forward Climax Edit: Buka momen klimaks V3 -> dip-to-black -> bangun cerita V1 + V2
    return [
      mkSeg(v3, Math.max(0, v3.durationSec * 0.4), Math.min(2.8, v3.durationSec * 0.45), { zoom: 1.08, motion: 'push_in' }),
      mkSeg(mainVid, mainVid.durationSec * 0.12, Math.min(8.0, mainVid.durationSec * 0.25), { transition: tr('fadeblack'), snapSpeech: true }),
      mkSeg(v2, Math.min(2.5, v2.durationSec * 0.3), Math.min(3.5, v2.durationSec * 0.5), { transition: tr('smoothleft'), speed: 1.1 }),
      mkSeg(mainVid, mainVid.durationSec * 0.62, Math.min(8.5, mainVid.durationSec * 0.28), { transition: tr('dissolve'), motion: 'push_in', snapSpeech: true })
    ];
  }

  if (style === 3) {
    // 4. High-Energy Commercial Cut (Padat 16-24s, pergantian cepat lintas semua video!)
    return [
      mkSeg(v2, 0, Math.min(2.5, v2.durationSec * 0.4), { zoom: 1.06, speed: 1.12 }),
      mkSeg(mainVid, mainVid.durationSec * 0.08, Math.min(4.2, mainVid.durationSec * 0.2), { transition: tr('smoothleft'), speed: 1.05 }),
      mkSeg(v3, Math.min(1.2, v3.durationSec * 0.2), Math.min(2.8, v3.durationSec * 0.45), { transition: tr('circleopen'), speed: 1.15, motion: 'push_in' }),
      mkSeg(mainVid, mainVid.durationSec * 0.45, Math.min(4.5, mainVid.durationSec * 0.2), { transition: tr('wipeleft'), speed: 1.05 }),
      mkSeg(v2, Math.max(0, v2.durationSec - 3.0), Math.min(2.8, v2.durationSec * 0.45), { transition: tr('smoothright'), speed: 0.92, motion: 'push_in' }),
      mkSeg(v3, Math.max(0, v3.durationSec - 2.6), Math.min(2.5, v3.durationSec * 0.45), { transition: tr('fade'), zoom: 1.05 })
    ];
  }

  // 5. Cinematic Showcase Montage: Tempo elegan dissolve lintas semua video
  return [
    mkSeg(v2, 0.4, Math.min(3.6, v2.durationSec * 0.55), { motion: 'push_in', speed: 0.92 }),
    mkSeg(mainVid, mainVid.durationSec * 0.18, Math.min(8.0, mainVid.durationSec * 0.26), { transition: tr('dissolve'), snapSpeech: true }),
    mkSeg(v3, 0.5, Math.min(4.0, v3.durationSec * 0.55), { transition: tr('fade'), motion: 'pull_out', speed: 0.95 }),
    mkSeg(mainVid, Math.max(0, mainVid.durationSec - Math.min(7.5, mainVid.durationSec * 0.24)), Math.min(7.2, mainVid.durationSec * 0.24), { transition: tr('dissolve'), motion: 'push_in', snapSpeech: true })
  ];
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
  directorNote?: string;
}): PlannedClipDraft[] {
  const { rulebook, targetConfig, pacingBlueprint } = params;
  const rawSources = resolveRawSources(params);
  const count = targetConfig.batchCount;
  const endingMode: ClipEndingMode = targetConfig.clipEndingMode ?? 'complete_story';
  const assemblyMode: EditAssemblyMode = targetConfig.editAssemblyMode ?? 'cinema_remix';
  const enableTransitions = targetConfig.enableCinemaTransitions ?? true;
  const localized = getLocalizedTemplates(targetConfig, rulebook);
  const maxRuleDur = rulebook?.durationRules.maxSec ?? 60;

  // MODE 1: CINEMA MULTI-VIDEO REMIX (Gabungkan banyak mentahan menjadi film baru!)
  // Aktif otomatis ketika editAssemblyMode === 'cinema_remix' dan tidak sedang mode part_series / full_source / pacingBlueprint
  if (
    assemblyMode === 'cinema_remix' &&
    endingMode === 'complete_story' &&
    !pacingBlueprint &&
    rawSources.length >= 2
  ) {
    const drafts: PlannedClipDraft[] = [];
    for (let i = 0; i < count; i += 1) {
      const tpl = localized.cinemaAngles[i % localized.cinemaAngles.length];
      const segments = buildCinemaMultiVideoRemixSegments({
        rawSources,
        variantIdx: i,
        maxRuleDur,
        enableTransitions,
        endingMode
      });
      const edl = buildCompleteEdl({
        targetConfig,
        segments,
        hookText: tpl.hook,
        ctaText: localized.defaultCta,
        colorGrade: targetConfig.colorGrade ?? 'viral_high_contrast',
        directorMode: 'local_cinema_heuristic',
        directorNote: params.directorNote ?? `Cinema Multi-Video Remix lokal menggabungkan ${rawSources.length} sumber video dengan transisi sinematik.`
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

  // MODE 2: SINGLE-SOURCE CLIPS / PART SERIES / FULL SOURCE / PACING CLONER
  const assignedSourceByIdx = Array.from({ length: count }, (_, i) => rawSources[i % rawSources.length]);
  const totalUsesPerSource = new Map<string, number>();
  for (const src of assignedSourceByIdx) {
    totalUsesPerSource.set(src.id, (totalUsesPerSource.get(src.id) ?? 0) + 1);
  }
  const seenCountPerSource = new Map<string, number>();
  const lastEndBySource = new Map<string, number>();
  const drafts: PlannedClipDraft[] = [];

  for (let i = 0; i < count; i += 1) {
    const src = assignedSourceByIdx[i];
    const sourceUseIdx = seenCountPerSource.get(src.id) ?? 0;
    const sourceTotalUses = totalUsesPerSource.get(src.id) ?? 1;
    seenCountPerSource.set(src.id, sourceUseIdx + 1);

    const totalDur = Math.max(1.2, src.durationSec);
    const tpl = localized.singleAngles[i % localized.singleAngles.length];

    let rawStart = 0;
    let rawEnd = totalDur;

    if (endingMode === 'full_source') {
      rawStart = 0;
      rawEnd = totalDur;
    } else if (endingMode === 'part_series' && sourceTotalUses > 1 && totalDur >= 4) {
      const prevEnd = lastEndBySource.get(src.id) ?? 0;
      const remaining = Math.max(1.2, totalDur - prevEnd);
      const partsLeft = sourceTotalUses - sourceUseIdx;
      const targetPartLen = Math.min(maxRuleDur, Math.max(1.2, remaining / partsLeft));
      rawStart = prevEnd;
      rawEnd = sourceUseIdx === sourceTotalUses - 1 ? totalDur : Math.min(totalDur, prevEnd + targetPartLen);
    } else if (sourceTotalUses === 1 && totalDur <= maxRuleDur + 5) {
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
          focusX: 0.5,
          transition: 'cut' as const,
          transitionDurationSec: 0.3,
          speed: 1.0,
          motion: 'none' as const
        };
      });
    } else {
      segments = [
        {
          mediaAssetId: src.id,
          startSec,
          endSec: Math.max(startSec + 0.6, endSec),
          zoom: i % 2 === 1 ? 1.06 : 1.0,
          cropX: 'center' as const,
          transition: 'cut' as const,
          transitionDurationSec: 0.3,
          speed: 1.0,
          motion: 'none' as const
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
    const hookText = isPartSeries && i > 0 ? `Part ${i + 1}: ${tpl.hook}` : tpl.hook;

    const edl = buildCompleteEdl({
      targetConfig,
      segments,
      hookText,
      ctaText,
      colorGrade: targetConfig.colorGrade ?? 'natural',
      directorMode: 'local_cinema_heuristic',
      directorNote: params.directorNote
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
  storyboards?: VideoStoryboard[];
  rulebook: BriefRulebook | null;
  targetConfig: TargetConfig;
  transcript: TranscriptPayload | null;
  silences: SilenceInterval[];
  pacingBlueprint?: PacingBlueprint | null;
}): Promise<{
  drafts: PlannedClipDraft[];
  tokensUsed: number;
  mode: 'ai_vision' | 'ai_text' | 'local_cinema_heuristic';
  usedModel?: string;
  directorNote?: string;
}> {
  const rawSources = resolveRawSources(params);
  const heuristicDrafts = buildHeuristicMultiVariantEdls({
    ...params,
    rawVideos: rawSources
  });
  const brainKey = await getActiveKeyForRole(params.userId, 'brain');
  if (!brainKey) {
    return {
      drafts: heuristicDrafts,
      tokensUsed: 0,
      mode: 'local_cinema_heuristic',
      directorNote: 'Tidak ada kunci Brain aktif; menggunakan Cinema Remix Engine lokal.'
    };
  }

  const localized = getLocalizedTemplates(params.targetConfig, params.rulebook);
  const endingMode: ClipEndingMode = params.targetConfig.clipEndingMode ?? 'complete_story';
  const assemblyMode: EditAssemblyMode = params.targetConfig.editAssemblyMode ?? 'cinema_remix';
  const enableTransitions = params.targetConfig.enableCinemaTransitions ?? true;
  const maxRuleDur = params.rulebook?.durationRules.maxSec ?? 60;
  const minRuleDur = params.rulebook?.durationRules.minSec ?? 15;
  const hasVisionImages = Boolean(params.storyboards && params.storyboards.length > 0);

  const remixDirective =
    assemblyMode === 'cinema_remix' && rawSources.length >= 2
      ? 'CINEMA MULTI-VIDEO REMIX MODE (CRITICAL): You are a Hollywood / Viral Commercial Film Editor! ' +
        'DO NOT make 1 clip = 1 raw video uncut! Each generated clip MUST creatively COMBINE the best shots across MULTIPLE rawVideos[] (using at least 2-3 different mediaAssetIds per clip!) into a cohesive new short film: ' +
        'e.g. Flash-Forward explosive Hook (2-3s from Video 2/3) -> A-Roll intro -> B-Roll cutaway -> Climax slow-mo (speed 0.85-0.95) -> Payoff! ' +
        'Make all N variations genuinely different film edits (Trailer Montage, A-Roll+B-Roll Intercut, Flash-Forward Climax, Fast Commercial Cut, Cinematic Showcase). ' +
        `Assign cinematic transitions ("fade","dissolve","smoothleft","smoothright","wipeleft","fadeblack","circleopen") and subtle camera motion ("push_in","pull_out","none"). ` +
        `Keep total clip duration strictly between ${minRuleDur}s and ${maxRuleDur}s so Brief Compliance PASSES!`
      : `MULTI-VIDEO RULE: You are provided ${rawSources.length} raw source video(s). Distribute clips across ALL uploaded rawVideos and keep total duration between ${minRuleDur}s and ${maxRuleDur}s.`;

  const endingInstruction =
    endingMode === 'full_source'
      ? 'MODE FULL_SOURCE: Keep source videos complete without cutting off the ending.'
      : endingMode === 'part_series'
        ? 'MODE PART_SERIES: Structure sequential Part 1, Part 2, ... with Part 2 teaser in ctaText.'
        : 'MODE COMPLETE_STORY: NEVER cut a speaker mid-sentence! Align startSec & endSec to complete thoughts/pauses.';

  const languageRule =
    localized.lang.code === 'en'
      ? `STRICT LANGUAGE LOCK (${localized.lang.label} for country ${params.targetConfig.countryCode}): ALL angleTitle, hookSummary, hookBannerText, and ctaText MUST be 100% written in natural ${localized.lang.label}. ZERO Indonesian words allowed!`
      : 'BAHASA KONTEN: Tulis angleTitle, hookSummary, hookBannerText, dan ctaText dalam Bahasa Indonesia santai dan tajam tanpa em-dash.';

  const systemPrompt =
    'You are an award-winning Viral Cinema Video Director for TikTok & YouTube Shorts. ' +
    'Return compact valid JSON ONLY: {"clips":[{"angleTitle":string,"hookSummary":string,"hookBannerText":string,"ctaText":string,"segments":[{"mediaAssetId":string,"startSec":number,"endSec":number,"zoom":number,"cropX":"center"|"left"|"right","transition":"cut"|"fade"|"dissolve"|"smoothleft"|"smoothright"|"wipeleft"|"fadeblack"|"circleopen","speed":number,"motion":"none"|"push_in"|"pull_out"}]}]}. ' +
    `Create EXACTLY ${params.targetConfig.batchCount} clips. ` +
    'Use ONLY exact mediaAssetId values from rawVideos[] with 0 <= startSec < endSec <= durationSec and speed between 0.8 and 1.25. ' +
    `${remixDirective} ${endingInstruction} ${languageRule}`;

  const wordsPerVideoBudget = Math.max(55, Math.floor(220 / Math.max(1, rawSources.length)));
  const rawVideosPayload = rawSources.map((src, idx) => {
    const words = src.transcript?.words ?? [];
    const sample = words
      .slice(0, wordsPerVideoBudget)
      .map((w) => `[${w.startSec.toFixed(1)}]${w.word}`)
      .join(' ');
    const sb = params.storyboards?.find((s) => s.mediaAssetId === src.id);
    return {
      index: idx + 1,
      mediaAssetId: src.id,
      filename: src.originalFilename ?? `raw-${idx + 1}.mp4`,
      durationSec: Math.round(src.durationSec * 100) / 100,
      storyboardGridTimestampsSec: sb?.frameTimestampsSec ?? null,
      transcriptSample: sample || '(visual only / rely on storyboard frames)'
    };
  });

  const images: MultimodalImagePart[] = (params.storyboards ?? []).map((sb, idx) => ({
    label: `Storyboard Contact Sheet #${idx + 1} for mediaAssetId="${sb.mediaAssetId}" (${sb.filename}, duration ${sb.durationSec}s). Grid 3x2 left-to-right, top-to-bottom timestamps (sec): [${sb.frameTimestampsSec.join(', ')}]`,
    mimeType: sb.mimeType,
    dataBase64: sb.dataBase64
  }));

  const userPrompt = JSON.stringify({
    requestedCount: params.targetConfig.batchCount,
    editAssemblyMode: assemblyMode,
    clipEndingMode: endingMode,
    enableCinemaTransitions: enableTransitions,
    targetLanguage: localized.lang.label,
    briefDurationRangeSec: { minSec: minRuleDur, maxSec: maxRuleDur },
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
      editingStyle: params.targetConfig.editingStyle
    },
    briefRulebook: params.rulebook,
    rawVideos: rawVideosPayload
  });

  try {
    const res = await generateStructuredJsonWithByok({
      key: brainKey,
      systemPrompt,
      userPrompt,
      images: images.length > 0 ? images : undefined,
      temperature: 0.45,
      maxOutputTokens: Math.min(6144, Math.max(2048, params.targetConfig.batchCount * 720))
    });
    const parsed = AiDirectorResponseSchema.parse(res.json);
    const sourceMap = new Map(rawSources.map((s) => [s.id, s]));
    const modeTag = hasVisionImages ? 'ai_vision' as const : 'ai_text' as const;
    const note = hasVisionImages
      ? `Disutradarai ${res.usedModel} Vision AI (melihat ${images.length} storyboard video | ${res.tokensUsed} token)`
      : `Disutradarai ${res.usedModel} AI (${res.tokensUsed} token)`;

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

      for (let sIdx = 0; sIdx < rawSegs.length; sIdx += 1) {
        const seg = rawSegs[sIdx];
        const src = sourceMap.get(seg.mediaAssetId) ?? rawSources[(idx + sIdx) % rawSources.length];
        const shouldSnap = (src.transcript?.words?.length ?? 0) > 0 && (seg.endSec - seg.startSec) >= 4.0;
        const boundedStart = Math.max(0, Math.min(seg.startSec, Math.max(0, src.durationSec - 0.8)));
        const boundedEnd = Math.min(src.durationSec, Math.max(boundedStart + 0.7, seg.endSec));
        const snapped = shouldSnap
          ? snapSegmentToSpeechBoundary({
              startSec: boundedStart,
              endSec: boundedEnd,
              mediaDurationSec: src.durationSec,
              words: src.transcript?.words ?? [],
              silences: src.silences,
              mode: endingMode === 'full_source' ? 'complete_story' : endingMode,
              maxAllowedEndSec: Math.min(src.durationSec, boundedStart + maxRuleDur)
            })
          : { startSec: Math.round(boundedStart * 100) / 100, endSec: Math.round(boundedEnd * 100) / 100 };

        sanitizedSegments.push({
          mediaAssetId: src.id,
          startSec: snapped.startSec,
          endSec: snapped.endSec,
          zoom: Math.round(Math.min(2.5, Math.max(1.0, seg.zoom ?? 1.0)) * 100) / 100,
          cropX: seg.cropX ?? 'center',
          transition: sIdx === 0 ? 'cut' : (enableTransitions ? (seg.transition ?? 'fade') : 'cut'),
          transitionDurationSec: Math.min(0.45, Math.max(0.18, seg.transitionDurationSec ?? 0.3)),
          speed: Math.round(Math.min(1.5, Math.max(0.75, seg.speed ?? 1.0)) * 100) / 100,
          motion: seg.motion ?? 'none'
        });
      }

      // Guard Cinema Remix: jika mode cinema_remix dengan >= 2 video tapi AI masih hanya pakai 1 video pada klip ini,
      // gunakan struktur multi-video remix dengan judul & hook buatan Gemini AI!
      const uniqueInClip = new Set(sanitizedSegments.map((s) => s.mediaAssetId));
      const finalSegments =
        sanitizedSegments.length > 0 && !(assemblyMode === 'cinema_remix' && rawSources.length >= 2 && uniqueInClip.size < 2)
          ? sanitizedSegments
          : fallback.edl.segments;

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
          ctaText,
          colorGrade: params.targetConfig.colorGrade ?? 'viral_high_contrast',
          directorMode: modeTag,
          directorNote: note
        })
      });
    }

    return {
      drafts: normalized.length > 0 ? normalized : heuristicDrafts,
      tokensUsed: res.tokensUsed,
      mode: modeTag,
      usedModel: res.usedModel,
      directorNote: note
    };
  } catch (err) {
    const errReason = err instanceof Error ? err.message.slice(0, 140) : 'Respons AI tidak valid';
    console.warn(`[EdlDirector] Fallback ke Cinema Lokal (${brainKey.provider}/${brainKey.defaultModel}): ${errReason}`);
    const note = `Mode Cinema Lokal aktif (AI fallback: ${errReason})`;
    const annotatedDrafts = heuristicDrafts.map((d) => ({
      ...d,
      edl: {
        ...d.edl,
        directorMode: 'local_cinema_heuristic' as const,
        directorNote: note
      }
    }));
    return {
      drafts: annotatedDrafts,
      tokensUsed: 0,
      mode: 'local_cinema_heuristic',
      directorNote: note
    };
  }
}
