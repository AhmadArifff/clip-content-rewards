import fs from 'node:fs';
import path from 'node:path';
import {
  RetentionPolicyConfigSchema,
  type ClipRetentionActionInput,
  type RetentionPolicyConfig,
  type ServiceResult,
  type UpdateRetentionPolicyInput
} from '@clip/shared';
import { prisma } from '../config/prisma.js';
import { getDirectorySizeBytes, resolveSafeStoragePath, STORAGE_ROOT } from '../config/storage.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function bytesToMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function safeFileSize(relPath: string | null | undefined): number {
  if (!relPath) return 0;
  try {
    const abs = resolveSafeStoragePath(relPath);
    if (!fs.existsSync(abs)) return 0;
    const st = fs.statSync(abs);
    return st.isDirectory() ? getDirectorySizeBytes(abs) : st.size;
  } catch {
    return 0;
  }
}

function safeRemoveRelPath(relPath: string | null | undefined): number {
  if (!relPath) return 0;
  try {
    const abs = resolveSafeStoragePath(relPath);
    if (!fs.existsSync(abs)) return 0;
    const st = fs.statSync(abs);
    const sz = st.isDirectory() ? getDirectorySizeBytes(abs) : st.size;
    fs.rmSync(abs, { recursive: true, force: true });
    return sz;
  } catch {
    return 0;
  }
}

function computeStorageBreakdown() {
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
    uploadsBytes,
    rendersBytes,
    tempBytes,
    databaseBytes: dbBytes,
    breakdown: {
      uploadsMb: bytesToMb(uploadsBytes),
      rendersMb: bytesToMb(rendersBytes),
      tempMb: bytesToMb(tempBytes),
      databaseMb: bytesToMb(dbBytes)
    }
  };
}

function parsePolicyJson(raw: string | null | undefined): RetentionPolicyConfig {
  if (!raw) return RetentionPolicyConfigSchema.parse({});
  try {
    return RetentionPolicyConfigSchema.parse(JSON.parse(raw));
  } catch {
    return RetentionPolicyConfigSchema.parse({});
  }
}

async function loadRetentionPolicy(userId: string): Promise<RetentionPolicyConfig> {
  const userCode = `user_${userId}`;
  const rows = await prisma.masterPreset.findMany({
    where: {
      category: 'retention_policy',
      code: { in: [userCode, 'default_policy'] },
      isActive: true
    }
  });
  const userRow = rows.find((r) => r.code === userCode);
  if (userRow) return parsePolicyJson(userRow.configJson);
  const defRow = rows.find((r) => r.code === 'default_policy');
  if (defRow) return parsePolicyJson(defRow.configJson);
  return RetentionPolicyConfigSchema.parse({});
}

async function assertNoActiveRenderJobs(): Promise<ServiceResult<null>> {
  const activeJobs = await prisma.renderJob.count({
    where: { status: { in: ['queued', 'processing'] } }
  });
  if (activeJobs > 0) {
    return {
      ok: false,
      code: 'RENDER_IN_PROGRESS',
      message: 'Tidak dapat membersihkan berkas media saat masih ada proses render yang sedang berjalan.',
      statusCode: 409
    };
  }
  return { ok: true, data: null };
}

