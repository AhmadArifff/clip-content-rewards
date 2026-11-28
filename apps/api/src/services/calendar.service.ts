import type {
  AutoScheduleInput,
  EdlDocument,
  PublishStatus,
  ServiceResult,
  TargetConfig,
  UpdateClipScheduleInput,
  UploadPlaybook,
  ViralScoreCritique
} from '@clip/shared';
import { prisma } from '../config/prisma.js';
import type { XlsxSheetDef } from './export/xlsx-report.builder.js';

export interface CalendarFilterInput {
  campaignId?: string;
  batchId?: string;
  platform?: string;
  publishStatus?: string;
  onlyApproved?: boolean;
  minScore?: number;
}

export interface CalendarClipRow {
  clipId: string;
  batchId: string;
  campaignId: string;
  campaignTitle: string;
  brandOwner: string | null;
  sequenceIndex: number;
  angleTitle: string;
  hookSummary: string | null;
  platform: string;
  countryCode: string;
  ageGroup: string;
  isApproved: boolean;
  publishStatus: PublishStatus;
  scheduledDate: string | null;
  scheduledSlot: string | null;
  publishedUrl: string | null;
  calendarNote: string | null;
  activeVersionId: string | null;
  versionNumber: number;
  actualDurationSec: number | null;
  viralScoreTotal: number | null;
  briefCompliance: string | null;
  framingMode: string | null;
  audioSummary: string;
  recommendedTimezone: string;
  recommendedSlots: string[];
  recommendedDays: string[];
  titleOption1: string;
  mandatoryHashtags: string;
  captionSnippet: string;
  pinnedComment1: string;
  dimensions: ViralScoreCritique['dimensions'] | null;
}

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toDateKeyUtc(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function formatDayNameId(dateKey: string | null): string {
  if (!dateKey) return '-';
  const dt = new Date(`${dateKey}T12:00:00.000Z`);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return days[dt.getUTCDay()] ?? '-';
}

function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const dt = new Date(`${dateKey}T12:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function todayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatAudioSummary(edl: EdlDocument | null): string {
  if (!edl) return '-';
  if (edl.audio.muteOriginal || edl.audio.originalVolume <= 0) return 'Mute 0% (Sound Platform)';
  if (edl.audio.originalVolume < 0.9) return `Ducking ${Math.round(edl.audio.originalVolume * 100)}%`;
  return `Original 100% (${edl.audio.normalizeLufs} LUFS)`;
}

function formatPlatformLabel(platform: string): string {
  if (platform === 'tiktok') return 'TikTok (9:16)';
  if (platform === 'youtube_shorts') return 'YouTube Shorts (9:16)';
  if (platform === 'youtube_long') return 'YouTube Standard (16:9)';
  return platform;
}

function formatPublishStatusId(status: string): string {
  if (status === 'published') return 'Sudah Tayang';
  if (status === 'scheduled') return 'Terjadwal';
  return 'Belum Dijadwalkan';
}

function slugifyName(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'laporan'
  );
}

export const calendarService = {
  async getCalendarOverview(
    userId: string,
    filters: CalendarFilterInput
  ): Promise<
    ServiceResult<{
      campaigns: Array<{ id: string; title: string; brandOwner: string | null }>;
      summary: {
        totalReadyClips: number;
        scheduledCount: number;
        publishedCount: number;
        unscheduledCount: number;
        approvedCount: number;
        briefPassCount: number;
        avgViralScore: number;
      };
      items: CalendarClipRow[];
    }>
  > {
    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, brandOwner: true }
    });

    const rawClips = await prisma.clip.findMany({
      where: {
        status: 'ready',
        batch: {
          ...(filters.batchId ? { id: filters.batchId } : {}),
          campaign: {
            userId,
            ...(filters.campaignId ? { id: filters.campaignId } : {})
          }
        }
      },
      include: {
        batch: {
          include: {
            campaign: {
              select: { id: true, title: true, brandOwner: true }
            }
          }
        },
        versions: {
          orderBy: { versionNumber: 'desc' }
        }
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }]
    });

    const mapped: CalendarClipRow[] = [];

    for (const clip of rawClips) {
      const targetConfig = safeJson<TargetConfig | null>(clip.batch.targetConfigJson, null);
      const platform = targetConfig?.platform ?? 'tiktok';
      const activeVer =
        clip.versions.find((v) => v.id === clip.activeVersionId) ?? clip.versions[0] ?? null;

      if (!activeVer) continue;

      const pubStatus = (
        ['unscheduled', 'scheduled', 'published'].includes(clip.publishStatus)
          ? clip.publishStatus
          : 'unscheduled'
      ) as PublishStatus;

      if (filters.platform && filters.platform !== 'all' && platform !== filters.platform) continue;
      if (filters.publishStatus && filters.publishStatus !== 'all' && pubStatus !== filters.publishStatus) continue;
      if (filters.onlyApproved && !clip.isApproved) continue;
      if (typeof filters.minScore === 'number' && (activeVer.viralScoreTotal ?? 0) < filters.minScore) continue;

      const edl = safeJson<EdlDocument | null>(activeVer.edlJson, null);
      const playbook = safeJson<UploadPlaybook | null>(activeVer.uploadPlaybookJson, null);
      const dims = safeJson<ViralScoreCritique['dimensions'] | null>(activeVer.scoreBreakdownJson, null);

      mapped.push({
        clipId: clip.id,
        batchId: clip.batchId,
        campaignId: clip.batch.campaign.id,
        campaignTitle: clip.batch.campaign.title,
        brandOwner: clip.batch.campaign.brandOwner,
        sequenceIndex: clip.sequenceIndex,
        angleTitle: clip.angleTitle,
        hookSummary: clip.hookSummary,
        platform,
        countryCode: targetConfig?.countryCode ?? 'ID',
        ageGroup: targetConfig?.ageGroup ?? '18-24',
        isApproved: clip.isApproved,
        publishStatus: pubStatus,
        scheduledDate: toDateKeyUtc(clip.scheduledAt),
        scheduledSlot: clip.scheduledSlot ?? playbook?.optimalSchedule.bestTimeSlots[0] ?? null,
        publishedUrl: clip.publishedUrl,
        calendarNote: clip.calendarNote,
        activeVersionId: activeVer.id,
        versionNumber: activeVer.versionNumber,
        actualDurationSec: activeVer.actualDurationSec,
        viralScoreTotal: activeVer.viralScoreTotal,
        briefCompliance: activeVer.briefCompliance,
        framingMode: edl?.framingMode ?? null,
        audioSummary: formatAudioSummary(edl),
        recommendedTimezone: playbook?.optimalSchedule.timezone ?? 'Asia/Jakarta (WIB)',
        recommendedSlots: playbook?.optimalSchedule.bestTimeSlots ?? ['19:00-21:00 WIB'],
        recommendedDays: playbook?.optimalSchedule.bestDays ?? ['Selasa', 'Kamis', 'Sabtu'],
        titleOption1: playbook?.titleOptions[0] ?? clip.angleTitle,
        mandatoryHashtags: (playbook?.hashtags.mandatory ?? []).join(' '),
        captionSnippet: (playbook?.captionDescription ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
        pinnedComment1: playbook?.engagementToolkit.pinnedComments[0] ?? '',
        dimensions: dims
      });
    }

    // Urutkan: klip terjadwal/tayang berdasarkan tanggal ASC, lalu belum dijadwalkan berdasarkan skor viral DESC
    mapped.sort((a, b) => {
      if (a.scheduledDate && b.scheduledDate) {
        if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate.localeCompare(b.scheduledDate);
        return (b.viralScoreTotal ?? 0) - (a.viralScoreTotal ?? 0);
      }
      if (a.scheduledDate && !b.scheduledDate) return -1;
      if (!a.scheduledDate && b.scheduledDate) return 1;
      return (b.viralScoreTotal ?? 0) - (a.viralScoreTotal ?? 0);
    });

    const scored = mapped.filter((m) => typeof m.viralScoreTotal === 'number');
    const avgViralScore =
      scored.length > 0
        ? Math.round((scored.reduce((acc, s) => acc + (s.viralScoreTotal ?? 0), 0) / scored.length) * 10) / 10
        : 0;

    return {
      ok: true,
      data: {
        campaigns,
        summary: {
          totalReadyClips: mapped.length,
          scheduledCount: mapped.filter((m) => m.publishStatus === 'scheduled').length,
          publishedCount: mapped.filter((m) => m.publishStatus === 'published').length,
          unscheduledCount: mapped.filter((m) => m.publishStatus === 'unscheduled').length,
          approvedCount: mapped.filter((m) => m.isApproved).length,
          briefPassCount: mapped.filter((m) => m.briefCompliance === 'pass').length,
          avgViralScore
        },
        items: mapped
      }
    };
  },

  async updateClipSchedule(
    userId: string,
    clipId: string,
    input: UpdateClipScheduleInput
  ): Promise<ServiceResult<unknown>> {
    const clip = await prisma.clip.findFirst({
      where: {
        id: clipId,
        batch: { campaign: { userId } }
      }
    });

    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const nextScheduledAt =
      input.scheduledDate === undefined
        ? clip.scheduledAt
        : input.scheduledDate === null
          ? null
          : new Date(`${input.scheduledDate}T12:00:00.000Z`);

    let nextStatus = input.publishStatus ?? clip.publishStatus;
    if (!input.publishStatus) {
      if (input.scheduledDate && clip.publishStatus === 'unscheduled') {
        nextStatus = 'scheduled';
      } else if (input.scheduledDate === null && clip.publishStatus === 'scheduled') {
        nextStatus = 'unscheduled';
      }
    }

    const updated = await prisma.clip.update({
      where: { id: clip.id },
      data: {
        scheduledAt: nextScheduledAt,
        scheduledSlot: input.scheduledSlot !== undefined ? input.scheduledSlot : clip.scheduledSlot,
        publishStatus: nextStatus,
        publishedUrl: input.publishedUrl !== undefined ? input.publishedUrl : clip.publishedUrl,
        calendarNote: input.calendarNote !== undefined ? input.calendarNote : clip.calendarNote
      }
    });

    return {
      ok: true,
      data: {
        clipId: updated.id,
        scheduledDate: toDateKeyUtc(updated.scheduledAt),
        scheduledSlot: updated.scheduledSlot,
        publishStatus: updated.publishStatus,
        publishedUrl: updated.publishedUrl,
        calendarNote: updated.calendarNote
      }
    };
  },

  async autoScheduleClips(
    userId: string,
    input: AutoScheduleInput
  ): Promise<ServiceResult<{ scheduledCount: number; startDate: string }>> {
    const allRes = await this.getCalendarOverview(userId, {
      campaignId: input.campaignId,
      batchId: input.batchId
    });
    if (!allRes.ok) return allRes;

    const allItems = allRes.data.items;
    const occupancy = new Map<string, number>();
    for (const item of allItems) {
      if (item.scheduledDate && item.publishStatus !== 'unscheduled') {
        const key = `${item.scheduledDate}|${item.platform}`;
        occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
      }
    }

    const targets = allItems
      .filter((item) => item.publishStatus === 'unscheduled' && (!input.onlyApproved || item.isApproved))
      .sort((a, b) => (b.viralScoreTotal ?? 0) - (a.viralScoreTotal ?? 0));

    const baseDate = input.startDate ?? todayDateKey();
    const maxPerDay = input.maxPerPlatformPerDay ?? 2;

    if (targets.length === 0) {
      return {
        ok: true,
        data: { scheduledCount: 0, startDate: baseDate }
      };
    }

    const updates: Array<{ id: string; scheduledAt: Date; scheduledSlot: string; publishStatus: string }> = [];

    for (const item of targets) {
      let dayOffset = 0;
      let chosenDate = baseDate;
      let slotIdx = 0;

      while (dayOffset < 120) {
        const candidateDate = addDaysToDateKey(baseDate, dayOffset);
        const key = `${candidateDate}|${item.platform}`;
        const used = occupancy.get(key) ?? 0;
        if (used < maxPerDay) {
          chosenDate = candidateDate;
          slotIdx = used;
          occupancy.set(key, used + 1);
          break;
        }
        dayOffset += 1;
      }

      const slots = item.recommendedSlots.length > 0 ? item.recommendedSlots : ['19:00-21:00 WIB', '12:00-13:30 WIB'];
      const chosenSlot = slots[slotIdx % slots.length] ?? '19:00-21:00 WIB';

      updates.push({
        id: item.clipId,
        scheduledAt: new Date(`${chosenDate}T12:00:00.000Z`),
        scheduledSlot: chosenSlot,
        publishStatus: 'scheduled'
      });
    }

    await prisma.$transaction(
      updates.map((u) =>
        prisma.clip.update({
          where: { id: u.id },
          data: {
            scheduledAt: u.scheduledAt,
            scheduledSlot: u.scheduledSlot,
            publishStatus: u.publishStatus
          }
        })
      )
    );

    return {
      ok: true,
      data: {
        scheduledCount: updates.length,
        startDate: baseDate
      }
    };
  },

  async prepareExcelExport(
    userId: string,
    filters: CalendarFilterInput
  ): Promise<ServiceResult<{ filename: string; sheets: XlsxSheetDef[] }>> {
    const overviewRes = await this.getCalendarOverview(userId, filters);
    if (!overviewRes.ok) return overviewRes;

    const { items, summary } = overviewRes.data;
    if (items.length === 0) {
      return {
        ok: false,
        code: 'NO_CLIPS_FOR_EXCEL',
        message: 'Tidak ada data variasi klip yang cocok dengan filter untuk diekspor ke Excel.',
        statusCode: 400
      };
    }

    const exportedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const campaignLabel = filters.campaignId
      ? items[0]?.campaignTitle ?? 'Campaign Terpilih'
      : 'Semua Campaign';
    const slug = slugifyName(filters.batchId ? `${campaignLabel}-batch` : campaignLabel);
    const dateStamp = todayDateKey().replace(/-/g, '');
    const filename = `laporan-kalender-${slug}-${dateStamp}.xlsx`;

    // Agregasi per Campaign + Platform untuk Sheet 1
    const groupMap = new Map<
      string,
      {
        campaignTitle: string;
        brandOwner: string;
        platform: string;
        totalClips: number;
        scheduled: number;
        published: number;
        approved: number;
        briefPass: number;
        scoreSum: number;
        scoreCount: number;
      }
    >();

    for (const item of items) {
      const k = `${item.campaignId}|${item.platform}`;
      const existing = groupMap.get(k) ?? {
        campaignTitle: item.campaignTitle,
        brandOwner: item.brandOwner || '-',
        platform: formatPlatformLabel(item.platform),
        totalClips: 0,
        scheduled: 0,
        published: 0,
        approved: 0,
        briefPass: 0,
        scoreSum: 0,
        scoreCount: 0
      };
      existing.totalClips += 1;
      if (item.publishStatus === 'scheduled') existing.scheduled += 1;
      if (item.publishStatus === 'published') existing.published += 1;
      if (item.isApproved) existing.approved += 1;
      if (item.briefCompliance === 'pass') existing.briefPass += 1;
      if (typeof item.viralScoreTotal === 'number') {
        existing.scoreSum += item.viralScoreTotal;
        existing.scoreCount += 1;
      }
      groupMap.set(k, existing);
    }

    const summaryRows = Array.from(groupMap.values()).map((g, idx) => ({
      no: idx + 1,
      campaignTitle: g.campaignTitle,
      brandOwner: g.brandOwner,
      platform: g.platform,
      totalClips: g.totalClips,
      scheduled: g.scheduled,
      published: g.published,
      approved: g.approved,
      briefPass: g.briefPass,
      avgScore: g.scoreCount > 0 ? Math.round((g.scoreSum / g.scoreCount) * 10) / 10 : 0
    }));

    const sheet1: XlsxSheetDef = {
      name: 'Ringkasan Campaign',
      title: 'LAPORAN RINGKASAN CAMPAIGN & KPI PRODUKSI KONTEN',
      subtitle: 'Clip Content Rewards Studio (100% Lokal) - Siap Presentasi Klien & Tim Uploader',
      theme: 'emerald',
      metadata: [
        ['Cakupan Laporan', campaignLabel],
        ['Waktu Ekspor', exportedAt],
        ['Total Klip Siap', `${summary.totalReadyClips} variasi (Final: ${summary.approvedCount}, Rata-rata Skor: ${summary.avgViralScore}/100)`]
      ],
      columns: [
        { key: 'no', label: 'No', width: 6, align: 'center', type: 'number' },
        { key: 'campaignTitle', label: 'Nama Campaign', width: 32, align: 'left', type: 'text' },
        { key: 'brandOwner', label: 'Pemilik Brand', width: 20, align: 'left', type: 'text' },
        { key: 'platform', label: 'Platform Target', width: 22, align: 'center', type: 'text' },
        { key: 'totalClips', label: 'Total Klip Siap', width: 15, align: 'right', type: 'number', summary: 'sum' },
        { key: 'scheduled', label: 'Terjadwal', width: 13, align: 'right', type: 'number', summary: 'sum' },
        { key: 'published', label: 'Sudah Tayang', width: 15, align: 'right', type: 'number', summary: 'sum' },
        { key: 'approved', label: 'Ditandai Final', width: 15, align: 'right', type: 'number', summary: 'sum' },
        { key: 'briefPass', label: 'Brief PASS', width: 13, align: 'right', type: 'number', summary: 'sum' },
        { key: 'avgScore', label: 'Rata-Rata Skor', width: 16, align: 'right', type: 'decimal', summary: 'avg' }
      ],
      rows: summaryRows
    };

    const sheet2: XlsxSheetDef = {
      name: 'Kalender Upload',
      title: 'KALENDER JADWAL UPLOAD KONTEN & PANDUAN PLAYBOOK',
      subtitle: 'Urutan tanggal tayang optimal beserta kondisi audio, judul utama, dan hashtag wajib',
      theme: 'blue',
      metadata: [
        ['Filter Status', filters.publishStatus && filters.publishStatus !== 'all' ? formatPublishStatusId(filters.publishStatus) : 'Semua Status'],
        ['Jumlah Item Jadwal', `${items.length} klip`]
      ],
      columns: [
        { key: 'no', label: 'No', width: 6, align: 'center', type: 'number' },
        { key: 'scheduledDate', label: 'Tanggal Tayang', width: 15, align: 'center', type: 'text' },
        { key: 'dayName', label: 'Hari', width: 11, align: 'center', type: 'text' },
        { key: 'scheduledSlot', label: 'Slot Jam Optimal', width: 18, align: 'center', type: 'text' },
        { key: 'timezone', label: 'Zona Waktu', width: 18, align: 'center', type: 'text' },
        { key: 'campaignTitle', label: 'Campaign', width: 26, align: 'left', type: 'text' },
        { key: 'platform', label: 'Platform', width: 18, align: 'center', type: 'text' },
        { key: 'angleTitle', label: 'Variasi / Angle', width: 26, align: 'left', type: 'text' },
        { key: 'publishStatus', label: 'Status Publikasi', width: 16, align: 'center', type: 'text' },
        { key: 'viralScore', label: 'Skor Viral', width: 12, align: 'right', type: 'number', summary: 'avg' },
        { key: 'audioSummary', label: 'Kondisi Audio', width: 22, align: 'left', type: 'text' },
        { key: 'titleOption1', label: 'Opsi Judul Upload #1', width: 32, align: 'left', type: 'text' },
        { key: 'mandatoryHashtags', label: 'Hashtag Wajib', width: 24, align: 'left', type: 'text' },
        { key: 'noteOrUrl', label: 'Tautan / Catatan', width: 28, align: 'left', type: 'text' }
      ],
      rows: items.map((item, idx) => ({
        no: idx + 1,
        scheduledDate: item.scheduledDate ?? 'Belum Dijadwalkan',
        dayName: formatDayNameId(item.scheduledDate),
        scheduledSlot: item.scheduledSlot ?? '-',
        timezone: item.recommendedTimezone,
        campaignTitle: item.campaignTitle,
        platform: formatPlatformLabel(item.platform),
        angleTitle: item.angleTitle,
        publishStatus: formatPublishStatusId(item.publishStatus),
        viralScore: item.viralScoreTotal ?? 0,
        audioSummary: item.audioSummary,
        titleOption1: item.titleOption1,
        mandatoryHashtags: item.mandatoryHashtags || '-',
        noteOrUrl: [item.publishedUrl, item.calendarNote].filter(Boolean).join(' | ') || '-'
      }))
    };

    const sheet3: XlsxSheetDef = {
      name: 'Perbandingan Variasi',
      title: 'MATRIKS PERBANDINGAN VARIASI KLIP & 6 DIMENSI SKOR VIRAL',
      subtitle: 'Audit lengkap skor per dimensi, framing 9:16, kepatuhan brief, dan teks siap tempel',
      theme: 'amber',
      metadata: [
        ['Waktu Ekspor', exportedAt],
        ['Total Variasi', `${items.length} klip`]
      ],
      columns: [
        { key: 'no', label: 'No', width: 6, align: 'center', type: 'number' },
        { key: 'campaignTitle', label: 'Campaign', width: 24, align: 'left', type: 'text' },
        { key: 'angleTitle', label: 'Variasi / Angle', width: 24, align: 'left', type: 'text' },
        { key: 'version', label: 'Versi', width: 9, align: 'center', type: 'text' },
        { key: 'durationSec', label: 'Durasi (dtk)', width: 12, align: 'right', type: 'decimal', summary: 'avg' },
        { key: 'framingMode', label: 'Framing', width: 16, align: 'center', type: 'text' },
        { key: 'finalFlag', label: 'Final', width: 10, align: 'center', type: 'text' },
        { key: 'briefCompliance', label: 'Brief', width: 10, align: 'center', type: 'text' },
        { key: 'totalScore', label: 'Skor Total', width: 12, align: 'right', type: 'number', summary: 'avg' },
        { key: 'hookScore', label: 'Hook', width: 10, align: 'right', type: 'number', summary: 'avg' },
        { key: 'retentionScore', label: 'Retensi', width: 10, align: 'right', type: 'number', summary: 'avg' },
        { key: 'briefScore', label: 'Brief', width: 10, align: 'right', type: 'number', summary: 'avg' },
        { key: 'audienceScore', label: 'Audiens', width: 10, align: 'right', type: 'number', summary: 'avg' },
        { key: 'engageScore', label: 'Engage', width: 10, align: 'right', type: 'number', summary: 'avg' },
        { key: 'audioScore', label: 'Audio/SZ', width: 10, align: 'right', type: 'number', summary: 'avg' },
        { key: 'pinnedComment1', label: 'Pinned Comment #1', width: 28, align: 'left', type: 'text' },
        { key: 'captionSnippet', label: 'Ringkasan Caption', width: 36, align: 'left', type: 'text' }
      ],
      rows: items.map((item, idx) => ({
        no: idx + 1,
        campaignTitle: item.campaignTitle,
        angleTitle: item.angleTitle,
        version: `v${item.versionNumber}`,
        durationSec: item.actualDurationSec ?? 0,
        framingMode: item.framingMode ?? '-',
        finalFlag: item.isApproved ? 'FINAL' : 'Draft',
        briefCompliance: (item.briefCompliance ?? 'warn').toUpperCase(),
        totalScore: item.viralScoreTotal ?? 0,
        hookScore: item.dimensions?.hookStrength.score ?? 0,
        retentionScore: item.dimensions?.retentionPacing.score ?? 0,
        briefScore: item.dimensions?.briefCompliance.score ?? 0,
        audienceScore: item.dimensions?.audienceFit.score ?? 0,
        engageScore: item.dimensions?.engagementTrigger.score ?? 0,
        audioScore: item.dimensions?.audioSafeZone.score ?? 0,
        pinnedComment1: item.pinnedComment1 || '-',
        captionSnippet: item.captionSnippet || '-'
      }))
    };

    return {
      ok: true,
      data: {
        filename,
        sheets: [sheet1, sheet2, sheet3]
      }
    };
  }
};
