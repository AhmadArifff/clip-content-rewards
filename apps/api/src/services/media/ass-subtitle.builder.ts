import fs from 'node:fs';
import path from 'node:path';
import type { EdlDocument, WordTimestamp } from '@clip/shared';

export interface CaptionCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface SegmentTimelineSlot {
  index: number;
  mediaAssetId: string;
  sourceStartSec: number;
  sourceEndSec: number;
  speed: number;
  effDurSec: number;
  timelineStartSec: number;
  timelineEndSec: number;
  xfadeOverlapSec: number;
}

interface MappedSpokenWord extends WordTimestamp {
  segIndex: number;
}

const MAX_SILENCE_GAP_SEC = 0.65;

// Saring token halusinasi Whisper berupa tanda baca tunggal (".", "...", "-") atau label musik/hening
export function isSpokenWordToken(rawWord: string): boolean {
  const trimmed = String(rawWord ?? '').trim();
  if (!trimmed) return false;
  if (/^[\s.,!?;:\-\u2013\u2014\u2026'"()[\]{}\u2022\u00b7~*_\/\\|\u266a\u266b]+$/.test(trimmed)) {
    return false;
  }
  if (/^(\[|\()?(music|musik|applause|laughter|silence|bgm|instrumental|inaudible)(\]|\))?$/i.test(trimmed)) {
    return false;
  }
  return /[\p{L}\p{N}]/u.test(trimmed);
}

// Hitung koordinat timeline aktual setiap segmen dengan kompensasi speed ramp & overlap transisi xfade
// Rumus identik dengan edl-renderer.service.ts agar subtitle 100% sinkron dengan audio/video
export function computeEdlSegmentTimeline(segments: EdlDocument['segments']): {
  slots: SegmentTimelineSlot[];
  totalDurationSec: number;
} {
  const slots: SegmentTimelineSlot[] = [];
  let runningDuration = 0;
  let prevEffDur = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const speed = Math.min(1.6, Math.max(0.6, seg.speed ?? 1.0));
    const effDur = Math.max(0.1, (seg.endSec - seg.startSec) / speed);

    if (i === 0) {
      slots.push({
        index: i,
        mediaAssetId: seg.mediaAssetId,
        sourceStartSec: seg.startSec,
        sourceEndSec: seg.endSec,
        speed,
        effDurSec: effDur,
        timelineStartSec: 0,
        timelineEndSec: effDur,
        xfadeOverlapSec: 0
      });
      runningDuration = effDur;
    } else {
      const tr = seg.transition ?? 'cut';
      const canXfade = tr !== 'cut' && prevEffDur >= 0.85 && effDur >= 0.85 && runningDuration >= 0.85;
      if (canXfade) {
        const td = Math.min(
          0.45,
          Math.max(0.18, seg.transitionDurationSec ?? 0.3),
          prevEffDur * 0.35,
          effDur * 0.35
        );
        const offset = Math.max(0.1, runningDuration - td);
        slots.push({
          index: i,
          mediaAssetId: seg.mediaAssetId,
          sourceStartSec: seg.startSec,
          sourceEndSec: seg.endSec,
          speed,
          effDurSec: effDur,
          timelineStartSec: offset,
          timelineEndSec: offset + effDur,
          xfadeOverlapSec: td
        });
        runningDuration = offset + effDur;
      } else {
        slots.push({
          index: i,
          mediaAssetId: seg.mediaAssetId,
          sourceStartSec: seg.startSec,
          sourceEndSec: seg.endSec,
          speed,
          effDurSec: effDur,
          timelineStartSec: runningDuration,
          timelineEndSec: runningDuration + effDur,
          xfadeOverlapSec: 0
        });
        runningDuration += effDur;
      }
    }

    prevEffDur = effDur;
  }

  return {
    slots,
    totalDurationSec: Math.round(runningDuration * 100) / 100
  };
}

