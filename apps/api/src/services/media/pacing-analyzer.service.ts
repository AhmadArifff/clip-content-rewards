import { spawn } from 'node:child_process';
import {
  PacingBlueprintSchema,
  type PacingBlueprint,
  type PacingEnergyCurve,
  type PacingShot
} from '@clip/shared';
import { env } from '../../config/env.js';

export interface AnalyzedReferencePacing {
  metadata: {
    durationSec: number;
    width: number | null;
    height: number | null;
    fps: number | null;
  };
  blueprint: PacingBlueprint;
}

function runCommand(bin: string, args: string[], timeoutMs = 90000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Analisis video referensi melebihi batas waktu.'));
    }, timeoutMs);

    proc.stdout.on('data', (d) => {
      stdout += String(d);
    });
    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

function parseFps(raw?: string): number | null {
  if (!raw) return null;
  const parts = raw.split('/');
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (den > 0 && Number.isFinite(num / den)) {
      return Math.round((num / den) * 100) / 100;
    }
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

async function detectSceneCutTimes(absVideoPath: string, threshold: number): Promise<number[]> {
  const res = await runCommand(env.FFMPEG_PATH, [
    '-hide_banner',
    '-i', absVideoPath,
    '-vf', `select='gt(scene,${threshold.toFixed(2)})',showinfo`,
    '-an',
    '-f', 'null',
    '-'
  ]);

  const cuts: number[] = [];
  const regex = /pts_time:(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(res.stderr)) !== null) {
    const t = Number(m[1]);
    if (Number.isFinite(t) && t > 0.35) {
      cuts.push(Math.round(t * 100) / 100);
    }
  }
  return cuts;
}

function classifyEnergyCurve(shots: PacingShot[], durationSec: number): {
  energyCurve: PacingEnergyCurve;
  hookWindowAvgShotSec: number;
  styleSummary: string;
} {
  const avgAll = shots.reduce((s, x) => s + x.durationSec, 0) / Math.max(1, shots.length);
  const hookShots = shots.filter((s) => s.startSec < Math.min(3.5, durationSec * 0.35));
  const hookAvg =
    hookShots.length > 0
      ? hookShots.reduce((s, x) => s + x.durationSec, 0) / hookShots.length
      : avgAll;

  const lateShots = shots.filter((s) => s.startSec >= durationSec * 0.6);
  const lateAvg =
    lateShots.length > 0
      ? lateShots.reduce((s, x) => s + x.durationSec, 0) / lateShots.length
      : avgAll;

  let energyCurve: PacingEnergyCurve = 'steady_fast';
  let styleSummary = '';

  if (avgAll >= 3.4) {
    energyCurve = 'calm_story';
    styleSummary = `Ritme storytelling tenang (rata-rata ${avgAll.toFixed(1)}s per shot) cocok untuk penjelasan narasi mendalam.`;
  } else if (hookAvg < avgAll * 0.85) {
    energyCurve = 'hook_burst_build';
    styleSummary = `Pembukaan cepat (${hookAvg.toFixed(1)}s/shot di awal) untuk menghentikan scroll lalu membangun penjelasan di tengah.`;
  } else if (lateAvg < avgAll * 0.85) {
    energyCurve = 'climax_drop';
    styleSummary = `Ritme menanjak menuju klimaks cepat di sepertiga akhir (${lateAvg.toFixed(1)}s/shot) untuk mendorong selesai tonton & loop.`;
  } else {
    energyCurve = 'steady_fast';
    styleSummary = `Potongan ritmis cepat dan konsisten (${avgAll.toFixed(1)}s per shot) untuk menjaga retensi tinggi sepanjang video.`;
  }

  return {
    energyCurve,
    hookWindowAvgShotSec: Math.round(hookAvg * 100) / 100,
    styleSummary
  };
}

