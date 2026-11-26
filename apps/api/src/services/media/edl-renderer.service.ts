import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { EdlDocument, WordTimestamp } from '@clip/shared';
import { env } from '../../config/env.js';
import { resolveSafeStoragePath } from '../../config/storage.js';
import { writeAssAndSrtFiles } from './ass-subtitle.builder.js';
import { probeMediaAsset } from './media-probe.service.js';

export interface RenderMediaSource {
  id: string;
  filePath: string;
  durationSec: number;
  hasAudio: boolean;
  words: WordTimestamp[];
}

export interface RenderEdlResult {
  outputVideoRelPath: string;
  outputSrtRelPath: string;
  outputAssRelPath: string;
  coverImageRelPath: string;
  actualDurationSec: number;
  renderDurationMs: number;
  clampedEdl: EdlDocument;
}

function runProcess(bin: string, args: string[], cwd: string, timeoutMs = 180000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { cwd, shell: false });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timeout saat merender video (${Math.round(timeoutMs / 1000)}s).`));
    }, timeoutMs);

    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(`FFmpeg render gagal (${code}): ${stderr.slice(-360)}`));
    });
  });
}

export function clampEdlToMediaDurations(
  edl: EdlDocument,
  sourcesById: Map<string, RenderMediaSource>
): { clampedEdl: EdlDocument; totalDurationSec: number } {
  const clampedSegments = edl.segments.map((seg) => {
    const src = sourcesById.get(seg.mediaAssetId);
    if (!src) {
      throw new Error(`Media sumber ${seg.mediaAssetId} tidak ditemukan.`);
    }
    const maxDur = Math.max(0.5, src.durationSec);
    const startSec = Math.max(0, Math.min(seg.startSec, Math.max(0, maxDur - 0.5)));
    const endSec = Math.max(startSec + 0.4, Math.min(seg.endSec, maxDur));
    return {
      ...seg,
      startSec: Math.round(startSec * 100) / 100,
      endSec: Math.round(endSec * 100) / 100
    };
  });

  const totalDurationSec = clampedSegments.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
  return {
    clampedEdl: { ...edl, segments: clampedSegments },
    totalDurationSec: Math.round(totalDurationSec * 100) / 100
  };
}

function buildFramingFilter(
  inLabel: string,
  outLabel: string,
  edl: EdlDocument,
  zoom: number,
  idx: number
): string[] {
  const w = edl.resolution.width;
  const h = edl.resolution.height;
  const zoomExpr = zoom > 1.01
    ? `scale=trunc(iw*${zoom.toFixed(2)}/2)*2:trunc(ih*${zoom.toFixed(2)}/2)*2,crop=${w}:${h}`
    : '';

  if (edl.aspectRatio === '16:9' || edl.framingMode === 'center_crop') {
    const chain = [
      `scale=${w}:${h}:force_original_aspect_ratio=increase`,
      `crop=${w}:${h}`,
      ...(zoomExpr ? [zoomExpr] : []),
      'setsar=1'
    ].join(',');
    return [`${inLabel}${chain}${outLabel}`];
  }

  if (edl.framingMode === 'split_screen') {
    const halfH = Math.floor(h / 2);
    return [
      `${inLabel}split=2[sp_a_${idx}][sp_b_${idx}]`,
      `[sp_a_${idx}]scale=${w}:${halfH}:force_original_aspect_ratio=increase,crop=${w}:${halfH}[top_${idx}]`,
      `[sp_b_${idx}]scale=trunc(${w}*1.25/2)*2:trunc(${halfH}*1.25/2)*2:force_original_aspect_ratio=increase,crop=${w}:${halfH}[bot_${idx}]`,
      `[top_${idx}][bot_${idx}]vstack=inputs=2,setsar=1${outLabel}`
    ];
  }

  // Default aman: fit_blur_bg (menjaga teks/presentasi di pinggir 16:9 utuh di frame 9:16)
  return [
    `${inLabel}split=2[bg_in_${idx}][fg_in_${idx}]`,
    `[bg_in_${idx}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=24:4[bg_${idx}]`,
    `[fg_in_${idx}]scale=${w}:${h}:force_original_aspect_ratio=decrease${zoom > 1.01 ? `,scale=trunc(iw*${zoom.toFixed(2)}/2)*2:trunc(ih*${zoom.toFixed(2)}/2)*2,crop=min(iw\\,${w}):min(ih\\,${h})` : ''}[fg_${idx}]`,
    `[bg_${idx}][fg_${idx}]overlay=(W-w)/2:(H-h)/2,setsar=1${outLabel}`
  ];
}

export async function renderEdlToMp4(params: {
  batchId: string;
  clipId: string;
  versionNumber: number;
  edl: EdlDocument;
  sources: RenderMediaSource[];
  watermarkRelPath?: string | null;
}): Promise<RenderEdlResult> {
  const started = Date.now();
  const { batchId, clipId, versionNumber, edl, sources, watermarkRelPath } = params;

  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const { clampedEdl, totalDurationSec } = clampEdlToMediaDurations(edl, sourcesById);

  const relDir = `renders/${batchId}/${clipId}/v${versionNumber}`;
  const absDir = resolveSafeStoragePath(relDir);
  fs.mkdirSync(absDir, { recursive: true });

  const wordsByMediaId: Record<string, WordTimestamp[]> = {};
  for (const s of sources) {
    wordsByMediaId[s.id] = s.words;
  }

  const subs = writeAssAndSrtFiles({
    outputDir: absDir,
    edl: clampedEdl,
    wordsByMediaId,
    totalDurationSec
  });

  // Pemetaan input unik ke indeks FFmpeg
  const uniqueMediaIds = Array.from(new Set(clampedEdl.segments.map((s) => s.mediaAssetId)));
  const mediaInputIndex = new Map<string, number>();
  const args: string[] = ['-y'];

  uniqueMediaIds.forEach((id, idx) => {
    const src = sourcesById.get(id)!;
    mediaInputIndex.set(id, idx);
    args.push('-i', resolveSafeStoragePath(src.filePath));
  });

  let watermarkIdx: number | null = null;
  if (watermarkRelPath) {
    const wmAbs = resolveSafeStoragePath(watermarkRelPath);
    if (fs.existsSync(wmAbs)) {
      watermarkIdx = uniqueMediaIds.length;
      args.push('-i', wmAbs);
    }
  }

  const filterParts: string[] = [];
  const videoConcatLabels: string[] = [];
  const audioConcatLabels: string[] = [];

  const allSourcesHaveAudio = clampedEdl.segments.every((s) => sourcesById.get(s.mediaAssetId)?.hasAudio);
  const shouldMute =
    clampedEdl.audio.muteOriginal || clampedEdl.audio.originalVolume <= 0 || !allSourcesHaveAudio;

  clampedEdl.segments.forEach((seg, idx) => {
    const inIdx = mediaInputIndex.get(seg.mediaAssetId)!;
    const rawV = `[vraw_${idx}]`;
    const framedV = `[v_${idx}]`;
    filterParts.push(
      `[${inIdx}:v]trim=start=${seg.startSec.toFixed(2)}:end=${seg.endSec.toFixed(2)},setpts=PTS-STARTPTS${rawV}`
    );
    filterParts.push(...buildFramingFilter(rawV, framedV, clampedEdl, seg.zoom, idx));
    videoConcatLabels.push(framedV);

    if (!shouldMute) {
      const aLabel = `[a_${idx}]`;
      filterParts.push(
        `[${inIdx}:a]atrim=start=${seg.startSec.toFixed(2)}:end=${seg.endSec.toFixed(2)},asetpts=PTS-STARTPTS${aLabel}`
      );
      audioConcatLabels.push(aLabel);
    }
  });

  let currentVideoLabel = videoConcatLabels[0];
  if (videoConcatLabels.length > 1) {
    filterParts.push(`${videoConcatLabels.join('')}concat=n=${videoConcatLabels.length}:v=1:a=0[vcat]`);
    currentVideoLabel = '[vcat]';
  }

  // Tempel Watermark PNG jika ada (di dalam area Safe-Zone)
  if (watermarkIdx !== null) {
    const opacity = clampedEdl.supportingOverlays.watermarkOpacity;
    const pos = clampedEdl.supportingOverlays.watermarkPosition;
    const overlayCoords =
      pos === 'top_right_safe'
        ? 'W-w-180:290'
        : pos === 'bottom_left_safe'
          ? '60:H-h-460'
          : '60:290';

    filterParts.push(
      `[${watermarkIdx}:v]scale=180:-1,format=rgba,colorchannelmixer=aa=${opacity.toFixed(2)}[wm_styled]`
    );
    filterParts.push(`${currentVideoLabel}[wm_styled]overlay=${overlayCoords}[vwm]`);
    currentVideoLabel = '[vwm]';
  }

  // Burn-in ASS Subtitle / Hook Banner / CTA memakai path relatif (cwd = absDir, kebal bug C:\ Windows)
  if (subs.hasBurnInLayers) {
    filterParts.push(`${currentVideoLabel}ass=subtitles.ass[vfinal]`);
    currentVideoLabel = '[vfinal]';
  } else {
    filterParts.push(`${currentVideoLabel}null[vfinal]`);
    currentVideoLabel = '[vfinal]';
  }

  // Audio Pipeline (Mute valid AAC stereo / Ducking / Normalized)
  if (shouldMute) {
    filterParts.push(
      `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${totalDurationSec.toFixed(2)}[afinal]`
    );
  } else {
    let currentAudioLabel = audioConcatLabels[0];
    if (audioConcatLabels.length > 1) {
      filterParts.push(`${audioConcatLabels.join('')}concat=n=${audioConcatLabels.length}:v=0:a=1[acat]`);
      currentAudioLabel = '[acat]';
    }
    const vol = clampedEdl.audio.originalVolume;
    const normFilter = `loudnorm=I=${clampedEdl.audio.normalizeLufs}:TP=-1.5:LRA=11`;
    const volFilter = Math.abs(vol - 1.0) > 0.01 ? `,volume=${vol.toFixed(2)}` : '';
    filterParts.push(`${currentAudioLabel}${normFilter}${volFilter}[afinal]`);
  }

  args.push(
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    currentVideoLabel,
    '-map',
    '[afinal]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '22',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(clampedEdl.resolution.fps),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    'video.mp4'
  );

  await runProcess(env.FFMPEG_PATH, args, absDir, 240000);

  // Ekstrak frame cover (thumbnail)
  const coverSec = Math.min(1.2, Math.max(0.1, totalDurationSec / 2));
  await runProcess(
    env.FFMPEG_PATH,
    ['-y', '-ss', coverSec.toFixed(2), '-i', 'video.mp4', '-frames:v', '1', '-q:v', '3', 'cover.jpg'],
    absDir,
    30000
  );

  const outputVideoRelPath = `${relDir}/video.mp4`;
  const verified = await probeMediaAsset(outputVideoRelPath, 'raw_video');

  return {
    outputVideoRelPath,
    outputSrtRelPath: `${relDir}/subtitles.srt`,
    outputAssRelPath: `${relDir}/subtitles.ass`,
    coverImageRelPath: `${relDir}/cover.jpg`,
    actualDurationSec: verified.durationSec ?? totalDurationSec,
    renderDurationMs: Date.now() - started,
    clampedEdl
  };
}
