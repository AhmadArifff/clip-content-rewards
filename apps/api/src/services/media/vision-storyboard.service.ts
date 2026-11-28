import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { resolveSafeStoragePath } from '../../config/storage.js';

export interface VideoStoryboard {
  mediaAssetId: string;
  filename: string;
  durationSec: number;
  mimeType: 'image/jpeg';
  dataBase64: string;
  frameTimestampsSec: number[];
}

function runFfmpegSimple(args: string[], timeoutMs = 45000): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout saat mengekstrak storyboard visual.'));
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
      else reject(new Error(`FFmpeg storyboard gagal (${code}): ${stderr.slice(-240)}`));
    });
  });
}

// Mengekstrak 1 contact-sheet JPEG (grid 3x2 = 6 frame merata sepanjang video) secara lokal 100% gratis
// agar Gemini Vision benar-benar "menonton" isi visual setiap video mentah sebelum merakit montage.
export async function extractVideoStoryboards(
  rawVideos: Array<{ id: string; originalFilename: string; filePath: string; durationSec: number }>,
  maxVideos = 4
): Promise<VideoStoryboard[]> {
  const results: VideoStoryboard[] = [];
  const tempDir = resolveSafeStoragePath('temp');
  fs.mkdirSync(tempDir, { recursive: true });

  const targets = rawVideos.slice(0, maxVideos);

  for (const vid of targets) {
    const dur = Math.max(1.2, vid.durationSec);
    const cols = 3;
    const rows = 2;
    const totalTiles = cols * rows;
    const step = dur / totalTiles;
    const fps = Math.max(0.05, (totalTiles + 0.5) / dur);
    const frameTimestampsSec = Array.from({ length: totalTiles }, (_, idx) =>
      Math.round(Math.min(dur - 0.1, (idx + 0.5) * step) * 10) / 10
    );

    const outAbs = path.join(tempDir, `sb_${vid.id}_${Date.now()}.jpg`);
    try {
      const absVideo = resolveSafeStoragePath(vid.filePath);
      if (!fs.existsSync(absVideo)) continue;

      await runFfmpegSimple([
        '-y',
        '-i', absVideo,
        '-vf', `fps=${fps.toFixed(4)},scale=240:-2:flags=fast_bilinear,tile=${cols}x${rows}:padding=4:margin=4`,
        '-frames:v', '1',
        '-q:v', '6',
        outAbs
      ]);

      if (fs.existsSync(outAbs)) {
        const buf = fs.readFileSync(outAbs);
        if (buf.length > 0 && buf.length <= 450 * 1024) {
          results.push({
            mediaAssetId: vid.id,
            filename: vid.originalFilename,
            durationSec: Math.round(dur * 100) / 100,
            mimeType: 'image/jpeg',
            dataBase64: buf.toString('base64'),
            frameTimestampsSec
          });
        }
      }
    } catch {
      // Lanjutkan video berikutnya jika 1 video gagal diekstrak storyboard-nya
    } finally {
      if (fs.existsSync(outAbs)) {
        try {
          fs.unlinkSync(outAbs);
        } catch {
          // Abaikan gagal hapus temp
        }
      }
    }
  }

  return results;
}