function formatAssTime(sec: number): string {
  const safe = Math.max(0, sec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe - Math.floor(safe)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function formatSrtTime(sec: number): string {
  const safe = Math.max(0, sec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, '\\N')
    .trim();
}

function wrapAssLines(text: string, maxCharsPerLine: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current.length + 1 + w.length) <= maxCharsPerLine) {
      current += ` ${w}`;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return escapeAssText(lines.join('\n'));
}

export function buildTimedCuesFromEdl(
  edl: EdlDocument,
  wordsByMediaId: Record<string, WordTimestamp[]>,
  totalDurationSec: number,
  options?: { skipCaptionMediaIds?: Set<string> }
): CaptionCue[] {
  const timeline = computeEdlSegmentTimeline(edl.segments);
  const safeTotalDur = Math.max(0.5, totalDurationSec || timeline.totalDurationSec);
  const skipSet = options?.skipCaptionMediaIds;
  const mappedWords: MappedSpokenWord[] = [];

  for (const slot of timeline.slots) {
    // Lewati segmen dari video sumber yang sudah memiliki subtitle bawaan (anti-double subtitle)
    if (skipSet?.has(slot.mediaAssetId)) {
      continue;
    }

    const sourceWords = wordsByMediaId[slot.mediaAssetId] ?? [];
    for (const w of sourceWords) {
      if (!isSpokenWordToken(w.word)) continue;
      if (w.endSec <= slot.sourceStartSec || w.startSec >= slot.sourceEndSec) continue;

      const relStart = Math.max(0, (w.startSec - slot.sourceStartSec) / slot.speed);
      const rawRelEnd = (w.endSec - slot.sourceStartSec) / slot.speed;
      const relEnd = Math.min(slot.effDurSec, Math.max(relStart + 0.04, rawRelEnd));
      if (relEnd <= relStart) continue;

      const timelineStart = slot.timelineStartSec + relStart;
      const timelineEnd = Math.min(safeTotalDur, slot.timelineStartSec + relEnd);
      if (timelineStart >= safeTotalDur - 0.05 || timelineEnd <= timelineStart) continue;

      mappedWords.push({
        word: w.word.trim(),
        startSec: timelineStart,
        endSec: timelineEnd,
        segIndex: slot.index
      });
    }
  }

  // Kelompokkan menjadi 3-5 kata per baris, wajib pecah saat berpindah segmen atau ada jeda hening >= 0.65s
  const rawCues: Array<{ startSec: number; endSec: number; text: string }> = [];
  const wordsPerCue = edl.captions.style === 'hormozi_bold' ? 3 : 5;
  let buf: MappedSpokenWord[] = [];

  const flushBuf = () => {
    if (buf.length === 0) return;
    const first = buf[0];
    const last = buf[buf.length - 1];
    const startSec = Math.max(0, Math.min(first.startSec, safeTotalDur - 0.15));
    const endSec = Math.min(safeTotalDur, Math.max(startSec + 0.25, last.endSec));
    if (endSec > startSec + 0.05) {
      rawCues.push({
        startSec: Math.round(startSec * 100) / 100,
        endSec: Math.round(endSec * 100) / 100,
        text: buf.map((item) => item.word).join(' ')
      });
    }
    buf = [];
  };

  for (const w of mappedWords) {
    if (buf.length > 0) {
      const prev = buf[buf.length - 1];
      const crossesSegment = w.segIndex !== prev.segIndex;
      const crossesSilenceGap = w.startSec - prev.endSec >= MAX_SILENCE_GAP_SEC;
      const endedSentence = /[.!?]$/.test(prev.word) && buf.length >= 2;
      if (buf.length >= wordsPerCue || crossesSegment || crossesSilenceGap || endedSentence) {
        flushBuf();
      }
    }
    buf.push(w);
  }
  flushBuf();

  // Pastikan seluruh cue berurutan monoton dan tidak pernah saling menimpa
  for (let i = 0; i < rawCues.length - 1; i += 1) {
    const curr = rawCues[i];
    const next = rawCues[i + 1];
    if (curr.endSec > next.startSec) {
      curr.endSec = Math.round(Math.max(curr.startSec + 0.1, next.startSec - 0.02) * 100) / 100;
    }
  }

  const cues: CaptionCue[] = rawCues
    .filter((c) => c.endSec > c.startSec + 0.05)
    .map((c, idx) => ({
      index: idx,
      startSec: c.startSec,
      endSec: c.endSec,
      text: c.text
    }));

  // Terapkan koreksi typo manual dari Inline Subtitle Editor (M8)
  const overrideMap = new Map(edl.captions.overrides.map((o) => [o.index, o.text]));
  for (const cue of cues) {
    const customText = overrideMap.get(cue.index);
    if (customText !== undefined) {
      cue.text = customText;
    }
  }

  return cues;
}

export function hexToAssColor(hex: string | null | undefined, alphaHex = '00'): string | null {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const r = hex.slice(1, 3).toUpperCase();
  const g = hex.slice(3, 5).toUpperCase();
  const b = hex.slice(5, 7).toUpperCase();
  const a = /^[0-9A-Fa-f]{2}$/.test(alphaHex) ? alphaHex.toUpperCase() : '00';
  return `&H${a}${b}${g}${r}`;
}

function sanitizeAssFontName(fontFamily: string | null | undefined): string {
  const cleaned = (fontFamily ?? '').replace(/[\r\n,{}]/g, '').trim();
  return cleaned.length >= 2 ? cleaned.slice(0, 50) : 'Segoe UI';
}

export function writeAssAndSrtFiles(params: {
  outputDir: string;
  edl: EdlDocument;
  wordsByMediaId: Record<string, WordTimestamp[]>;
  totalDurationSec: number;
  skipCaptionMediaIds?: Set<string>;
}): { assPath: string; srtPath: string; cueCount: number; hasBurnInLayers: boolean } {
  const { outputDir, edl, wordsByMediaId, totalDurationSec, skipCaptionMediaIds } = params;
  const playResX = edl.resolution.width;
  const playResY = edl.resolution.height;
  const isVertical = edl.aspectRatio === '9:16';

  const cues = edl.captions.enabled && edl.captions.style !== 'off'
    ? buildTimedCuesFromEdl(edl, wordsByMediaId, totalDurationSec, { skipCaptionMediaIds })
    : [];

  // Konversi verticalOffsetPct (45..82% dari atas) ke MarginV dari bawah mengikuti Safe-Zone real HP 2026
  const isTiktokPreset = edl.captions.safeZonePreset === 'tiktok_9_16';
  const minSafeBottomPx = isVertical ? (isTiktokPreset ? 560 : 440) : 90;
  const computedMarginV = isVertical
    ? Math.max(minSafeBottomPx, Math.min(860, Math.round(playResY * (1 - edl.captions.verticalOffsetPct / 100))))
    : 90;
  const marginR = isVertical ? (isTiktokPreset ? 215 : 195) : 90;
  const marginL = isVertical ? 70 : 90;
  const hookMarginV = isVertical ? 235 : 80;
  const ctaMarginV = isVertical ? (isTiktokPreset ? 565 : 455) : 85;

  const fontName = sanitizeAssFontName(edl.captions.fontFamily);
  const captionFontSize = edl.captions.style === 'hormozi_bold' ? (isVertical ? 64 : 52) : (isVertical ? 52 : 42);
  const brandAccentAss = hexToAssColor(edl.supportingOverlays.brandAccentColorHex, '00');
  const brandPrimaryAss = hexToAssColor(edl.supportingOverlays.brandPrimaryColorHex, '00');
  const brandPrimaryBgAss = hexToAssColor(edl.supportingOverlays.brandPrimaryColorHex, '24');

  const captionPrimary =
    edl.captions.style === 'hormozi_bold'
      ? (brandAccentAss ?? '&H0000F2FF')
      : '&H00FFFFFF';
  const hookOutline = brandPrimaryAss ?? '&H000F172A';
  const hookBack = brandPrimaryBgAss ?? '&HD80F172A';
  const ctaBg = brandPrimaryAss ?? '&H0081B910';

  const assLines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Caption,${fontName},${captionFontSize},${captionPrimary},&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,4,2,2,${marginL},${marginR},${computedMarginV},1`,
    `Style: HookBanner,${fontName},${isVertical ? 44 : 42},&H00FFFFFF,&H00FFFFFF,${hookOutline},${hookBack},-1,0,0,0,100,100,0,0,3,14,0,8,${marginL},${marginR},${hookMarginV},1`,
    `Style: CtaOverlay,${fontName},${isVertical ? 36 : 34},&H00FFFFFF,&H00FFFFFF,${ctaBg},${ctaBg},-1,0,0,0,100,100,0,0,3,10,0,2,${marginL},${marginR},${ctaMarginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];

  let eventCount = 0;

  // Layer 1: Hook Banner (0-3 detik pertama)
  if (edl.hookBanner.enabled && edl.hookBanner.text.trim().length > 0) {
    const start = Math.min(edl.hookBanner.startSec, Math.max(0, totalDurationSec - 0.5));
    const end = Math.min(totalDurationSec, Math.max(start + 0.8, edl.hookBanner.endSec));
    const wrappedHook = wrapAssLines(edl.hookBanner.text.toUpperCase(), isVertical ? 22 : 42);
    assLines.push(
      `Dialogue: 2,${formatAssTime(start)},${formatAssTime(end)},HookBanner,,0,0,0,,${wrappedHook}`
    );
    eventCount += 1;
  }

  // Layer 2: Subtitle Word-Level dalam Safe-Zone
  for (const cue of cues) {
    const displayText = edl.captions.style === 'hormozi_bold' ? cue.text.toUpperCase() : cue.text;
    const wrappedCap = wrapAssLines(displayText, isVertical ? 20 : 40);
    assLines.push(
      `Dialogue: 1,${formatAssTime(cue.startSec)},${formatAssTime(cue.endSec)},Caption,,0,0,0,,${wrappedCap}`
    );
    eventCount += 1;
  }

  // Layer 3: CTA / Disclosure Wajib Brief
  const ctaCombined = [edl.complianceOverlays.ctaText, edl.complianceOverlays.disclosureText]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' | ');
  if (ctaCombined.length > 0) {
    const ctaStart = Math.max(0, Math.min(edl.complianceOverlays.ctaStartSec || Math.max(0, totalDurationSec - 4), totalDurationSec - 0.8));
    const wrappedCta = wrapAssLines(ctaCombined, isVertical ? 26 : 48);
    assLines.push(
      `Dialogue: 2,${formatAssTime(ctaStart)},${formatAssTime(totalDurationSec)},CtaOverlay,,0,0,0,,${wrappedCta}`
    );
    eventCount += 1;
  }

  const assPath = path.join(outputDir, 'subtitles.ass');
  fs.writeFileSync(assPath, assLines.join('\n'), 'utf8');

  const srtBlocks = cues.map(
    (cue, idx) => `${idx + 1}\n${formatSrtTime(cue.startSec)} --> ${formatSrtTime(cue.endSec)}\n${cue.text}\n`
  );
  const srtPath = path.join(outputDir, 'subtitles.srt');
  fs.writeFileSync(srtPath, srtBlocks.join('\n'), 'utf8');

  return {
    assPath,
    srtPath,
    cueCount: cues.length,
    hasBurnInLayers: eventCount > 0
  };
}
