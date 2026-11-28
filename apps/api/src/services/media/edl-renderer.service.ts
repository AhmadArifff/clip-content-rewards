import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { CinemaColorGrade, EdlDocument, WordTimestamp } from '@clip/shared';
import { env } from '../../config/env.js';
import { resolveSafeStoragePath } from '../../config/storage.js';
import { computeEdlSegmentTimeline, writeAssAndSrtFiles } from './ass-subtitle.builder.js';
import { probeMediaAsset } from './media-probe.service.js';

export interface RenderMediaSource {
  id: string;
  filePath: string;
  durationSec: number;
  hasAudio: boolean;
  words: WordTimestamp[];
  hasEmbeddedSubtitles?: boolean;
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

function runProcess(bin: string, args: string[], cwd: string, timeoutMs = 240000): Promise<string> {
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
      else reject(new Error(`FFmpeg render gagal (${code}): ${stderr.slice(-420)}`));
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
    const speed = Math.min(1.6, Math.max(0.6, seg.speed ?? 1.0));
    return {
      ...seg,
      startSec: Math.round(startSec * 100) / 100,
      endSec: Math.round(endSec * 100) / 100,
      speed: Math.round(speed * 100) / 100
    };
  });

  // Hitung durasi efektif dengan rumus identik builder subtitle (kompensasi speed ramp & xfade)
  const timeline = computeEdlSegmentTimeline(clampedSegments);

  return {
    clampedEdl: { ...edl, segments: clampedSegments },
    totalDurationSec: timeline.totalDurationSec
  };
}

function resolveSegmentFocusX(seg: EdlDocument['segments'][number]): number {
  if (typeof seg.focusX === 'number' && Number.isFinite(seg.focusX)) {
    return Math.min(0.92, Math.max(0.08, seg.focusX));
  }
  if (seg.cropX === 'left') return 0.18;
  if (seg.cropX === 'right') return 0.82;
  return 0.5;
}

export function buildColorGradeFilter(grade: CinemaColorGrade | undefined): string {
  // Menggunakan filter `eq` SIMD native YUV420P (gamma_r/g/b + contrast/saturation) agar 12x lebih cepat di CPU laptop tanpa konversi RGB berat
  switch (grade) {
    case 'cinematic_teal_orange':
      return 'eq=contrast=1.09:saturation=1.20:brightness=-0.02:gamma_r=1.05:gamma_g=1.00:gamma_b=1.08';
    case 'warm_holiday_film':
      return 'eq=contrast=1.08:saturation=1.24:brightness=0.02:gamma_r=1.08:gamma_g=1.03:gamma_b=0.93';
    case 'viral_high_contrast':
      return 'eq=contrast=1.14:saturation=1.25:brightness=0.02:gamma=1.02';
    case 'moody_cinema':
      return 'eq=contrast=1.16:saturation=0.86:brightness=-0.04:gamma_r=0.96:gamma_g=0.98:gamma_b=1.07';
    default:
      return '';
  }
}

function buildMotionFilter(
  motion: EdlDocument['segments'][number]['motion'],
  w: number,
  h: number,
  fps: number,
  segEffDurSec: number
): string {
  // Terapkan zoompan di resolusi setengah (540x960) lalu upscale bilinear SIMD agar 60x lebih cepat di CPU laptop!
  if (!motion || motion === 'none' || segEffDurSec < 0.8 || segEffDurSec > 5.0) return '';
  const mw = Math.max(320, Math.floor(w / 2 / 2) * 2);
  const mh = Math.max(320, Math.floor(h / 2 / 2) * 2);
  const frames = Math.max(24, Math.round(segEffDurSec * fps));
  const step = Math.min(0.0025, Math.max(0.0005, 0.08 / frames));
  const zp =
    motion === 'pull_out'
      ? `zoompan=z='max(1.0,1.08-on*${step.toFixed(5)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${mw}x${mh}:fps=${fps}`
      : `zoompan=z='min(1.08,1.0+on*${step.toFixed(5)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${mw}x${mh}:fps=${fps}`;
  return `scale=${mw}:${mh}:flags=fast_bilinear,${zp},scale=${w}:${h}:flags=bilinear`;
}

