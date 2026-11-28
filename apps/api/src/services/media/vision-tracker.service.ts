import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';

const SAMPLE_W = 160;
const SAMPLE_H = 90;
const FRAME_BYTES = SAMPLE_W * SAMPLE_H * 3;

export interface SegmentFocusResult {
  index: number;
  startSec: number;
  endSec: number;
  focusX: number;
  cropX: 'left' | 'center' | 'right';
  confidence: number;
  signalType: 'face_skin' | 'motion_edge' | 'balanced_center';
}

export interface CoverCandidateItem {
  index: number;
  timestampSec: number;
  score: number;
  isRecommended: boolean;
  sharpnessScore: number;
  brightnessScore: number;
  subjectScore: number;
  filename: string;
}

function runFfmpegBuffer(args: string[], timeoutMs = 45000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    const chunks: Buffer[] = [];
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout saat mengekstrak frame vision.'));
    }, timeoutMs);

    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`FFmpeg vision error (${code}): ${stderr.slice(-240)}`));
    });
  });
}

function runFfmpegFile(args: string[], timeoutMs = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout saat mengekstrak gambar cover.'));
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
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg cover gagal (${code}): ${stderr.slice(-240)}`));
    });
  });
}

function analyzeSingleRgbFrame(frame: Buffer, prevFrame: Buffer | null): {
  focusX: number;
  skinRatio: number;
  edgeMean: number;
  brightnessMean: number;
  confidence: number;
  signalType: 'face_skin' | 'motion_edge' | 'balanced_center';
} {
  const colSkin = new Float64Array(SAMPLE_W);
  const colMotionEdge = new Float64Array(SAMPLE_W);

  let skinCount = 0;
  let edgeSum = 0;
  let lumSum = 0;
  const totalPixels = SAMPLE_W * SAMPLE_H;

  for (let y = 0; y < SAMPLE_H; y += 1) {
    // Bobot lebih tinggi pada zona wajah/pembicara (10%-72% vertikal)
    const verticalWeight = y >= 9 && y <= 65 ? 1.5 : 0.7;

    for (let x = 0; x < SAMPLE_W; x += 1) {
      const idx = (y * SAMPLE_W + x) * 3;
      const r = frame[idx];
      const g = frame[idx + 1];
      const b = frame[idx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      lumSum += lum;

      // 1. Deteksi warna kulit / wajah (YCbCr Skin Cluster)
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const isSkin =
        lum >= 55 &&
        lum <= 235 &&
        cb >= 77 &&
        cb <= 127 &&
        cr >= 133 &&
        cr <= 173 &&
        r > g &&
        r > b;

      if (isSkin) {
        skinCount += 1;
        colSkin[x] += 4.5 * verticalWeight;
      }

      // 2. Ketajaman tepi (Sobel/Gradient lokal)
      let edgeVal = 0;
      if (x > 0 && y > 0) {
        const leftIdx = idx - 3;
        const upIdx = idx - SAMPLE_W * 3;
        const lumLeft = 0.299 * frame[leftIdx] + 0.587 * frame[leftIdx + 1] + 0.114 * frame[leftIdx + 2];
        const lumUp = 0.299 * frame[upIdx] + 0.587 * frame[upIdx + 1] + 0.114 * frame[upIdx + 2];
        edgeVal = Math.abs(lum - lumLeft) + Math.abs(lum - lumUp);
        edgeSum += edgeVal;
        if (edgeVal > 24) {
          colMotionEdge[x] += (edgeVal / 45) * verticalWeight;
        }
      }

      // 3. Delta gerakan antar frame
      if (prevFrame) {
        const diff =
          Math.abs(r - prevFrame[idx]) +
          Math.abs(g - prevFrame[idx + 1]) +
          Math.abs(b - prevFrame[idx + 2]);
        if (diff > 36) {
          colMotionEdge[x] += (diff / 60) * 1.8 * verticalWeight;
        }
      }
    }
  }

  let skinWeightSum = 0;
  let skinWeightedX = 0;
  let edgeWeightSum = 0;
  let edgeWeightedX = 0;

  for (let x = 0; x < SAMPLE_W; x += 1) {
    skinWeightSum += colSkin[x];
    skinWeightedX += colSkin[x] * x;
    edgeWeightSum += colMotionEdge[x];
    edgeWeightedX += colMotionEdge[x] * x;
  }

  const skinRatio = skinCount / totalPixels;
  let focusX = 0.5;
  let confidence = 0.5;
  let signalType: 'face_skin' | 'motion_edge' | 'balanced_center' = 'balanced_center';

  if (skinRatio >= 0.015 && skinWeightSum > 0) {
    // Prioritaskan posisi wajah/kulit + sedikit kontribusi gerakan
    const skinX = skinWeightedX / skinWeightSum / (SAMPLE_W - 1);
    const edgeX = edgeWeightSum > 0 ? edgeWeightedX / edgeWeightSum / (SAMPLE_W - 1) : skinX;
    focusX = skinX * 0.8 + edgeX * 0.2;
    confidence = Math.min(0.96, 0.72 + skinRatio * 2.5);
    signalType = 'face_skin';
  } else if (edgeWeightSum > 40) {
    focusX = edgeWeightedX / edgeWeightSum / (SAMPLE_W - 1);
    confidence = 0.68;
    signalType = 'motion_edge';
  }

  focusX = Math.round(Math.min(0.92, Math.max(0.08, focusX)) * 1000) / 1000;
  return {
    focusX,
    skinRatio,
    edgeMean: edgeSum / totalPixels,
    brightnessMean: lumSum / totalPixels,
    confidence: Math.round(confidence * 100) / 100,
    signalType
  };
}

export function focusXToCropX(focusX: number): 'left' | 'center' | 'right' {
  if (focusX < 0.38) return 'left';
  if (focusX > 0.62) return 'right';
  return 'center';
}

export async function analyzeSubjectFocusTrack(
  absVideoPath: string,
  segments: Array<{ startSec: number; endSec: number }>
): Promise<SegmentFocusResult[]> {
  const sampleFps = 2;
  const raw = await runFfmpegBuffer([
    '-hide_banner',
    '-loglevel', 'error',
    '-i', absVideoPath,
    '-vf', `fps=${sampleFps},scale=${SAMPLE_W}:${SAMPLE_H}`,
    '-an',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    'pipe:1'
  ]);

  const frameCount = Math.floor(raw.length / FRAME_BYTES);
  const perFrame: Array<{
    t: number;
    focusX: number;
    confidence: number;
    signalType: 'face_skin' | 'motion_edge' | 'balanced_center';
  }> = [];

  for (let i = 0; i < frameCount; i += 1) {
    const startByte = i * FRAME_BYTES;
    const frameBuf = raw.subarray(startByte, startByte + FRAME_BYTES);
    const prevBuf = i > 0 ? raw.subarray(startByte - FRAME_BYTES, startByte) : null;
    const stats = analyzeSingleRgbFrame(frameBuf, prevBuf);
    perFrame.push({
      t: i / sampleFps,
      focusX: stats.focusX,
      confidence: stats.confidence,
      signalType: stats.signalType
    });
  }

  return segments.map((seg, index) => {
    const strictWindow = perFrame.filter((f) => f.t >= seg.startSec && f.t < seg.endSec);
    const softWindow =
      strictWindow.length > 0
        ? strictWindow
        : perFrame.filter((f) => f.t >= seg.startSec - 0.25 && f.t <= seg.endSec + 0.25);
    const sampleSet = softWindow.length > 0 ? softWindow : perFrame;

    if (sampleSet.length === 0) {
      return {
        index,
        startSec: seg.startSec,
        endSec: seg.endSec,
        focusX: 0.5,
        cropX: 'center',
        confidence: 0.5,
        signalType: 'balanced_center'
      };
    }

    const avgFocusX =
      Math.round(
        (sampleSet.reduce((s, f) => s + f.focusX, 0) / sampleSet.length) * 1000
      ) / 1000;
    const avgConf =
      Math.round(
        (sampleSet.reduce((s, f) => s + f.confidence, 0) / sampleSet.length) * 100
      ) / 100;
    const hasSkin = sampleSet.some((f) => f.signalType === 'face_skin');
    const hasMotion = sampleSet.some((f) => f.signalType === 'motion_edge');

    return {
      index,
      startSec: seg.startSec,
      endSec: seg.endSec,
      focusX: avgFocusX,
      cropX: focusXToCropX(avgFocusX),
      confidence: avgConf,
      signalType: hasSkin ? 'face_skin' : hasMotion ? 'motion_edge' : 'balanced_center'
    };
  });
}

export async function extractCoverAtTimestamp(
  absVideoPath: string,
  absCoverOutPath: string,
  timestampSec: number
): Promise<void> {
  const safeT = Math.max(0.05, timestampSec);
  await runFfmpegFile([
    '-y',
    '-ss', safeT.toFixed(2),
    '-i', absVideoPath,
    '-frames:v', '1',
    '-q:v', '2',
    absCoverOutPath
  ]);
}

export async function extractAndRankCoverCandidates(
  absVideoPath: string,
  absOutputDir: string,
  totalDurationSec: number
): Promise<CoverCandidateItem[]> {
  fs.mkdirSync(absOutputDir, { recursive: true });
  const dur = Math.max(0.6, totalDurationSec);
  const count = 6;
  const startT = Math.min(0.25, dur * 0.08);
  const endT = Math.max(startT + 0.1, dur - 0.15);

  const candidates: CoverCandidateItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const ratio = count > 1 ? i / (count - 1) : 0;
    const ts = Math.round((startT + (endT - startT) * ratio) * 100) / 100;
    const filename = `cover-cand-${i}.jpg`;
    const absThumb = path.join(absOutputDir, filename);

    // Ekstrak thumbnail pratinjau ringan + baca piksel RGB untuk penilaian kualitas cover
    await runFfmpegFile([
      '-y',
      '-ss', ts.toFixed(2),
      '-i', absVideoPath,
      '-frames:v', '1',
      '-vf', 'scale=320:-2',
      '-q:v', '4',
      absThumb
    ]);

    const rgbBuf = await runFfmpegBuffer([
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', ts.toFixed(2),
      '-i', absVideoPath,
      '-frames:v', '1',
      '-vf', `scale=${SAMPLE_W}:${SAMPLE_H}`,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1'
    ]);

    const stats = rgbBuf.length >= FRAME_BYTES
      ? analyzeSingleRgbFrame(rgbBuf.subarray(0, FRAME_BYTES), null)
      : { focusX: 0.5, skinRatio: 0, edgeMean: 12, brightnessMean: 120, confidence: 0.5, signalType: 'balanced_center' as const };

    const sharpnessScore = Math.min(100, Math.round(stats.edgeMean * 3.2));
    // Kecerahan ideal berada di rentang 85-175 (hindari frame terlalu gelap atau overexposed)
    const brightDist = Math.abs(stats.brightnessMean - 128);
    const brightnessScore = Math.max(20, Math.round(100 - brightDist * 0.72));
    const subjectScore = Math.min(100, Math.round(62 + stats.skinRatio * 180 + (stats.confidence - 0.5) * 40));

    // Bonus kecil untuk 3 detik pertama (hook visual kuat di cover)
    const hookBonus = ts <= Math.min(3.0, dur * 0.45) ? 4 : 0;
    const totalScore = Math.min(
      99,
      Math.max(40, Math.round(sharpnessScore * 0.4 + brightnessScore * 0.3 + subjectScore * 0.3 + hookBonus))
    );

    candidates.push({
      index: i,
      timestampSec: ts,
      score: totalScore,
      isRecommended: false,
      sharpnessScore,
      brightnessScore,
      subjectScore,
      filename
    });
  }

  let bestIdx = 0;
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].score > candidates[bestIdx].score) bestIdx = i;
  }
  if (candidates[bestIdx]) {
    candidates[bestIdx].isRecommended = true;
  }

  return candidates;
}
