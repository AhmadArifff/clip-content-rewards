import {
  CinemaColorGradeSchema,
  EdlPatchSchema,
  EdlSchema,
  type BriefRulebook,
  type CinemaColorGrade,
  type EdlDocument,
  type EdlPatch,
  type PatchChangeItem,
  type SegmentMotion,
  type SegmentTransition,
  type TargetConfig
} from '@clip/shared';
import { computeEdlSegmentTimeline } from '../media/ass-subtitle.builder.js';
import { resolveContentLanguage } from './content-language.helper.js';
import { generateStructuredJsonWithByok, getActiveKeyForRole } from './llm-json.adapter.js';

export interface SubtitleOverrideInput {
  index: number;
  text: string;
}

export interface AvailablePatchSource {
  id: string;
  originalFilename: string;
  durationSec: number;
}

export interface VerifiedPatchOutcome {
  sanitizedEdl: EdlDocument;
  appliedChanges: PatchChangeItem[];
  hallucinationWarnings: string[];
  hasEffectiveChange: boolean;
}

const INDONESIAN_SCREEN_LEAK_REGEX = /\b(ikuti|simpan untuk|kebanyakan orang|wajib tahu|jangan lewatkan|cek detail sekarang|klik link di bio)\b/i;

function formatAudioSummary(edl: EdlDocument): string {
  if (edl.audio.muteOriginal || edl.audio.originalVolume <= 0) return 'Mute 0% (Sound Platform)';
  if (edl.audio.originalVolume < 0.9) return `Ducking ${Math.round(edl.audio.originalVolume * 100)}%`;
  return `Original 100% (${edl.audio.normalizeLufs} LUFS)`;
}

function stripDemographicParens(text: string): string {
  return text
    .replace(/\s*\((?:US|UK|ID|AU|CA|SG|MY|GLOBAL|Young Creators[^)]*|Kreator[^)]*)\)/gi, '')
    .replace(/\u2014/g, ' - ')
    .trim();
}