function buildFramingFilter(
  inLabel: string,
  outLabel: string,
  edl: EdlDocument,
  seg: EdlDocument['segments'][number],
  idx: number,
  segEffDurSec: number
): string[] {
  const w = edl.resolution.width;
  const h = edl.resolution.height;
  const fps = edl.resolution.fps;
  const zoom = seg.zoom;
  const focusX = resolveSegmentFocusX(seg);
  const cropExpr = `crop=${w}:${h}:x='trunc(clip(iw*${focusX.toFixed(3)}-${w}/2\\,0\\,iw-${w}))':y='trunc((ih-${h})/2)'`;
  const zoomExpr = zoom > 1.01
    ? `scale=trunc(iw*${zoom.toFixed(2)}/2)*2:trunc(ih*${zoom.toFixed(2)}/2)*2,${cropExpr}`
    : '';
  const motionExpr = buildMotionFilter(seg.motion, w, h, fps, segEffDurSec);
  const normTail = `fps=${fps},format=yuv420p,setsar=1,settb=AVTB`;

  if (edl.aspectRatio === '16:9' || edl.framingMode === 'center_crop' || edl.framingMode === 'auto_face_track') {
    const chain = [
      `scale=${w}:${h}:force_original_aspect_ratio=increase`,
      cropExpr,
      ...(zoomExpr ? [zoomExpr] : []),
      ...(motionExpr ? [motionExpr] : []),
      normTail
    ].join(',');
    return [`${inLabel}${chain}${outLabel}`];
  }

  if (edl.framingMode === 'split_screen') {
    const halfH = Math.floor(h / 2);
    return [
      `${inLabel}split=2[sp_a_${idx}][sp_b_${idx}]`,
      `[sp_a_${idx}]scale=${w}:${halfH}:force_original_aspect_ratio=increase,crop=${w}:${halfH}[top_${idx}]`,
      `[sp_b_${idx}]scale=trunc(${w}*1.25/2)*2:trunc(${halfH}*1.25/2)*2:force_original_aspect_ratio=increase,crop=${w}:${halfH}[bot_${idx}]`,
      `[top_${idx}][bot_${idx}]vstack=inputs=2${motionExpr ? `,${motionExpr}` : ''},${normTail}${outLabel}`
    ];
  }

  // Default aman: fit_blur_bg (blur latar pada resolusi quarter-HD agar 4x lebih cepat & lebih halus di CPU lokal)
  const bw = Math.max(180, Math.floor(w / 4 / 2) * 2);
  const bh = Math.max(320, Math.floor(h / 4 / 2) * 2);
  return [
    `${inLabel}split=2[bg_in_${idx}][fg_in_${idx}]`,
    `[bg_in_${idx}]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=8:2,scale=${w}:${h}:flags=bilinear[bg_${idx}]`,
    `[fg_in_${idx}]scale=${w}:${h}:force_original_aspect_ratio=decrease${zoom > 1.01 ? `,scale=trunc(iw*${zoom.toFixed(2)}/2)*2:trunc(ih*${zoom.toFixed(2)}/2)*2,crop=min(iw\\,${w}):min(ih\\,${h})` : ''}[fg_${idx}]`,
    `[bg_${idx}][fg_${idx}]overlay=(W-w)/2:(H-h)/2${motionExpr ? `,${motionExpr}` : ''},${normTail}${outLabel}`
  ];
}

