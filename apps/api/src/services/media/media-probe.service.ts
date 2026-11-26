import { spawn } from 'node:child_process';
import { AudioDiagnosticSchema, type AudioDiagnostic, type SilenceInterval } from '@clip/shared';
import { env } from '../../config/env.js';
import { resolveSafeStoragePath } from '../../config/storage.js';

export interface MediaProbeResult {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  audioDiagnostic: AudioDiagnostic | null;
  silences: SilenceInterval[];
}

function parseFrameRate(raw?: string): number | null {
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
  return Number.isFinite(n) ? n : null;
}

function runProcessCapture(bin: string, args: string[], timeoutMs = 45000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timeout menjalankan ${bin}`));
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
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function probeMediaAsset(relativePath: string, assetType: string): Promise<MediaProbeResult> {
  const absPath = resolveSafeStoragePath(relativePath);
  const probe = await runProcessCapture(env.FFPROBE_PATH, [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    absPath
  ]);

  if (probe.code !== 0) {
    throw new Error('File media tidak valid atau rusak saat diperiksa FFprobe.');
  }

  const parsed = JSON.parse(probe.stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
    }>;
  };

  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  const durationSec = parsed.format?.duration ? Math.round(Number(parsed.format.duration) * 100) / 100 : null;
  const width = videoStream?.width ?? null;
  const height = videoStream?.height ?? null;
  const fps = parseFrameRate(videoStream?.avg_frame_rate || videoStream?.r_frame_rate);
  const hasAudio = Boolean(audioStream);

  if (assetType === 'watermark') {
    return {
      durationSec: null,
      width,
      height,
      fps: null,
      hasAudio: false,
      audioDiagnostic: null,
      silences: []
    };
  }

  if (!hasAudio) {
    return {
      durationSec,
      width,
      height,
      fps,
      hasAudio: false,
      audioDiagnostic: AudioDiagnosticSchema.parse({
        hasAudio: false,
        meanVolumeDb: null,
        maxVolumeDb: null,
        loudnessLufs: null,
        recommendedAudioMode: 'mute_for_platform_sound',
        reason: 'Video mentah tidak memiliki trek audio (Visual-Only). Disarankan mode Mute 0% dan gunakan Trending Sound saat upload di TikTok/YouTube.'
      }),
      silences: []
    };
  }

  // Analisis volume & jeda hening (maks 10 menit pertama agar cepat di laptop lokal)
  const audioPass = await runProcessCapture(
    env.FFMPEG_PATH,
    [
      '-t',
      '600',
      '-i',
      absPath,
      '-vn',
      '-af',
      'silencedetect=noise=-35dB:d=0.45,volumedetect',
      '-f',
      'null',
      '-'
    ],
    60000
  );

  const stderr = audioPass.stderr;
  const meanMatch = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  const maxMatch = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  const meanVolumeDb = meanMatch ? Number(meanMatch[1]) : null;
  const maxVolumeDb = maxMatch ? Number(maxMatch[1]) : null;

  const silences: SilenceInterval[] = [];
  const silenceRegex = /silence_start:\s*(\d+(?:\.\d+)?)[\s\S]*?silence_end:\s*(\d+(?:\.\d+)?)\s*\|\s*silence_duration:\s*(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = silenceRegex.exec(stderr)) !== null) {
    silences.push({
      startSec: Math.round(Number(m[1]) * 100) / 100,
      endSec: Math.round(Number(m[2]) * 100) / 100,
      durationSec: Math.round(Number(m[3]) * 100) / 100
    });
  }

  let recommendedAudioMode: AudioDiagnostic['recommendedAudioMode'] = 'original_normalized';
  let reason = 'Audio vokal terdeteksi normal. Disarankan Original Normalized (-14 LUFS) atau Ducking 20% bila ingin menambah musik latar TikTok.';

  if (meanVolumeDb !== null && meanVolumeDb < -52) {
    recommendedAudioMode = 'mute_for_platform_sound';
    reason = `Audio asli sangat sunyi (${meanVolumeDb} dB). Disarankan Mute 0% agar bersih diisi Trending Sound TikTok/YouTube.`;
  } else if (meanVolumeDb !== null && meanVolumeDb > -12) {
    recommendedAudioMode = 'ducking_20';
    reason = `Audio asli cukup padat/keras (${meanVolumeDb} dB, indikasi musik latar kuat). Pertimbangkan Ducking 20% atau Mute 0% jika akan memakai sound platform.`;
  }

  const audioDiagnostic = AudioDiagnosticSchema.parse({
    hasAudio: true,
    meanVolumeDb,
    maxVolumeDb,
    loudnessLufs: meanVolumeDb,
    recommendedAudioMode,
    reason
  });

  return {
    durationSec,
    width,
    height,
    fps,
    hasAudio: true,
    audioDiagnostic,
    silences: silences.slice(0, 300)
  };
}
