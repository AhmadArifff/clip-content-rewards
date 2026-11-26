import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import type { ServiceResult } from '@clip/shared';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { FONTS_DIR, STORAGE_ROOT, getDirectorySizeBytes } from '../config/storage.js';

interface BinaryProbeResult {
  available: boolean;
  versionLine: string;
}

function probeBinary(binPath: string, args: string[]): Promise<BinaryProbeResult> {
  return new Promise((resolve) => {
    const proc = spawn(binPath, args, { shell: false });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ available: false, versionLine: 'Timeout saat memeriksa binary' });
    }, 5000);

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ available: false, versionLine: `Binary "${binPath}" tidak ditemukan di PATH` });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      const firstLine = (stdout || stderr).split(/\r?\n/)[0]?.trim() ?? '';
      resolve({
        available: code === 0,
        versionLine: firstLine || `Exit code ${code}`
      });
    });
  });
}

export interface SystemDoctorReport {
  overallStatus: 'healthy' | 'warning';
  ffmpeg: BinaryProbeResult;
  ffprobe: BinaryProbeResult;
  database: {
    walMode: string;
    masterPresetCount: number;
    activeApiKeyCount: number;
  };
  fonts: {
    bundledCount: number;
    bundledFiles: string[];
    windowsSystemFallbackReady: boolean;
  };
  storage: {
    rootPath: string;
    usedBytes: number;
    usedMb: number;
  };
  runtime: {
    nodeVersion: string;
    platform: string;
    cpuCores: number;
    maxRenderConcurrency: number;
  };
}

export const doctorService = {
  async runCheck(userId: string): Promise<ServiceResult<SystemDoctorReport>> {
    const [ffmpeg, ffprobe, walRows, presetCount, activeKeys] = await Promise.all([
      probeBinary(env.FFMPEG_PATH, ['-version']),
      probeBinary(env.FFPROBE_PATH, ['-version']),
      prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode;'),
      prisma.masterPreset.count({ where: { isActive: true } }),
      prisma.apiKey.count({ where: { userId, isActive: true } })
    ]);

    const bundledFiles = fs.existsSync(FONTS_DIR)
      ? fs.readdirSync(FONTS_DIR).filter((f) => /\.(ttf|otf)$/i.test(f))
      : [];

    const windowsSystemFallbackReady =
      process.platform === 'win32' &&
      (fs.existsSync('C:\\Windows\\Fonts\\segoeuib.ttf') ||
        fs.existsSync('C:\\Windows\\Fonts\\arialbd.ttf'));

    const usedBytes = getDirectorySizeBytes(STORAGE_ROOT);
    const usedMb = Math.round((usedBytes / (1024 * 1024)) * 100) / 100;
    const walMode = walRows?.[0]?.journal_mode ?? 'unknown';

    const overallStatus =
      ffmpeg.available && ffprobe.available && (bundledFiles.length > 0 || windowsSystemFallbackReady)
        ? 'healthy'
        : 'warning';

    return {
      ok: true,
      data: {
        overallStatus,
        ffmpeg,
        ffprobe,
        database: {
          walMode,
          masterPresetCount: presetCount,
          activeApiKeyCount: activeKeys
        },
        fonts: {
          bundledCount: bundledFiles.length,
          bundledFiles,
          windowsSystemFallbackReady
        },
        storage: {
          rootPath: STORAGE_ROOT,
          usedBytes,
          usedMb
        },
        runtime: {
          nodeVersion: process.version,
          platform: `${os.platform()} ${os.arch()}`,
          cpuCores: os.cpus().length,
          maxRenderConcurrency: env.MAX_RENDER_CONCURRENCY
        }
      }
    };
  }
};