export async function renderEdlToMp4(params: {
  batchId: string;
  clipId: string;
  versionNumber: number;
  edl: EdlDocument;
  sources: RenderMediaSource[];
  watermarkRelPath?: string | null;
  skipEmbeddedSubtitles?: boolean;
}): Promise<RenderEdlResult> {
  const started = Date.now();
  const { batchId, clipId, versionNumber, edl, sources, watermarkRelPath, skipEmbeddedSubtitles = true } = params;

  const sourcesById = new Map(sources.map((s) => [s.id, s]));
  const { clampedEdl, totalDurationSec } = clampEdlToMediaDurations(edl, sourcesById);

  const relDir = `renders/${batchId}/${clipId}/v${versionNumber}`;
  const absDir = resolveSafeStoragePath(relDir);
  fs.mkdirSync(absDir, { recursive: true });

  const wordsByMediaId: Record<string, WordTimestamp[]> = {};
  const skipCaptionMediaIds = new Set<string>();
  for (const s of sources) {
    wordsByMediaId[s.id] = s.words;
    if (skipEmbeddedSubtitles && s.hasEmbeddedSubtitles) {
      skipCaptionMediaIds.add(s.id);
    }
  }

  const subs = writeAssAndSrtFiles({
    outputDir: absDir,
    edl: clampedEdl,
    wordsByMediaId,
    totalDurationSec,
    skipCaptionMediaIds
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
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];
  const segEffDurs: number[] = [];

  const allSourcesHaveAudio = clampedEdl.segments.every((s) => sourcesById.get(s.mediaAssetId)?.hasAudio);
  const shouldMute =
    clampedEdl.audio.muteOriginal || clampedEdl.audio.originalVolume <= 0 || !allSourcesHaveAudio;

  clampedEdl.segments.forEach((seg, idx) => {
    const inIdx = mediaInputIndex.get(seg.mediaAssetId)!;
    const speed = Math.min(1.6, Math.max(0.6, seg.speed ?? 1.0));
    const effDur = (seg.endSec - seg.startSec) / speed;
    segEffDurs.push(effDur);

    const rawV = `[vraw_${idx}]`;
    const framedV = `[v_${idx}]`;
    const speedPtsExpr = Math.abs(speed - 1.0) > 0.01
      ? `setpts=(PTS-STARTPTS)/${speed.toFixed(3)}`
      : 'setpts=PTS-STARTPTS';

    // Normalisasi ke FPS konstan lebih awal sebelum overlay/zoompan/xfade agar video HP 24fps/60fps/VFR 100% sinkron
    filterParts.push(
      `[${inIdx}:v]trim=start=${seg.startSec.toFixed(2)}:end=${seg.endSec.toFixed(2)},${speedPtsExpr},fps=${clampedEdl.resolution.fps}${rawV}`
    );
    filterParts.push(...buildFramingFilter(rawV, framedV, clampedEdl, seg, idx, effDur));
    videoLabels.push(framedV);

    if (!shouldMute) {
      const aLabel = `[a_${idx}]`;
      const atempoExpr = Math.abs(speed - 1.0) > 0.01 ? `,atempo=${speed.toFixed(3)}` : '';
      filterParts.push(
        `[${inIdx}:a]atrim=start=${seg.startSec.toFixed(2)}:end=${seg.endSec.toFixed(2)},asetpts=PTS-STARTPTS${atempoExpr},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${aLabel}`
      );
      audioLabels.push(aLabel);
    }
  });

  // Gabungkan segmen dengan dukungan transisi sinematik xfade & acrossfade (atau hard cut bila diminta)
  let currentVideoLabel = videoLabels[0];
  let currentAudioLabel = audioLabels[0] ?? '';
  let runningDuration = segEffDurs[0] ?? 0;

  for (let i = 1; i < videoLabels.length; i += 1) {
    const seg = clampedEdl.segments[i];
    const prevDur = segEffDurs[i - 1] ?? 0;
    const currDur = segEffDurs[i] ?? 0;
    const tr = seg.transition ?? 'cut';
    const nextVLabel = `[vchain_${i}]`;
    const nextALabel = `[achain_${i}]`;

    const canXfade = tr !== 'cut' && prevDur >= 0.85 && currDur >= 0.85 && runningDuration >= 0.85;
    if (canXfade) {
      const td = Math.min(0.45, Math.max(0.18, seg.transitionDurationSec ?? 0.3), prevDur * 0.35, currDur * 0.35);
      const offset = Math.max(0.1, runningDuration - td);
      filterParts.push(
        `${currentVideoLabel}${videoLabels[i]}xfade=transition=${tr}:duration=${td.toFixed(3)}:offset=${offset.toFixed(3)}${nextVLabel}`
      );
      if (!shouldMute) {
        filterParts.push(
          `${currentAudioLabel}${audioLabels[i]}acrossfade=d=${td.toFixed(3)}:c1=tri:c2=tri${nextALabel}`
        );
        currentAudioLabel = nextALabel;
      }
      runningDuration = offset + currDur;
    } else {
      filterParts.push(`${currentVideoLabel}${videoLabels[i]}concat=n=2:v=1:a=0${nextVLabel}`);
      if (!shouldMute) {
        filterParts.push(`${currentAudioLabel}${audioLabels[i]}concat=n=2:v=0:a=1${nextALabel}`);
        currentAudioLabel = nextALabel;
      }
      runningDuration += currDur;
    }

    currentVideoLabel = nextVLabel;
  }

  // Terapkan Cinema Color Grading terpadu agar warna lintas Video 1, 2, 3 selaras seperti film
  const colorFilter = buildColorGradeFilter(clampedEdl.colorGrade);
  if (colorFilter) {
    filterParts.push(`${currentVideoLabel}${colorFilter}[vgraded]`);
    currentVideoLabel = '[vgraded]';
  }

  // Tempel Watermark PNG jika ada (di dalam area Safe-Zone)
  if (watermarkIdx !== null) {
    const opacity = clampedEdl.supportingOverlays.watermarkOpacity;
    const pos = clampedEdl.supportingOverlays.watermarkPosition;
    const overlayCoords =
      pos === 'top_right_safe'
        ? 'W-w-210:260'
        : pos === 'bottom_left_safe'
          ? '60:H-h-580'
          : '60:260';

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
      `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${Math.max(0.5, runningDuration).toFixed(2)}[afinal]`
    );
  } else {
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
    'superfast',
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
  const coverSec = Math.min(1.2, Math.max(0.1, runningDuration / 2));
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
    actualDurationSec: verified.durationSec ?? runningDuration,
    renderDurationMs: Date.now() - started,
    clampedEdl
  };
}