export function buildDeterministicEdlPatch(params: {
  currentEdl: EdlDocument;
  userPrompt: string;
  presetCodes: string[];
  subtitleOverrides?: SubtitleOverrideInput[];
  targetConfig: TargetConfig;
  rulebook: BriefRulebook | null;
}): EdlPatch {
  const { currentEdl, userPrompt, presetCodes, subtitleOverrides, targetConfig, rulebook } = params;
  const text = `${userPrompt} ${presetCodes.join(' ')}`.toLowerCase();
  const patch: EdlPatch = {
    humanSummary: ''
  };
  const summaries: string[] = [];

  const platformSound =
    targetConfig.platform === 'tiktok'
      ? ('tiktok_trending_overlay' as const)
      : targetConfig.platform === 'youtube_shorts'
        ? ('youtube_shorts_sound_overlay' as const)
        : ('none' as const);

  // 1. Kontrol Audio Lapangan (Mute / Ducking % / Normalize Vokal)
  if (
    presetCodes.includes('mute_original_audio') ||
    /(mute|bisukan|matikan suara|hilangkan suara|\b0%\b|\b0\s*persen)/i.test(text)
  ) {
    patch.audioPatch = {
      muteOriginal: true,
      originalVolume: 0,
      intendedPlatformSound: platformSound
    };
    summaries.push('Mute suara asli ke 0% (siap diganti sound trending TikTok/YouTube)');
  } else if (
    presetCodes.includes('duck_original_15') ||
    presetCodes.includes('duck_original_30') ||
    /(kecilkan|turunkan|pelankan|ducking|volume.{0,15}\d+\s*%)/i.test(text)
  ) {
    const pctMatch = text.match(/(\d{1,2})\s*(?:%|persen)/i);
    let pct = pctMatch ? Number(pctMatch[1]) : presetCodes.includes('duck_original_30') ? 30 : 15;
    pct = Math.max(5, Math.min(80, pct));
    patch.audioPatch = {
      muteOriginal: false,
      originalVolume: Math.round((pct / 100) * 100) / 100,
      intendedPlatformSound: platformSound
    };
    summaries.push(`Kecilkan suara asli ke ${pct}% untuk latar sound platform`);
  } else if (
    presetCodes.includes('normalize_clean_vocal') ||
    /(normalize|normalisasi|perjelas vokal|suara asli 100%|kembalikan suara)/i.test(text)
  ) {
    patch.audioPatch = {
      muteOriginal: false,
      originalVolume: 1.0,
      normalizeLufs: -14,
      intendedPlatformSound: 'none'
    };
    summaries.push('Aktifkan vokal asli 100% (-14 LUFS)');
  }

  // 2. Kontrol Segmen (Potong awal / Perketat / Speed / Zoom / Motion / Transisi)
  let nextSegments = currentEdl.segments.map((s) => ({ ...s }));
  let segmentsModified = false;

  if (
    presetCodes.includes('cut_slow_intro_2s') ||
    /(potong|pangkas|buang).{0,18}(\d+(?:\.\d+)?\s*(?:detik|s\b)|awal|intro|pembukaan)/i.test(text)
  ) {
    const cutMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:detik|s\b)/i);
    const cutSec = cutMatch ? Math.min(4, Math.max(0.5, Number(cutMatch[1]))) : 1.5;
    const first = nextSegments[0];
    if (first && first.endSec - first.startSec > cutSec + 0.8) {
      first.startSec = Math.round((first.startSec + cutSec) * 100) / 100;
      segmentsModified = true;
      summaries.push(`Potong ${cutSec} detik pembukaan Segmen #1 agar langsung ke hook`);
    }
  }

  if (presetCodes.includes('tighten_silence') || /(perketat|rapatkan|padatkan).{0,15}(jeda|pacing|ritme|hening)/i.test(text)) {
    let tightened = 0;
    nextSegments = nextSegments.map((s) => {
      if (s.endSec - s.startSec >= 4.0) {
        tightened += 1;
        return {
          ...s,
          endSec: Math.round((s.endSec - 0.5) * 100) / 100,
          speed: Math.min(1.25, Math.round(Math.max(s.speed ?? 1.0, 1.08) * 100) / 100)
        };
      }
      return s;
    });
    if (tightened > 0) {
      segmentsModified = true;
      summaries.push(`Rapatkan pacing pada ${tightened} segmen panjang`);
    }
  }

  const explicitSpeed = text.match(/\b(0\.[7-9]\d?|1\.[0-5]\d?)\s*x\b/i);
  if (explicitSpeed) {
    const spd = Math.min(1.5, Math.max(0.7, Number(explicitSpeed[1])));
    nextSegments = nextSegments.map((s) => ({ ...s, speed: Math.round(spd * 100) / 100 }));
    segmentsModified = true;
    summaries.push(`Atur kecepatan pacing segmen menjadi ${spd.toFixed(2)}x`);
  } else if (/(percepat|lebih cepat|faster|tingkatkan tempo)/i.test(text)) {
    nextSegments = nextSegments.map((s) => ({
      ...s,
      speed: Math.min(1.25, Math.round(((s.speed ?? 1.0) + 0.1) * 100) / 100)
    }));
    segmentsModified = true;
    summaries.push('Percepat ritme segmen (+0.10x)');
  } else if (/(perlambat|slow.?mo|lebih lambat|slower)/i.test(text)) {
    nextSegments = nextSegments.map((s) => ({
      ...s,
      speed: Math.max(0.8, Math.round(((s.speed ?? 1.0) - 0.1) * 100) / 100)
    }));
    segmentsModified = true;
    summaries.push('Perlambat ritme segmen (-0.10x)');
  }

  if (presetCodes.includes('zoom_in_115') || /(zoom|perbesar wajah|lebih dekat|115%|1\.15)/i.test(text)) {
    nextSegments = nextSegments.map((s) => ({ ...s, zoom: Math.max(s.zoom ?? 1.0, 1.15) }));
    segmentsModified = true;
    summaries.push('Terapkan zoom-in 115% pada segmen');
  }

  let requestedMotion: SegmentMotion | null = null;
  if (/push_in|push.?in|gerak kamera|dorong kamera/i.test(text)) {
    requestedMotion = 'push_in';
  } else if (/pull_out|pull.?out|tarik kamera/i.test(text)) {
    requestedMotion = 'pull_out';
  } else if (/matikan gerak kamera|tanpa motion|statis/i.test(text)) {
    requestedMotion = 'none';
  }
  if (requestedMotion !== null) {
    nextSegments = nextSegments.map((s, idx) =>
      idx === 0 || idx === nextSegments.length - 1 ? { ...s, motion: requestedMotion! } : s
    );
    segmentsModified = true;
    summaries.push(`Atur gerak kamera segmen pembuka/penutup ke ${requestedMotion}`);
  }

  const transitionMap: Array<[RegExp, SegmentTransition]> = [
    [/smoothleft/i, 'smoothleft'],
    [/smoothright/i, 'smoothright'],
    [/wipeleft/i, 'wipeleft'],
    [/fadeblack|dip to black/i, 'fadeblack'],
    [/circleopen/i, 'circleopen'],
    [/dissolve/i, 'dissolve'],
    [/\bfade\b/i, 'fade'],
    [/hard cut|tanpa transisi/i, 'cut']
  ];
  for (const [re, tr] of transitionMap) {
    if (re.test(text) && nextSegments.length >= 2) {
      nextSegments = nextSegments.map((s, idx) => (idx === 0 ? s : { ...s, transition: tr }));
      segmentsModified = true;
      summaries.push(`Ganti transisi antar segmen menjadi ${tr}`);
      break;
    }
  }

  if (segmentsModified) {
    patch.segmentsPatch = nextSegments;
  }

  // 3. Kontrol Cinema Color Grading (M19 + M21)
  const gradeRules: Array<[RegExp, CinemaColorGrade]> = [
    [/moody_cinema|moody|gelap dramatis|thriller/i, 'moody_cinema'],
    [/warm_holiday_film|warm|hangat|emas/i, 'warm_holiday_film'],
    [/cinematic_teal_orange|teal.?orange|hollywood/i, 'cinematic_teal_orange'],
    [/viral_high_contrast|high.?contrast|kontras tajam|capcut/i, 'viral_high_contrast'],
    [/warna asli|natural grade|reset warna/i, 'natural']
  ];
  for (const [re, grade] of gradeRules) {
    if (re.test(text) && grade !== currentEdl.colorGrade) {
      patch.colorGrade = grade;
      summaries.push(`Ubah Cinema Color Grading menjadi ${grade}`);
      break;
    }
  }

  // 4. Kontrol Framing 16:9 -> 9:16
  if (/auto.?track|face.?track|ikuti wajah|deteksi wajah/i.test(text)) {
    patch.framingMode = 'auto_face_track';
    summaries.push('Ubah framing menjadi Smart Auto-Track 9:16 (ikuti fokus wajah/subjek)');
  } else if (/fit.?blur|blur background|latar blur/i.test(text)) {
    patch.framingMode = 'fit_blur_bg';
    summaries.push('Ubah framing menjadi Fit-Width + Latar Blur');
  } else if (/center.?crop|crop tengah/i.test(text)) {
    patch.framingMode = 'center_crop';
    summaries.push('Ubah framing menjadi Center Crop 9:16');
  } else if (/split.?screen/i.test(text)) {
    patch.framingMode = 'split_screen';
    summaries.push('Ubah framing menjadi Split-Screen');
  }

  // 5. Kontrol Subtitle Safe-Zone & Inline Overrides
  const captionsPatch: NonNullable<EdlPatch['captionsPatch']> = {};
  if (
    presetCodes.includes('raise_subtitle_safezone') ||
    /(naikkan subtitle|safe.?zone|ketutup caption|geser subtitle|66%)/i.test(text)
  ) {
    captionsPatch.enabled = true;
    captionsPatch.verticalOffsetPct = 66;
    summaries.push('Naikkan posisi subtitle ke Safe-Zone tengah (66%)');
  }
  if (/matikan subtitle|hapus subtitle|tanpa subtitle/i.test(text)) {
    captionsPatch.enabled = false;
    captionsPatch.style = 'off';
    summaries.push('Nonaktifkan subtitle');
  }
  if (subtitleOverrides && subtitleOverrides.length > 0) {
    captionsPatch.overrides = subtitleOverrides;
    summaries.push(`Terapkan ${subtitleOverrides.length} koreksi teks subtitle manual`);
  }
  if (Object.keys(captionsPatch).length > 0) {
    patch.captionsPatch = captionsPatch;
  }

  // 6. Kontrol Hook Banner & CTA Brief
  const quotedHook = userPrompt.match(/hook(?:\s+banner)?\s*[:=]\s*["']([^"']{4,100})["']/i);
  if (quotedHook) {
    patch.hookBannerPatch = { enabled: true, text: stripDemographicParens(quotedHook[1]) };
    summaries.push(`Perbarui teks Hook Banner menjadi "${patch.hookBannerPatch.text}"`);
  } else if (/matikan hook|hapus hook banner|tanpa hook banner/i.test(text)) {
    patch.hookBannerPatch = { enabled: false };
    summaries.push('Nonaktifkan teks Hook Banner pembuka');
  }

  if (presetCodes.includes('inject_brief_cta') || /(tambah|sisipkan).{0,15}cta|disclaimer|wajib brief/i.test(text)) {
    const contentLang = resolveContentLanguage(targetConfig);
    const defaultCta = contentLang.code === 'en' ? 'Check link in bio now!' : 'Cek link di bio sekarang!';
    const tagPrefix = contentLang.code === 'en' ? 'Check link in bio' : 'Cek link di bio';
    const ctaText =
      rulebook?.requiredHashtags?.length
        ? `${tagPrefix} ${rulebook.requiredHashtags.slice(0, 2).join(' ')}`
        : defaultCta;
    patch.complianceOverlaysPatch = {
      ctaText,
      disclosureText: rulebook?.mandatoryDos.some((d) => /#ad|sponsored|iklan/i.test(d)) ? '#ad' : ''
    };
    summaries.push('Tambahkan overlay CTA wajib brief di akhir video');
  }

  patch.humanSummary =
    summaries.length > 0
      ? summaries.join('; ')
      : `Penyesuaian regenerasi sesuai instruksi: "${userPrompt.slice(0, 120)}"`;

  return EdlPatchSchema.parse(patch);
}