function findOrphanEntriesOnDisk(referencedAbsPaths: Set<string>): Array<{
  relPath: string;
  kind: 'temp_file' | 'orphan_render';
  sizeBytes: number;
  sizeMb: number;
}> {
  const results: Array<{ relPath: string; kind: 'temp_file' | 'orphan_render'; sizeBytes: number; sizeMb: number }> = [];

  // 1. Semua isi folder storage/temp (aman dibersihkan saat tidak ada render berjalan)
  const tempDir = resolveSafeStoragePath('temp');
  if (fs.existsSync(tempDir)) {
    for (const entry of fs.readdirSync(tempDir, { withFileTypes: true })) {
      const full = path.join(tempDir, entry.name);
      const sz = entry.isDirectory() ? getDirectorySizeBytes(full) : fs.statSync(full).size;
      results.push({
        relPath: `temp/${entry.name}`,
        kind: 'temp_file',
        sizeBytes: sz,
        sizeMb: bytesToMb(sz)
      });
    }
  }

  // 2. Folder/file yatim di dalam storage/renders yang tidak lagi direferensikan oleh ClipVersion mana pun di DB
  const rendersDir = resolveSafeStoragePath('renders');
  if (fs.existsSync(rendersDir)) {
    const walkRenders = (dirAbs: string, depth: number) => {
      for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
        const full = path.join(dirAbs, entry.name);
        if (entry.isDirectory()) {
          // Folder versi biasanya berada di kedalaman renders/<batchId>/<clipId>/vN (depth 2)
          if (depth < 2) {
            walkRenders(full, depth + 1);
            // Jika folder menjadi kosong total, tandai sebagai orphan dir
            if (fs.readdirSync(full).length === 0) {
              const rel = path.relative(STORAGE_ROOT, full).replace(/\\/g, '/');
              results.push({ relPath: rel, kind: 'orphan_render', sizeBytes: 0, sizeMb: 0 });
            }
          } else {
            const innerFiles = fs.readdirSync(full, { withFileTypes: true });
            const hasAnyReferenced = innerFiles.some(
              (f) => f.isFile() && referencedAbsPaths.has(path.resolve(full, f.name).toLowerCase())
            );
            if (!hasAnyReferenced) {
              const sz = getDirectorySizeBytes(full);
              const rel = path.relative(STORAGE_ROOT, full).replace(/\\/g, '/');
              results.push({
                relPath: rel,
                kind: 'orphan_render',
                sizeBytes: sz,
                sizeMb: bytesToMb(sz)
              });
            }
          }
        } else {
          const normalized = path.resolve(full).toLowerCase();
          if (!referencedAbsPaths.has(normalized)) {
            const sz = fs.statSync(full).size;
            const rel = path.relative(STORAGE_ROOT, full).replace(/\\/g, '/');
            results.push({
              relPath: rel,
              kind: 'orphan_render',
              sizeBytes: sz,
              sizeMb: bytesToMb(sz)
            });
          }
        }
      }
    };
    walkRenders(rendersDir, 0);
  }

  return results;
}

