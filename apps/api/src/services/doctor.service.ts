import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ServiceResult } from '@clip/shared';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { FONTS_DIR, STORAGE_ROOT, getDirectorySizeBytes, resolveSafeStoragePath } from '../config/storage.js';

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
    breakdown: {
      uploadsMb: number;
      rendersMb: number;
      tempMb: number;
      databaseMb: number;
    };
  };
  runtime: {
    nodeVersion: string;
    platform: string;
    cpuCores: number;
    maxRenderConcurrency: number;
  };
}

function bytesToMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function computeStorageStats() {
  const uploadsBytes = getDirectorySizeBytes(resolveSafeStoragePath('uploads'));
  const rendersBytes = getDirectorySizeBytes(resolveSafeStoragePath('renders'));
  const tempBytes = getDirectorySizeBytes(resolveSafeStoragePath('temp'));
  const dbPath = resolveSafeStoragePath('clip_content_rewards.db');
  const dbBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
  const usedBytes = getDirectorySizeBytes(STORAGE_ROOT);

  return {
    rootPath: STORAGE_ROOT,
    usedBytes,
    usedMb: bytesToMb(usedBytes),
    breakdown: {
      uploadsMb: bytesToMb(uploadsBytes),
      rendersMb: bytesToMb(rendersBytes),
      tempMb: bytesToMb(tempBytes),
      databaseMb: bytesToMb(dbBytes)
    }
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

    const storage = computeStorageStats();
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
        storage,
        runtime: {
          nodeVersion: process.version,
          platform: `${os.platform()} ${os.arch()}`,
          cpuCores: os.cpus().length,
          maxRenderConcurrency: env.MAX_RENDER_CONCURRENCY
        }
      }
    };
  },

  async getStorageStats(): Promise<ServiceResult<ReturnType<typeof computeStorageStats>>> {
    return {
      ok: true,
      data: computeStorageStats()
    };
  },

  async cleanupTemp(
    userId: string,
    options: { includeInactiveVersions?: boolean } = {}
  ): Promise<
    ServiceResult<{
      deletedItemsCount: number;
      freedBytes: number;
      freedMb: number;
      storage: ReturnType<typeof computeStorageStats>;
    }>
  > {
    const activeJobs = await prisma.renderJob.count({
      where: { status: { in: ['queued', 'processing'] } }
    });
    if (activeJobs > 0) {
      return {
        ok: false,
        code: 'RENDER_IN_PROGRESS',
        message: 'Tidak dapat membersihkan berkas sementara saat masih ada proses render yang sedang berjalan.',
        statusCode: 409
      };
    }

    let deletedItemsCount = 0;
    let freedBytes = 0;

    // 1. Bersihkan isi folder storage/temp (tetap mempertahankan folder temp)
    const tempDir = resolveSafeStoragePath('temp');
    if (fs.existsSync(tempDir)) {
      for (const entry of fs.readdirSync(tempDir, { withFileTypes: true })) {
        const full = path.join(tempDir, entry.name);
        const entrySize = entry.isDirectory() ? getDirectorySizeBytes(full) : fs.statSync(full).size;
        fs.rmSync(full, { recursive: true, force: true });
        deletedItemsCount += 1;
        freedBytes += entrySize;
      }
    }

    // 2. Opsional: hapus berkas fisik versi klip lama yang bukan versi aktif
    if (options.includeInactiveVersions) {
      const clips = await prisma.clip.findMany({
        where: {
          batch: {
            campaign: { userId },
            status: { notIn: ['queued', 'processing'] }
          }
        },
        include: { versions: true }
      });

      for (const clip of clips) {
        for (const ver of clip.versions) {
          if (ver.id === clip.activeVersionId) continue;
          const relPaths = [ver.outputVideoPath, ver.outputSrtPath, ver.outputAssPath, ver.coverImagePath].filter(
            (p): p is string => Boolean(p)
          );
          for (const rel of relPaths) {
            const abs = resolveSafeStoragePath(rel);
            if (fs.existsSync(abs)) {
              freedBytes += fs.statSync(abs).size;
              fs.rmSync(abs, { force: true });
              deletedItemsCount += 1;
            }
          }
          if (relPaths.length > 0) {
            await prisma.clipVersion.update({
              where: { id: ver.id },
              data: {
                outputVideoPath: null,
                outputSrtPath: null,
                outputAssPath: null,
                coverImagePath: null
              }
            });
          }
        }
      }
    }

    return {
      ok: true,
      data: {
        deletedItemsCount,
        freedBytes,
        freedMb: bytesToMb(freedBytes),
        storage: computeStorageStats()
      }
    };
  }
};