export function applyEdlPatch(currentEdl: EdlDocument, patch: EdlPatch): EdlDocument {
  const merged: EdlDocument = {
    ...currentEdl,
    framingMode: patch.framingMode ?? currentEdl.framingMode,
    colorGrade: patch.colorGrade ?? currentEdl.colorGrade,
    segments: patch.segmentsPatch ?? currentEdl.segments,
    audio: patch.audioPatch ? { ...currentEdl.audio, ...patch.audioPatch } : currentEdl.audio,
    hookBanner: patch.hookBannerPatch ? { ...currentEdl.hookBanner, ...patch.hookBannerPatch } : currentEdl.hookBanner,
    captions: patch.captionsPatch ? { ...currentEdl.captions, ...patch.captionsPatch } : currentEdl.captions,
    supportingOverlays: patch.supportingOverlaysPatch
      ? { ...currentEdl.supportingOverlays, ...patch.supportingOverlaysPatch }
      : currentEdl.supportingOverlays,
    complianceOverlays: patch.complianceOverlaysPatch
      ? { ...currentEdl.complianceOverlays, ...patch.complianceOverlaysPatch }
      : currentEdl.complianceOverlays
  };

  return EdlSchema.parse(merged);
}

// Verifier Anti-Halusinasi: memvalidasi seluruh ID media, batas durasi fisik FFprobe,
// kunci bahasa target negara, serta menghitung diff nyata (Before vs After) agar tidak ada silent no-op!
export function verifyAndDiffEdlPatch(params: {
  beforeEdl: EdlDocument;
  afterEdl: EdlDocument;
  availableSources: AvailablePatchSource[];
  targetConfig: TargetConfig;
}): VerifiedPatchOutcome {
  const { beforeEdl, afterEdl, availableSources, targetConfig } = params;
  const warnings: string[] = [];
  const sourceById = new Map(availableSources.map((s) => [s.id, s]));
  const fallbackSource = availableSources[0];

  const sanitizedSegments = afterEdl.segments.map((seg, idx) => {
    let mediaId = seg.mediaAssetId;
    let src = sourceById.get(mediaId);
    if (!src) {
      const priorSeg = beforeEdl.segments[idx] ?? beforeEdl.segments[0];
      const recovered = (priorSeg && sourceById.get(priorSeg.mediaAssetId)) ?? fallbackSource;
      if (recovered) {
        warnings.push(
          `Segmen #${idx + 1} merujuk ID media tidak valid ("${mediaId}") dan dipulihkan otomatis ke "${recovered.originalFilename}".`
        );
        mediaId = recovered.id;
        src = recovered;
      }
    }

    const maxDur = Math.max(0.6, src?.durationSec ?? Math.max(seg.endSec, 5));
    const startSec = Math.round(Math.max(0, Math.min(seg.startSec, Math.max(0, maxDur - 0.55))) * 100) / 100;
    const rawEnd = Math.min(seg.endSec, maxDur);
    if (seg.endSec > maxDur + 0.15) {
      warnings.push(
        `Segmen #${idx + 1} melewati durasi asli (${seg.endSec.toFixed(1)}s > ${maxDur.toFixed(1)}s) dan dipangkas otomatis ke ${maxDur.toFixed(1)}s.`
      );
    }
    const endSec = Math.round(Math.max(startSec + 0.5, rawEnd) * 100) / 100;
    const speed = Math.round(Math.min(1.6, Math.max(0.6, seg.speed ?? 1.0)) * 100) / 100;
    const zoom = Math.round(Math.min(2.5, Math.max(1.0, seg.zoom ?? 1.0)) * 100) / 100;
    const transitionDurationSec = Math.round(Math.min(0.45, Math.max(0.18, seg.transitionDurationSec ?? 0.3)) * 100) / 100;

    return {
      ...seg,
      mediaAssetId: mediaId,
      startSec,
      endSec: Math.min(maxDur, endSec) > startSec ? Math.min(maxDur, endSec) : Math.max(startSec + 0.4, endSec),
      speed,
      zoom,
      transitionDurationSec,
      transition: idx === 0 ? ('cut' as const) : (seg.transition ?? 'cut')
    };
  });

  // Kunci bahasa teks layar (Hook Banner & CTA) untuk target internasional + hapus label demografi dalam kurung
  const contentLang = resolveContentLanguage(targetConfig);
  let nextHookText = stripDemographicParens(afterEdl.hookBanner.text);
  if (contentLang.code === 'en' && nextHookText !== beforeEdl.hookBanner.text && INDONESIAN_SCREEN_LEAK_REGEX.test(nextHookText)) {
    warnings.push('Teks Hook Banner mengandung kata Bahasa Indonesia untuk target luar negeri; dikembalikan ke Hook sebelumnya.');
    nextHookText = beforeEdl.hookBanner.text;
  }

  let nextCtaText = stripDemographicParens(afterEdl.complianceOverlays.ctaText);
  if (contentLang.code === 'en' && nextCtaText !== beforeEdl.complianceOverlays.ctaText && INDONESIAN_SCREEN_LEAK_REGEX.test(nextCtaText)) {
    warnings.push('Teks CTA mengandung kata Bahasa Indonesia untuk target luar negeri; dikembalikan ke CTA sebelumnya.');
    nextCtaText = beforeEdl.complianceOverlays.ctaText;
  }

  const sanitizedEdl = EdlSchema.parse({
    ...afterEdl,
    segments: sanitizedSegments,
    hookBanner: {
      ...afterEdl.hookBanner,
      text: nextHookText.slice(0, 115)
    },
    complianceOverlays: {
      ...afterEdl.complianceOverlays,
      ctaText: nextCtaText.slice(0, 110)
    }
  });

  // Hitung Diff Terverifikasi (Before vs After)
  const changes: PatchChangeItem[] = [];

  if (beforeEdl.colorGrade !== sanitizedEdl.colorGrade) {
    changes.push({
      field: 'colorGrade',
      label: 'Cinema Color Grading',
      before: beforeEdl.colorGrade ?? 'natural',
      after: sanitizedEdl.colorGrade ?? 'natural'
    });
  }

  if (beforeEdl.framingMode !== sanitizedEdl.framingMode) {
    changes.push({
      field: 'framingMode',
      label: 'Mode Framing 9:16',
      before: beforeEdl.framingMode,
      after: sanitizedEdl.framingMode
    });
  }

  if (
    beforeEdl.audio.muteOriginal !== sanitizedEdl.audio.muteOriginal ||
    Math.abs(beforeEdl.audio.originalVolume - sanitizedEdl.audio.originalVolume) > 0.01
  ) {
    changes.push({
      field: 'audio',
      label: 'Audio Asli',
      before: formatAudioSummary(beforeEdl),
      after: formatAudioSummary(sanitizedEdl)
    });
  }

  if (
    beforeEdl.hookBanner.enabled !== sanitizedEdl.hookBanner.enabled ||
    beforeEdl.hookBanner.text !== sanitizedEdl.hookBanner.text
  ) {
    changes.push({
      field: 'hookBanner',
      label: 'Hook Banner',
      before: beforeEdl.hookBanner.enabled ? `"${beforeEdl.hookBanner.text}"` : 'Nonaktif',
      after: sanitizedEdl.hookBanner.enabled ? `"${sanitizedEdl.hookBanner.text}"` : 'Nonaktif'
    });
  }

  if (
    beforeEdl.captions.enabled !== sanitizedEdl.captions.enabled ||
    beforeEdl.captions.style !== sanitizedEdl.captions.style ||
    beforeEdl.captions.verticalOffsetPct !== sanitizedEdl.captions.verticalOffsetPct ||
    JSON.stringify(beforeEdl.captions.overrides) !== JSON.stringify(sanitizedEdl.captions.overrides)
  ) {
    changes.push({
      field: 'captions',
      label: 'Subtitle Safe-Zone',
      before: `${beforeEdl.captions.enabled ? beforeEdl.captions.style : 'off'} (${beforeEdl.captions.verticalOffsetPct}%, ${beforeEdl.captions.overrides.length} edit)`,
      after: `${sanitizedEdl.captions.enabled ? sanitizedEdl.captions.style : 'off'} (${sanitizedEdl.captions.verticalOffsetPct}%, ${sanitizedEdl.captions.overrides.length} edit)`
    });
  }

  if (
    beforeEdl.complianceOverlays.ctaText !== sanitizedEdl.complianceOverlays.ctaText ||
    beforeEdl.complianceOverlays.disclosureText !== sanitizedEdl.complianceOverlays.disclosureText
  ) {
    changes.push({
      field: 'complianceOverlays',
      label: 'CTA / Disclosure',
      before: beforeEdl.complianceOverlays.ctaText || 'Kosong',
      after: sanitizedEdl.complianceOverlays.ctaText || 'Kosong'
    });
  }

  if (JSON.stringify(beforeEdl.segments) !== JSON.stringify(sanitizedEdl.segments)) {
    const beforeTl = computeEdlSegmentTimeline(beforeEdl.segments);
    const afterTl = computeEdlSegmentTimeline(sanitizedEdl.segments);
    const beforeAvgSpd =
      beforeEdl.segments.reduce((sum, s) => sum + (s.speed ?? 1), 0) / Math.max(1, beforeEdl.segments.length);
    const afterAvgSpd =
      sanitizedEdl.segments.reduce((sum, s) => sum + (s.speed ?? 1), 0) / Math.max(1, sanitizedEdl.segments.length);
    const beforeTr = beforeEdl.segments.filter((s, i) => i > 0 && s.transition && s.transition !== 'cut').length;
    const afterTr = sanitizedEdl.segments.filter((s, i) => i > 0 && s.transition && s.transition !== 'cut').length;
    const beforeMot = beforeEdl.segments.filter((s) => s.motion && s.motion !== 'none').length;
    const afterMot = sanitizedEdl.segments.filter((s) => s.motion && s.motion !== 'none').length;

    changes.push({
      field: 'segments',
      label: 'Timeline & Segmen',
      before: `${beforeEdl.segments.length} shot (${beforeTl.totalDurationSec.toFixed(1)}s | speed ${beforeAvgSpd.toFixed(2)}x | ${beforeTr} transisi | ${beforeMot} motion)`,
      after: `${sanitizedEdl.segments.length} shot (${afterTl.totalDurationSec.toFixed(1)}s | speed ${afterAvgSpd.toFixed(2)}x | ${afterTr} transisi | ${afterMot} motion)`
    });
  }

  return {
    sanitizedEdl,
    appliedChanges: changes,
    hallucinationWarnings: warnings,
    hasEffectiveChange: changes.length > 0
  };
}