export const maintenanceService = {
  async getPolicy(userId: string): Promise<ServiceResult<RetentionPolicyConfig>> {
    const policy = await loadRetentionPolicy(userId);
    return { ok: true, data: policy };
  },

  async updatePolicy(
    userId: string,
    input: UpdateRetentionPolicyInput
  ): Promise<ServiceResult<RetentionPolicyConfig>> {
    const code = `user_${userId}`;
    const config: RetentionPolicyConfig = {
      staleDaysThreshold: input.staleDaysThreshold,
      warningDaysThreshold: input.warningDaysThreshold,
      publishedPruneDays: input.publishedPruneDays,
      diskWarningMb: input.diskWarningMb
    };

    await prisma.masterPreset.upsert({
      where: { category_code: { category: 'retention_policy', code } },
      update: {
        labelId: `Kebijakan Retensi Studio (${config.staleDaysThreshold} Hari / Batas ${config.diskWarningMb} MB)`,
        configJson: JSON.stringify(config),
        isActive: true
      },
      create: {
        category: 'retention_policy',
        code,
        labelId: `Kebijakan Retensi Studio (${config.staleDaysThreshold} Hari / Batas ${config.diskWarningMb} MB)`,
        configJson: JSON.stringify(config),
        sortOrder: 50,
        isActive: true
      }
    });

    return { ok: true, data: config };
  },

  async getOverview(userId: string): Promise<ServiceResult<unknown>> {
    const now = new Date();
    const policy = await loadRetentionPolicy(userId);
    const storage = computeStorageBreakdown();

    const [clips, allVersionPaths, rawAssetsRows, cleanupLogs, totalSavedAgg] = await Promise.all([
      prisma.clip.findMany({
        where: { batch: { campaign: { userId } } },
        include: {
          batch: {
            select: {
              id: true,
              status: true,
              campaignId: true,
              campaign: {
                select: { id: true, title: true, status: true, deadlineAt: true }
              }
            }
          },
          versions: { orderBy: { versionNumber: 'desc' } }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.clipVersion.findMany({
        select: {
          outputVideoPath: true,
          outputSrtPath: true,
          outputAssPath: true,
          coverImagePath: true
        }
      }),
      prisma.mediaAsset.findMany({
        where: { campaign: { userId }, assetType: 'raw_video' },
        include: {
          campaign: {
            select: {
              id: true,
              title: true,
              status: true,
              deadlineAt: true,
              batches: {
                select: {
                  status: true,
                  clips: {
                    select: { id: true, publishStatus: true, mediaPrunedAt: true }
                  }
                }
              }
            }
          }
        },
        orderBy: { fileSizeBytes: 'desc' }
      }),
      prisma.storageCleanupLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 25
      }),
      prisma.storageCleanupLog.aggregate({
        where: { userId },
        _sum: { freedBytes: true }
      })
    ]);

    const referencedAbsPaths = new Set<string>();
    for (const vp of allVersionPaths) {
      for (const rel of [vp.outputVideoPath, vp.outputSrtPath, vp.outputAssPath, vp.coverImagePath]) {
        if (!rel) continue;
        try {
          referencedAbsPaths.add(path.resolve(resolveSafeStoragePath(rel)).toLowerCase());
        } catch {
          // Abaikan path tidak valid
        }
      }
    }

    const staleClips: Array<{
      id: string;
      campaignId: string;
      campaignTitle: string;
      batchId: string;
      angleTitle: string;
      sequenceIndex: number;
      severity: 'critical' | 'warning';
      ageDays: number;
      neverInspected: boolean;
      downloadCount: number;
      publishStatus: string;
      viralScoreTotal: number | null;
      hasCover: boolean;
      activeVersionId: string | null;
      sizeBytes: number;
      sizeMb: number;
      reason: string;
      createdAt: string;
    }> = [];

    const publishedWithMedia: Array<{
      id: string;
      campaignId: string;
      campaignTitle: string;
      angleTitle: string;
      publishedUrl: string | null;
      daysSinceUpdated: number;
      recommendedPrune: boolean;
      viralScoreTotal: number | null;
      sizeBytes: number;
      sizeMb: number;
      updatedAt: string;
    }> = [];

    const inactiveVersions: Array<{
      versionId: string;
      clipId: string;
      campaignTitle: string;
      angleTitle: string;
      versionNumber: number;
      sizeBytes: number;
      sizeMb: number;
      createdAt: string;
    }> = [];

    const failedClips: Array<{
      id: string;
      campaignTitle: string;
      angleTitle: string;
      errorMessage: string | null;
      sizeBytes: number;
      sizeMb: number;
      createdAt: string;
    }> = [];

    const protectedClips: Array<{
      id: string;
      campaignTitle: string;
      angleTitle: string;
      retentionProtected: boolean;
      snoozedUntil: string | null;
      publishStatus: string;
      sizeMb: number;
    }> = [];

    for (const clip of clips) {
      const activeVer = clip.versions.find((v) => v.id === clip.activeVersionId) ?? clip.versions[0] ?? null;

      // Hitung ukuran file aktif vs non-aktif
      let activeMediaBytes = 0;
      if (activeVer) {
        activeMediaBytes =
          safeFileSize(activeVer.outputVideoPath) +
          safeFileSize(activeVer.outputAssPath) +
          safeFileSize(activeVer.outputSrtPath);
      }

      for (const ver of clip.versions) {
        if (ver.id === activeVer?.id) continue;
        const verSize =
          safeFileSize(ver.outputVideoPath) +
          safeFileSize(ver.outputAssPath) +
          safeFileSize(ver.outputSrtPath) +
          safeFileSize(ver.coverImagePath);
        if (verSize > 0) {
          inactiveVersions.push({
            versionId: ver.id,
            clipId: clip.id,
            campaignTitle: clip.batch.campaign.title,
            angleTitle: clip.angleTitle,
            versionNumber: ver.versionNumber,
            sizeBytes: verSize,
            sizeMb: bytesToMb(verSize),
            createdAt: ver.createdAt.toISOString()
          });
        }
      }

      if (clip.status === 'failed') {
        const totalFailedBytes = clip.versions.reduce(
          (acc, v) =>
            acc +
            safeFileSize(v.outputVideoPath) +
            safeFileSize(v.outputAssPath) +
            safeFileSize(v.outputSrtPath) +
            safeFileSize(v.coverImagePath),
          0
        );
        failedClips.push({
          id: clip.id,
          campaignTitle: clip.batch.campaign.title,
          angleTitle: clip.angleTitle,
          errorMessage: clip.errorMessage,
          sizeBytes: totalFailedBytes,
          sizeMb: bytesToMb(totalFailedBytes),
          createdAt: clip.createdAt.toISOString()
        });
        continue;
      }

      const isSnoozed = Boolean(clip.snoozedUntil && clip.snoozedUntil.getTime() > now.getTime());
      if (clip.retentionProtected || isSnoozed) {
        protectedClips.push({
          id: clip.id,
          campaignTitle: clip.batch.campaign.title,
          angleTitle: clip.angleTitle,
          retentionProtected: clip.retentionProtected,
          snoozedUntil: clip.snoozedUntil ? clip.snoozedUntil.toISOString() : null,
          publishStatus: clip.publishStatus,
          sizeMb: bytesToMb(activeMediaBytes)
        });
      }

      const hasPrunableVideo = !clip.mediaPrunedAt && Boolean(activeVer?.outputVideoPath) && activeMediaBytes > 0;
      if (!hasPrunableVideo) continue;

      if (clip.publishStatus === 'published') {
        const daysSinceUpdated = Math.floor((now.getTime() - clip.updatedAt.getTime()) / MS_PER_DAY);
        publishedWithMedia.push({
          id: clip.id,
          campaignId: clip.batch.campaignId,
          campaignTitle: clip.batch.campaign.title,
          angleTitle: clip.angleTitle,
          publishedUrl: clip.publishedUrl,
          daysSinceUpdated,
          recommendedPrune: daysSinceUpdated >= policy.publishedPruneDays,
          viralScoreTotal: activeVer?.viralScoreTotal ?? null,
          sizeBytes: activeMediaBytes,
          sizeMb: bytesToMb(activeMediaBytes),
          updatedAt: clip.updatedAt.toISOString()
        });
        continue;
      }

      if (clip.publishStatus === 'unscheduled' && !clip.retentionProtected && !isSnoozed) {
        const lastActivityMs = Math.max(
          clip.createdAt.getTime(),
          clip.lastInspectedAt?.getTime() ?? 0,
          clip.lastDownloadedAt?.getTime() ?? 0
        );
        const ageDays = Math.floor((now.getTime() - lastActivityMs) / MS_PER_DAY);
        const neverInspected = !clip.lastInspectedAt;

        if (ageDays >= policy.warningDaysThreshold) {
          const severity = ageDays >= policy.staleDaysThreshold ? 'critical' : 'warning';
          const reason = neverInspected
            ? `Sudah ${ageDays} hari sejak di-generate, belum pernah diperiksa maupun dijadwalkan upload.`
            : clip.downloadCount === 0
              ? `Sudah ${ageDays} hari menganggur, belum pernah diunduh maupun dijadwalkan upload.`
              : `Sudah ${ageDays} hari sejak interaksi terakhir dan belum dijadwalkan upload di Kalender.`;

          staleClips.push({
            id: clip.id,
            campaignId: clip.batch.campaignId,
            campaignTitle: clip.batch.campaign.title,
            batchId: clip.batchId,
            angleTitle: clip.angleTitle,
            sequenceIndex: clip.sequenceIndex,
            severity,
            ageDays,
            neverInspected,
            downloadCount: clip.downloadCount,
            publishStatus: clip.publishStatus,
            viralScoreTotal: activeVer?.viralScoreTotal ?? null,
            hasCover: Boolean(activeVer?.coverImagePath),
            activeVersionId: activeVer?.id ?? null,
            sizeBytes: activeMediaBytes,
            sizeMb: bytesToMb(activeMediaBytes),
            reason,
            createdAt: clip.createdAt.toISOString()
          });
        }
      }
    }

    const rawAssets = rawAssetsRows.map((m) => {
      const diskBytes = safeFileSize(m.filePath) || m.fileSizeBytes;
      const allCampaignClips = m.campaign.batches.flatMap((b) => b.clips);
      const hasProcessingBatch = m.campaign.batches.some((b) => b.status === 'queued' || b.status === 'processing');
      const deadlinePassed = Boolean(m.campaign.deadlineAt && m.campaign.deadlineAt.getTime() < now.getTime());
      const allDoneOrPruned =
        allCampaignClips.length > 0 &&
        allCampaignClips.every((c) => c.publishStatus === 'published' || Boolean(c.mediaPrunedAt));
      const ageDays = Math.floor((now.getTime() - m.createdAt.getTime()) / MS_PER_DAY);
      const recommendedForCleanup =
        !hasProcessingBatch &&
        (m.campaign.status === 'completed' ||
          m.campaign.status === 'archived' ||
          deadlinePassed ||
          allDoneOrPruned ||
          ageDays >= policy.staleDaysThreshold);

      const cleanupReason = deadlinePassed
        ? 'Deadline campaign sudah lewat.'
        : allDoneOrPruned
          ? 'Seluruh klip campaign sudah tayang atau diarsipkan.'
          : m.campaign.status === 'completed' || m.campaign.status === 'archived'
            ? `Status campaign sudah ${m.campaign.status}.`
            : ageDays >= policy.staleDaysThreshold
              ? `Video mentah sudah tersimpan ${ageDays} hari di disk.`
              : 'Campaign masih aktif; hapus hanya jika Anda tidak perlu re-edit lagi.';

      return {
        id: m.id,
        campaignId: m.campaignId,
        campaignTitle: m.campaign.title,
        campaignStatus: m.campaign.status,
        originalFilename: m.originalFilename,
        durationSec: m.durationSec,
        ageDays,
        sizeBytes: diskBytes,
        sizeMb: bytesToMb(diskBytes),
        recommendedForCleanup,
        cleanupReason,
        createdAt: m.createdAt.toISOString()
      };
    });

    const activeJobsCount = await prisma.renderJob.count({
      where: { status: { in: ['queued', 'processing'] } }
    });
    const orphanEntries = activeJobsCount > 0 ? [] : findOrphanEntriesOnDisk(referencedAbsPaths);

    const staleCriticalCount = staleClips.filter((c) => c.severity === 'critical').length;
    const staleWarningCount = staleClips.filter((c) => c.severity === 'warning').length;
    const recommendedPublishedCount = publishedWithMedia.filter((p) => p.recommendedPrune).length;
    const recommendedRawCount = rawAssets.filter((r) => r.recommendedForCleanup).length;
    const diskWarningActive = storage.usedMb >= policy.diskWarningMb;

    const reclaimableBytes =
      staleClips.filter((c) => c.severity === 'critical').reduce((s, c) => s + c.sizeBytes, 0) +
      publishedWithMedia.reduce((s, c) => s + c.sizeBytes, 0) +
      inactiveVersions.reduce((s, v) => s + v.sizeBytes, 0) +
      failedClips.reduce((s, c) => s + c.sizeBytes, 0) +
      orphanEntries.reduce((s, o) => s + o.sizeBytes, 0);

    const alerts: Array<{
      id: string;
      level: 'critical' | 'warning' | 'info';
      title: string;
      message: string;
      targetTab: 'stale' | 'published' | 'versions' | 'raw' | 'orphans';
      potentialMb: number;
    }> = [];

    if (staleCriticalCount > 0) {
      const mb = bytesToMb(staleClips.filter((c) => c.severity === 'critical').reduce((s, c) => s + c.sizeBytes, 0));
      alerts.push({
        id: 'alert-stale-critical',
        level: 'critical',
        title: `${staleCriticalCount} klip melewati ${policy.staleDaysThreshold} hari tanpa dicek/dijadwalkan`,
        message: `Klip menganggur ini menyita ${mb} MB di disk. Tentukan sekarang: jadwalkan ke Kalender, lindungi (Pin), arsipkan ringan, atau hapus permanen.`,
        targetTab: 'stale',
        potentialMb: mb
      });
    }

    if (staleWarningCount > 0) {
      const mb = bytesToMb(staleClips.filter((c) => c.severity === 'warning').reduce((s, c) => s + c.sizeBytes, 0));
      alerts.push({
        id: 'alert-stale-warning',
        level: 'warning',
        title: `${staleWarningCount} klip mendekati batas retensi (${policy.warningDaysThreshold}-${policy.staleDaysThreshold - 1} hari)`,
        message: `Segera tinjau dan jadwalkan sebelum momentum tren lewat atau masuk daftar penghapusan.`,
        targetTab: 'stale',
        potentialMb: mb
      });
    }

    if (diskWarningActive) {
      alerts.push({
        id: 'alert-disk-quota',
        level: 'critical',
        title: `Kapasitas penyimpanan lokal (${storage.usedMb} MB) melewati batas peringatan ${policy.diskWarningMb} MB`,
        message: `Bersihkan versi revisi lama, arsipkan klip yang sudah tayang, atau hapus video mentah campaign lama untuk melegakan disk laptop.`,
        targetTab: 'raw',
        potentialMb: bytesToMb(reclaimableBytes)
      });
    }

    if (inactiveVersions.length > 0) {
      const mb = bytesToMb(inactiveVersions.reduce((s, v) => s + v.sizeBytes, 0));
      alerts.push({
        id: 'alert-inactive-versions',
        level: 'info',
        title: `${inactiveVersions.length} berkas versi revisi lama (non-aktif) dapat dibersihkan`,
        message: `Membersihkan versi v1/v2 lama menghemat ${mb} MB tanpa menyentuh versi final aktif Anda.`,
        targetTab: 'versions',
        potentialMb: mb
      });
    }

    if (publishedWithMedia.length > 0) {
      const mb = bytesToMb(publishedWithMedia.reduce((s, p) => s + p.sizeBytes, 0));
      alerts.push({
        id: 'alert-published-prune',
        level: recommendedPublishedCount > 0 ? 'warning' : 'info',
        title: `${publishedWithMedia.length} klip sudah tayang masih menyimpan berkas MP4 (${mb} MB)`,
        message: `Gunakan Arsip Ringan untuk menghapus MP4 saja sambil mempertahankan Skor Viral, Upload Playbook, Kalender, & Laporan Excel.`,
        targetTab: 'published',
        potentialMb: mb
      });
    }

    if (orphanEntries.length > 0 || failedClips.length > 0) {
      const mb = bytesToMb(
        orphanEntries.reduce((s, o) => s + o.sizeBytes, 0) +
          failedClips.reduce((s, f) => s + f.sizeBytes, 0)
      );
      alerts.push({
        id: 'alert-orphans',
        level: 'info',
        title: `${orphanEntries.length} berkas temp/orphan & ${failedClips.length} render gagal terdeteksi`,
        message: `Aman dibersihkan 1 klik untuk membebaskan ${mb} MB ruang sampah sistem.`,
        targetTab: 'orphans',
        potentialMb: mb
      });
    }

    return {
      ok: true,
      data: {
        policy,
        storage: {
          ...storage,
          diskWarningMb: policy.diskWarningMb,
          diskWarningActive
        },
        activeJobsCount,
        summary: {
          totalClips: clips.length,
          staleCriticalCount,
          staleWarningCount,
          publishedWithMediaCount: publishedWithMedia.length,
          inactiveVersionsCount: inactiveVersions.length,
          recommendedRawCount,
          failedClipsCount: failedClips.length,
          orphanFilesCount: orphanEntries.length,
          protectedClipsCount: protectedClips.length,
          reclaimableBytes,
          reclaimableMb: bytesToMb(reclaimableBytes),
          totalSavedEverMb: bytesToMb(totalSavedAgg._sum.freedBytes ?? 0),
          totalAlertCount: staleCriticalCount + staleWarningCount + (diskWarningActive ? 1 : 0)
        },
        alerts,
        staleClips,
        publishedWithMedia,
        inactiveVersions,
        rawAssets,
        orphanAndFailed: {
          orphanEntries,
          failedClips
        },
        protectedClips,
        cleanupLogs: cleanupLogs.map((l) => ({
          id: l.id,
          actionType: l.actionType,
          itemsAffected: l.itemsAffected,
          freedBytes: l.freedBytes,
          freedMb: bytesToMb(l.freedBytes),
          summary: l.summary,
          createdAt: l.createdAt.toISOString()
        }))
      }
    };
  },

  async getAlertSummary(userId: string): Promise<
    ServiceResult<{
      criticalCount: number;
      warningCount: number;
      totalAlerts: number;
      diskWarningActive: boolean;
      usedMb: number;
      diskWarningMb: number;
      reclaimableMb: number;
      staleDaysThreshold: number;
    }>
  > {
    const overviewRes = await this.getOverview(userId);
    if (!overviewRes.ok) return overviewRes;
    const data = overviewRes.data as {
      policy: RetentionPolicyConfig;
      storage: { usedMb: number; diskWarningMb: number; diskWarningActive: boolean };
      summary: { staleCriticalCount: number; staleWarningCount: number; reclaimableMb: number };
    };
    const criticalCount = data.summary.staleCriticalCount + (data.storage.diskWarningActive ? 1 : 0);
    const warningCount = data.summary.staleWarningCount;
    return {
      ok: true,
      data: {
        criticalCount,
        warningCount,
        totalAlerts: criticalCount + warningCount,
        diskWarningActive: data.storage.diskWarningActive,
        usedMb: data.storage.usedMb,
        diskWarningMb: data.storage.diskWarningMb,
        reclaimableMb: data.summary.reclaimableMb,
        staleDaysThreshold: data.policy.staleDaysThreshold
      }
    };
  },

  async updateClipRetention(
    userId: string,
    clipId: string,
    input: ClipRetentionActionInput
  ): Promise<ServiceResult<{ clipId: string; retentionProtected: boolean; snoozedUntil: string | null }>> {
    const clip = await prisma.clip.findFirst({
      where: { id: clipId, batch: { campaign: { userId } } }
    });
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    let data: { retentionProtected?: boolean; snoozedUntil?: Date | null } = {};
    if (input.action === 'pin') {
      data = { retentionProtected: true, snoozedUntil: null };
    } else if (input.action === 'unpin') {
      data = { retentionProtected: false, snoozedUntil: null };
    } else if (input.action === 'snooze') {
      const until = new Date(Date.now() + (input.snoozeDays ?? 30) * MS_PER_DAY);
      data = { retentionProtected: false, snoozedUntil: until };
    }

    const updated = await prisma.clip.update({
      where: { id: clip.id },
      data
    });

    return {
      ok: true,
      data: {
        clipId: updated.id,
        retentionProtected: updated.retentionProtected,
        snoozedUntil: updated.snoozedUntil ? updated.snoozedUntil.toISOString() : null
      }
    };
  },

  // Arsip Ringan: hapus file MP4/ASS/SRT besar di disk, pertahankan 100% metadata, Skor, Upload Playbook, Cover, Kalender & Excel!
  async pruneClipsMedia(
    userId: string,
    clipIds: string[]
  ): Promise<ServiceResult<{ prunedCount: number; freedBytes: number; freedMb: number }>> {
    const guard = await assertNoActiveRenderJobs();
    if (!guard.ok) return guard;

    const clips = await prisma.clip.findMany({
      where: {
        id: { in: clipIds },
        batch: { campaign: { userId } }
      },
      include: { versions: true }
    });

    if (clips.length === 0) {
      return {
        ok: false,
        code: 'NO_CLIPS_FOUND',
        message: 'Tidak ada klip valid yang ditemukan untuk diarsipkan.',
        statusCode: 404
      };
    }

    let freedBytes = 0;
    let prunedCount = 0;

    for (const clip of clips) {
      for (const ver of clip.versions) {
        freedBytes += safeRemoveRelPath(ver.outputVideoPath);
        freedBytes += safeRemoveRelPath(ver.outputAssPath);
        freedBytes += safeRemoveRelPath(ver.outputSrtPath);
        await prisma.clipVersion.update({
          where: { id: ver.id },
          data: {
            outputVideoPath: null,
            outputAssPath: null,
            outputSrtPath: null
          }
        });
      }
      await prisma.clip.update({
        where: { id: clip.id },
        data: { mediaPrunedAt: new Date() }
      });
      prunedCount += 1;
    }

    const freedMb = bytesToMb(freedBytes);
    await prisma.storageCleanupLog.create({
      data: {
        userId,
        actionType: 'prune_clip_media',
        itemsAffected: prunedCount,
        freedBytes,
        summary: `Arsip ringan ${prunedCount} klip (MP4 dihapus, Skor & Playbook tetap aman) membebaskan ${freedMb} MB.`,
        detailsJson: JSON.stringify({ clipIds: clips.map((c) => c.id) })
      }
    });

    return { ok: true, data: { prunedCount, freedBytes, freedMb } };
  },

  async deleteClipsPermanently(
    userId: string,
    clipIds: string[]
  ): Promise<ServiceResult<{ deletedCount: number; freedBytes: number; freedMb: number }>> {
    const guard = await assertNoActiveRenderJobs();
    if (!guard.ok) return guard;

    const clips = await prisma.clip.findMany({
      where: {
        id: { in: clipIds },
        batch: { campaign: { userId } }
      },
      include: { versions: true }
    });

    if (clips.length === 0) {
      return {
        ok: false,
        code: 'NO_CLIPS_FOUND',
        message: 'Tidak ada klip valid yang ditemukan untuk dihapus.',
        statusCode: 404
      };
    }

    let freedBytes = 0;
    for (const clip of clips) {
      for (const ver of clip.versions) {
        freedBytes += safeRemoveRelPath(ver.outputVideoPath);
        freedBytes += safeRemoveRelPath(ver.outputAssPath);
        freedBytes += safeRemoveRelPath(ver.outputSrtPath);
        freedBytes += safeRemoveRelPath(ver.coverImagePath);
      }
      // Hapus folder klip di storage/renders/<batchId>/<clipId> jika tersisa kosong
      safeRemoveRelPath(`renders/${clip.batchId}/${clip.id}`);
      await prisma.clip.delete({ where: { id: clip.id } });
    }

    const freedMb = bytesToMb(freedBytes);
    await prisma.storageCleanupLog.create({
      data: {
        userId,
        actionType: 'delete_clips_permanent',
        itemsAffected: clips.length,
        freedBytes,
        summary: `Menghapus permanen ${clips.length} klip beserta berkas fisiknya (${freedMb} MB dibebaskan).`,
        detailsJson: JSON.stringify({ clipIds: clips.map((c) => c.id) })
      }
    });

    return { ok: true, data: { deletedCount: clips.length, freedBytes, freedMb } };
  },

  async cleanupInactiveVersions(
    userId: string
  ): Promise<ServiceResult<{ cleanedVersionsCount: number; freedBytes: number; freedMb: number }>> {
    const guard = await assertNoActiveRenderJobs();
    if (!guard.ok) return guard;

    const clips = await prisma.clip.findMany({
      where: {
        batch: {
          campaign: { userId },
          status: { notIn: ['queued', 'processing'] }
        }
      },
      include: { versions: true }
    });

    let freedBytes = 0;
    let cleanedVersionsCount = 0;

    for (const clip of clips) {
      const activeId = clip.activeVersionId ?? clip.versions[0]?.id;
      for (const ver of clip.versions) {
        if (ver.id === activeId) continue;
        const removed =
          safeRemoveRelPath(ver.outputVideoPath) +
          safeRemoveRelPath(ver.outputAssPath) +
          safeRemoveRelPath(ver.outputSrtPath) +
          safeRemoveRelPath(ver.coverImagePath);

        if (removed > 0 || ver.outputVideoPath || ver.coverImagePath) {
          freedBytes += removed;
          cleanedVersionsCount += 1;
          await prisma.clipVersion.update({
            where: { id: ver.id },
            data: {
              outputVideoPath: null,
              outputAssPath: null,
              outputSrtPath: null,
              coverImagePath: null
            }
          });
        }
      }
    }

    const freedMb = bytesToMb(freedBytes);
    await prisma.storageCleanupLog.create({
      data: {
        userId,
        actionType: 'cleanup_inactive_versions',
        itemsAffected: cleanedVersionsCount,
        freedBytes,
        summary: `Membersihkan ${cleanedVersionsCount} berkas versi revisi lama (non-aktif) dan membebaskan ${freedMb} MB.`
      }
    });

    return { ok: true, data: { cleanedVersionsCount, freedBytes, freedMb } };
  },

  async cleanupOrphansAndFailed(
    userId: string
  ): Promise<ServiceResult<{ deletedItemsCount: number; freedBytes: number; freedMb: number }>> {
    const guard = await assertNoActiveRenderJobs();
    if (!guard.ok) return guard;

    let deletedItemsCount = 0;
    let freedBytes = 0;

    // 1. Hapus klip gagal render milik user
    const failedClips = await prisma.clip.findMany({
      where: { status: 'failed', batch: { campaign: { userId } } },
      include: { versions: true }
    });
    for (const clip of failedClips) {
      for (const ver of clip.versions) {
        freedBytes += safeRemoveRelPath(ver.outputVideoPath);
        freedBytes += safeRemoveRelPath(ver.outputAssPath);
        freedBytes += safeRemoveRelPath(ver.outputSrtPath);
        freedBytes += safeRemoveRelPath(ver.coverImagePath);
      }
      safeRemoveRelPath(`renders/${clip.batchId}/${clip.id}`);
      await prisma.clip.delete({ where: { id: clip.id } });
      deletedItemsCount += 1;
    }

    // 2. Pindai ulang seluruh path aktif di DB lalu bersihkan temp & orphan renders
    const allVersionPaths = await prisma.clipVersion.findMany({
      select: {
        outputVideoPath: true,
        outputSrtPath: true,
        outputAssPath: true,
        coverImagePath: true
      }
    });
    const referencedAbsPaths = new Set<string>();
    for (const vp of allVersionPaths) {
      for (const rel of [vp.outputVideoPath, vp.outputSrtPath, vp.outputAssPath, vp.coverImagePath]) {
        if (!rel) continue;
        try {
          referencedAbsPaths.add(path.resolve(resolveSafeStoragePath(rel)).toLowerCase());
        } catch {
          // Abaikan
        }
      }
    }

    const orphans = findOrphanEntriesOnDisk(referencedAbsPaths);
    for (const entry of orphans) {
      freedBytes += safeRemoveRelPath(entry.relPath);
      deletedItemsCount += 1;
    }

    const freedMb = bytesToMb(freedBytes);
    await prisma.storageCleanupLog.create({
      data: {
        userId,
        actionType: 'cleanup_orphans_and_failed',
        itemsAffected: deletedItemsCount,
        freedBytes,
        summary: `Membersihkan ${deletedItemsCount} berkas temp, orphan, & klip gagal render (${freedMb} MB dibebaskan).`
      }
    });

    return { ok: true, data: { deletedItemsCount, freedBytes, freedMb } };
  },

  async deleteRawAssets(
    userId: string,
    mediaAssetIds: string[]
  ): Promise<ServiceResult<{ deletedCount: number; freedBytes: number; freedMb: number }>> {
    const guard = await assertNoActiveRenderJobs();
    if (!guard.ok) return guard;

    const assets = await prisma.mediaAsset.findMany({
      where: {
        id: { in: mediaAssetIds },
        assetType: 'raw_video',
        campaign: { userId }
      }
    });

    if (assets.length === 0) {
      return {
        ok: false,
        code: 'NO_RAW_ASSETS_FOUND',
        message: 'Tidak ada berkas video mentah valid yang ditemukan untuk dihapus.',
        statusCode: 404
      };
    }

    let freedBytes = 0;
    for (const asset of assets) {
      freedBytes += safeRemoveRelPath(asset.filePath);
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
    }

    const freedMb = bytesToMb(freedBytes);
    await prisma.storageCleanupLog.create({
      data: {
        userId,
        actionType: 'delete_raw_assets',
        itemsAffected: assets.length,
        freedBytes,
        summary: `Menghapus ${assets.length} berkas video mentah campaign lama (${freedMb} MB dibebaskan).`,
        detailsJson: JSON.stringify({ filenames: assets.map((a) => a.originalFilename) })
      }
    });

    return { ok: true, data: { deletedCount: assets.length, freedBytes, freedMb } };
  }
};
