import fs from 'node:fs';
import path from 'node:path';
import type { EdlDocument, WordTimestamp } from '@clip/shared';

interface CaptionCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
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
  totalDurationSec: number
): CaptionCue[] {
  const mappedWords: WordTimestamp[] = [];
  let cursor = 0;

  for (const seg of edl.segments) {
    const segDur = Math.max(0.1, seg.endSec - seg.startSec);
    const sourceWords = wordsByMediaId[seg.mediaAssetId] ?? [];
    for (const w of sourceWords) {
      if (w.endSec <= seg.startSec || w.startSec >= seg.endSec) continue;
      const relStart = Math.max(0, w.startSec - seg.startSec);
      const relEnd = Math.min(segDur, w.endSec - seg.startSec);
      if (relEnd > relStart) {
        mappedWords.push({
          word: w.word,
          startSec: cursor + relStart,
          endSec: cursor + relEnd
        });
      }
    }
    cursor += segDur;
  }

  // Kelompokkan menjadi 3-4 kata per baris agar cepat dibaca di HP (gaya short-form)
  const cues: CaptionCue[] = [];
  const wordsPerCue = edl.captions.style === 'hormozi_bold' ? 3 : 5;

  for (let i = 0; i < mappedWords.length; i += wordsPerCue) {
    const slice = mappedWords.slice(i, i + wordsPerCue);
    const startSec = slice[0].startSec;
    const endSec = Math.max(startSec + 0.35, slice[slice.length - 1].endSec);
    cues.push({
      index: cues.length,
      startSec,
      endSec: Math.min(totalDurationSec, endSec),
      text: slice.map((w) => w.word).join(' ')
    });
  }

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

export function writeAssAndSrtFiles(params: {
  outputDir: string;
  edl: EdlDocument;
  wordsByMediaId: Record<string, WordTimestamp[]>;
  totalDurationSec: number;
}): { assPath: string; srtPath: string; cueCount: number; hasBurnInLayers: boolean } {
  const { outputDir, edl, wordsByMediaId, totalDurationSec } = params;
  const playResX = edl.resolution.width;
  const playResY = edl.resolution.height;
  const isVertical = edl.aspectRatio === '9:16';

  const cues = edl.captions.enabled && edl.captions.style !== 'off'
    ? buildTimedCuesFromEdl(edl, wordsByMediaId, totalDurationSec)
    : [];

  // Konversi verticalOffsetPct (45..82% dari atas) ke MarginV dari bawah
  const computedMarginV = isVertical
    ? Math.max(360, Math.min(820, Math.round(playResY * (1 - edl.captions.verticalOffsetPct / 100))))
    : 90;
  const marginR = isVertical ? (edl.captions.safeZonePreset === 'tiktok_9_16' ? 180 : 160) : 90;
  const marginL = isVertical ? 70 : 90;

  const fontName = 'Segoe UI';
  const captionFontSize = edl.captions.style === 'hormozi_bold' ? (isVertical ? 64 : 52) : (isVertical ? 52 : 42);
  const captionPrimary = edl.captions.style === 'hormozi_bold' ? '&H0000F2FF' : '&H00FFFFFF';

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
    `Style: HookBanner,${fontName},${isVertical ? 44 : 42},&H00FFFFFF,&H00FFFFFF,&H000F172A,&HD80F172A,-1,0,0,0,100,100,0,0,3,14,0,8,${marginL},${marginR},${isVertical ? 300 : 80},1`,
    `Style: CtaOverlay,${fontName},${isVertical ? 40 : 34},&H00192404,&H00FFFFFF,&H0081B910,&H0081B910,-1,0,0,0,100,100,0,0,3,12,0,2,${marginL},${marginR},${Math.max(computedMarginV + 110, 480)},1`,
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