export async function planEdlPatchWithPrompt(params: {
  userId: string;
  currentEdl: EdlDocument;
  userPrompt: string;
  presetCodes: string[];
  subtitleOverrides?: SubtitleOverrideInput[];
  targetConfig: TargetConfig;
  rulebook: BriefRulebook | null;
  availableSources?: AvailablePatchSource[];
}): Promise<{
  patch: EdlPatch;
  patchedEdl: EdlDocument;
  mode: 'ai' | 'local_deterministic';
  appliedChanges: PatchChangeItem[];
  hallucinationWarnings: string[];
  hasEffectiveChange: boolean;
}> {
  const availableSources = params.availableSources ?? [];
  const deterministicPatch = buildDeterministicEdlPatch(params);
  const detApplied = applyEdlPatch(params.currentEdl, deterministicPatch);
  const detVerified = verifyAndDiffEdlPatch({
    beforeEdl: params.currentEdl,
    afterEdl: detApplied,
    availableSources,
    targetConfig: params.targetConfig
  });

  const brainKey = await getActiveKeyForRole(params.userId, 'brain');

  if (!brainKey || !params.userPrompt.trim()) {
    return {
      patch: deterministicPatch,
      patchedEdl: detVerified.sanitizedEdl,
      mode: 'local_deterministic',
      appliedChanges: detVerified.appliedChanges,
      hallucinationWarnings: detVerified.hallucinationWarnings,
      hasEffectiveChange: detVerified.hasEffectiveChange
    };
  }

  const contentLang = resolveContentLanguage(params.targetConfig);
  const validGrades = CinemaColorGradeSchema.options.join(', ');
  const systemPrompt = [
    'Anda adalah Video EDL Patcher deterministik yang anti-halusinasi. Ubah instruksi revisi user menjadi JSON EdlPatch parsial yang BENAR-BENAR mengubah parameter EDL yang relevan tanpa merusak bagian lain.',
    'Field yang valid: { "humanSummary": string, "framingMode"?: "center_crop"|"fit_blur_bg"|"split_screen"|"auto_face_track", "colorGrade"?: "' + validGrades + '", "audioPatch"?, "segmentsPatch"?, "hookBannerPatch"?, "captionsPatch"?, "supportingOverlaysPatch"?, "complianceOverlaysPatch"? }.',
    'ATURAN ANTI-HALUSINASI KETAT:',
    '1. Jika mengisi segmentsPatch, HANYA gunakan mediaAssetId persis dari availableSources[] dengan 0 <= startSec < endSec <= durationSec dan speed 0.6..1.6 serta zoom 1.0..2.5.',
    '2. DILARANG menulis humanSummary yang mengklaim perubahan padahal tidak mengubah field patch apa pun (zero silent no-op).',
    `3. Semua teks layar baru (hookBannerPatch.text, complianceOverlaysPatch.ctaText) WAJIB dalam bahasa ${contentLang.label} (Country: ${params.targetConfig.countryCode}), tanpa tag demografi dalam kurung dan tanpa em-dash.`
  ].join('\n');

  try {
    const res = await generateStructuredJsonWithByok({
      key: brainKey,
      systemPrompt,
      userPrompt: JSON.stringify({
        userPrompt: params.userPrompt,
        presetCodes: params.presetCodes,
        availableSources,
        currentEdl: params.currentEdl,
        briefRulebook: params.rulebook,
        deterministicHint: deterministicPatch
      }),
      temperature: 0.2,
      maxOutputTokens: 2048
    });

    const aiPatch = EdlPatchSchema.parse(res.json);
    // Preservasi override subtitle manual & preset audio eksplisit
    if (params.subtitleOverrides && params.subtitleOverrides.length > 0) {
      aiPatch.captionsPatch = { ...(aiPatch.captionsPatch ?? {}), overrides: params.subtitleOverrides };
    }
    if (deterministicPatch.audioPatch && !aiPatch.audioPatch) {
      aiPatch.audioPatch = deterministicPatch.audioPatch;
    }
    if (deterministicPatch.colorGrade && !aiPatch.colorGrade) {
      aiPatch.colorGrade = deterministicPatch.colorGrade;
    }

    const aiApplied = applyEdlPatch(params.currentEdl, aiPatch);
    const aiVerified = verifyAndDiffEdlPatch({
      beforeEdl: params.currentEdl,
      afterEdl: aiApplied,
      availableSources,
      targetConfig: params.targetConfig
    });

    // Zero Silent No-Op Guard: jika AI mengklaim sukses namun tidak mengubah apa pun sementara fallback deterministik punya perubahan nyata
    if (!aiVerified.hasEffectiveChange && detVerified.hasEffectiveChange) {
      return {
        patch: deterministicPatch,
        patchedEdl: detVerified.sanitizedEdl,
        mode: 'local_deterministic',
        appliedChanges: detVerified.appliedChanges,
        hallucinationWarnings: [
          ...aiVerified.hallucinationWarnings,
          'AI mengembalikan patch tanpa perubahan efektif; sistem menerapkan patch deterministik terverifikasi agar video benar-benar diperbarui.'
        ],
        hasEffectiveChange: true
      };
    }

    return {
      patch: {
        ...aiPatch,
        humanSummary: aiPatch.humanSummary.replace(/\u2014/g, ' - ').trim()
      },
      patchedEdl: aiVerified.sanitizedEdl,
      mode: 'ai',
      appliedChanges: aiVerified.appliedChanges,
      hallucinationWarnings: aiVerified.hallucinationWarnings,
      hasEffectiveChange: aiVerified.hasEffectiveChange
    };
  } catch {
    return {
      patch: deterministicPatch,
      patchedEdl: detVerified.sanitizedEdl,
      mode: 'local_deterministic',
      appliedChanges: detVerified.appliedChanges,
      hallucinationWarnings: detVerified.hallucinationWarnings,
      hasEffectiveChange: detVerified.hasEffectiveChange
    };
  }
}