export async function analyzeReferenceVideoPacing(absVideoPath: string): Promise<AnalyzedReferencePacing> {
  const probeRes = await runCommand(env.FFPROBE_PATH, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    absVideoPath
  ], 30000);

  if (probeRes.code !== 0) {
    throw new Error('INVALID_REFERENCE_VIDEO');
  }

  let parsed: {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string; duration?: string }>;
  };
  try {
    parsed = JSON.parse(probeRes.stdout);
  } catch {
    throw new Error('INVALID_REFERENCE_VIDEO');
  }

  const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
  if (!videoStream) {
    throw new Error('INVALID_REFERENCE_VIDEO');
  }

  const durationSec = Math.round(
    Number(parsed.format?.duration ?? videoStream.duration ?? 0) * 100
  ) / 100;

  if (!Number.isFinite(durationSec) || durationSec < 1.0) {
    throw new Error('INVALID_REFERENCE_VIDEO');
  }

  // Tahap 1: Deteksi cut adegan standar (threshold 0.28), fallback 0.14 jika one-take
  let rawCuts = await detectSceneCutTimes(absVideoPath, 0.28);
  if (rawCuts.length < 2) {
    const gentleCuts = await detectSceneCutTimes(absVideoPath, 0.14);
    if (gentleCuts.length > rawCuts.length) {
      rawCuts = gentleCuts;
    }
  }

  // Filter cut terlalu rapat (< 0.45s) dan batas akhir
  const cleanCuts: number[] = [];
  let lastT = 0;
  for (const t of rawCuts) {
    if (t - lastT >= 0.45 && durationSec - t >= 0.45) {
      cleanCuts.push(t);
      lastT = t;
    }
  }

  // Edge-case one-take talking head (0-1 cut terdeteksi): bentuk ritme micro-zoom pulse
  if (cleanCuts.length < 2 && durationSec >= 2.4) {
    const targetSlices = Math.min(8, Math.max(3, Math.round(durationSec / 2.2)));
    const step = durationSec / targetSlices;
    cleanCuts.length = 0;
    for (let i = 1; i < targetSlices; i += 1) {
      cleanCuts.push(Math.round(step * i * 100) / 100);
    }
  }

  // Bangun daftar shot (maksimal 24 shot representatif agar kompak & deterministik)
  const boundaries = [0, ...cleanCuts.slice(0, 23), durationSec];
  const shots: PacingShot[] = [];

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const startSec = Math.round(boundaries[i] * 100) / 100;
    const endSec = Math.round(boundaries[i + 1] * 100) / 100;
    const dur = Math.round(Math.max(0.4, endSec - startSec) * 100) / 100;
    const progressRatio = startSec / durationSec;

    let role: PacingShot['role'] = 'body';
    if (startSec < Math.min(3.0, durationSec * 0.3)) {
      role = 'hook';
    } else if (i === boundaries.length - 2 && durationSec >= 5) {
      role = 'outro';
    } else if (progressRatio >= 0.58 && progressRatio <= 0.85) {
      role = 'climax';
    }

    const suggestedZoom =
      role === 'climax'
        ? 1.14
        : role === 'hook' && i % 2 === 1
          ? 1.1
          : i % 2 === 1
            ? 1.08
            : 1.0;

    shots.push({
      index: i + 1,
      startSec,
      endSec,
      durationSec: dur,
      role,
      suggestedZoom
    });
  }

  const shotCount = shots.length;
  const avgShotDurationSec = Math.round((durationSec / Math.max(1, shotCount)) * 100) / 100;
  const cutsPerMinute = Math.round(((Math.max(0, shotCount - 1) / durationSec) * 60) * 10) / 10;
  const estimatedBpm = Math.round(Math.min(148, Math.max(88, 92 + cutsPerMinute * 0.95)));
  const { energyCurve, hookWindowAvgShotSec, styleSummary } = classifyEnergyCurve(shots, durationSec);

  const blueprint = PacingBlueprintSchema.parse({
    schemaVersion: '1.0',
    sourceDurationSec: durationSec,
    shotCount,
    avgShotDurationSec,
    cutsPerMinute,
    estimatedBpm,
    energyCurve,
    hookWindowAvgShotSec,
    styleSummary,
    shots
  });

  return {
    metadata: {
      durationSec,
      width: videoStream.width ?? null,
      height: videoStream.height ?? null,
      fps: parseFps(videoStream.r_frame_rate)
    },
    blueprint
  };
}
