<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { RetentionPolicyConfig } from '@clip/shared';
import {
  HardDrive,
  AlertTriangle,
  Archive,
  Trash2,
  Pin,
  PinOff,
  Clock,
  CalendarDays,
  Eye,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Film,
  Layers,
  History
} from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import { apiRequest } from '~/composables/useApi';
import { useThemeCopy } from '~/composables/useThemeCopy';

type TabKey = 'stale' | 'published' | 'versions' | 'raw' | 'orphans' | 'logs';

interface StaleClipItem {
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
}

interface PublishedMediaItem {
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
}

interface InactiveVersionItem {
  versionId: string;
  clipId: string;
  campaignTitle: string;
  angleTitle: string;
  versionNumber: number;
  sizeBytes: number;
  sizeMb: number;
  createdAt: string;
}

interface RawAssetItem {
  id: string;
  campaignId: string;
  campaignTitle: string;
  campaignStatus: string;
  originalFilename: string;
  durationSec: number | null;
  ageDays: number;
  sizeBytes: number;
  sizeMb: number;
  recommendedForCleanup: boolean;
  cleanupReason: string;
  createdAt: string;
}

interface MaintenanceOverview {
  policy: RetentionPolicyConfig;
  storage: {
    rootPath: string;
    usedBytes: number;
    usedMb: number;
    diskWarningMb: number;
    diskWarningActive: boolean;
    breakdown: {
      uploadsMb: number;
      rendersMb: number;
      tempMb: number;
      databaseMb: number;
    };
  };
  activeJobsCount: number;
  summary: {
    totalClips: number;
    staleCriticalCount: number;
    staleWarningCount: number;
    publishedWithMediaCount: number;
    inactiveVersionsCount: number;
    recommendedRawCount: number;
    failedClipsCount: number;
    orphanFilesCount: number;
    protectedClipsCount: number;
    reclaimableBytes: number;
    reclaimableMb: number;
    totalSavedEverMb: number;
    totalAlertCount: number;
  };
  alerts: Array<{
    id: string;
    level: 'critical' | 'warning' | 'info';
    title: string;
    message: string;
    targetTab: TabKey;
    potentialMb: number;
  }>;
  staleClips: StaleClipItem[];
  publishedWithMedia: PublishedMediaItem[];
  inactiveVersions: InactiveVersionItem[];
  rawAssets: RawAssetItem[];
  orphanAndFailed: {
    orphanEntries: Array<{ relPath: string; kind: 'temp_file' | 'orphan_render'; sizeBytes: number; sizeMb: number }>;
    failedClips: Array<{ id: string; campaignTitle: string; angleTitle: string; errorMessage: string | null; sizeBytes: number; sizeMb: number; createdAt: string }>;
  };
  protectedClips: Array<{
    id: string;
    campaignTitle: string;
    angleTitle: string;
    retentionProtected: boolean;
    snoozedUntil: string | null;
    publishStatus: string;
    sizeMb: number;
  }>;
  cleanupLogs: Array<{
    id: string;
    actionType: string;
    itemsAffected: number;
    freedBytes: number;
    freedMb: number;
    summary: string;
    createdAt: string;
  }>;
}

const copy = useThemeCopy();

const overview = ref<MaintenanceOverview | null>(null);
const loading = ref(false);
const busy = ref(false);
const activeTab = ref<TabKey>('stale');
const showPolicyPanel = ref(false);
const notice = ref<{ type: 'ok' | 'err'; text: string } | null>(null);

const policyForm = ref<RetentionPolicyConfig>({
  staleDaysThreshold: 30,
  warningDaysThreshold: 14,
  publishedPruneDays: 14,
  diskWarningMb: 5120
});

const selectedStaleIds = ref<string[]>([]);
const selectedPublishedIds = ref<string[]>([]);
const selectedRawIds = ref<string[]>([]);

interface PendingConfirm {
  title: string;
  description: string;
  estimatedMb: number;
  isPermanent: boolean;
  onConfirm: () => Promise<void>;
}
const pendingConfirm = ref<PendingConfirm | null>(null);

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

const folderPercentages = computed(() => {
  const b = overview.value?.storage.breakdown;
  if (!b) return { uploads: 0, renders: 0, temp: 0, db: 0 };
  const total = Math.max(0.01, b.uploadsMb + b.rendersMb + b.tempMb + b.databaseMb);
  return {
    uploads: Math.round((b.uploadsMb / total) * 100),
    renders: Math.round((b.rendersMb / total) * 100),
    temp: Math.round((b.tempMb / total) * 100),
    db: Math.round((b.databaseMb / total) * 100)
  };
});

async function fetchOverview() {
  loading.value = true;
  try {
    const res = await apiRequest<MaintenanceOverview>('/api/maintenance/overview');
    overview.value = res.data;
    if (res.data?.policy) {
      policyForm.value = { ...res.data.policy };
    }
    selectedStaleIds.value = [];
    selectedPublishedIds.value = [];
    selectedRawIds.value = [];
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal memuat data pemeliharaan disk.' };
  } finally {
    loading.value = false;
  }
}

async function handleSavePolicy() {
  busy.value = true;
  notice.value = null;
  try {
    await apiRequest('/api/maintenance/policy', {
      method: 'PATCH',
      body: JSON.stringify(policyForm.value)
    });
    notice.value = { type: 'ok', text: `Aturan retensi diperbarui (ambang kritis ${policyForm.value.staleDaysThreshold} hari, batas peringatan disk ${formatSize(policyForm.value.diskWarningMb)}).` };
    showPolicyPanel.value = false;
    await fetchOverview();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal menyimpan kebijakan retensi.' };
  } finally {
    busy.value = false;
  }
}

async function handleClipRetention(clipId: string, action: 'pin' | 'unpin' | 'snooze', snoozeDays = 30) {
  busy.value = true;
  notice.value = null;
  try {
    await apiRequest(`/api/maintenance/clips/${clipId}/retention`, {
      method: 'PATCH',
      body: JSON.stringify({ action, snoozeDays })
    });
    notice.value = {
      type: 'ok',
      text:
        action === 'pin'
          ? 'Klip dilindungi permanen dari peringatan retensi.'
          : action === 'unpin'
            ? 'Proteksi klip dilepas.'
            : `Peringatan klip ditunda selama ${snoozeDays} hari.`
    };
    await fetchOverview();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal memperbarui status retensi klip.' };
  } finally {
    busy.value = false;
  }
}

function requestConfirm(cfg: PendingConfirm) {
  pendingConfirm.value = cfg;
}

async function executeConfirmedAction() {
  if (!pendingConfirm.value) return;
  const actionFn = pendingConfirm.value.onConfirm;
  pendingConfirm.value = null;
  busy.value = true;
  notice.value = null;
  try {
    await actionFn();
    await fetchOverview();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal mengeksekusi aksi pembersihan.' };
  } finally {
    busy.value = false;
  }
}

function confirmPruneClips(clipIds: string[], estimatedMb: number) {
  if (clipIds.length === 0) return;
  requestConfirm({
    title: `Arsip Ringan ${clipIds.length} Klip (Hapus MP4 Saja)`,
    description:
      'Hanya berkas video MP4 & subtitle fisik yang dihapus dari disk lokal. Skor Viral, Upload Playbook, Cover, Kalender Upload, dan Laporan Excel tetap tersimpan 100% utuh!',
    estimatedMb,
    isPermanent: false,
    onConfirm: async () => {
      const res = await apiRequest<{ prunedCount: number; freedMb: number }>('/api/maintenance/actions/prune-media', {
        method: 'POST',
        body: JSON.stringify({ clipIds })
      });
      notice.value = {
        type: 'ok',
        text: `Arsip ringan ${res.data?.prunedCount ?? clipIds.length} klip selesai. Ruang disk bebas: ${formatSize(res.data?.freedMb ?? 0)}.`
      };
    }
  });
}

function confirmDeleteClips(clipIds: string[], estimatedMb: number) {
  if (clipIds.length === 0) return;
  requestConfirm({
    title: `Hapus Permanen ${clipIds.length} Klip`,
    description:
      'Tindakan ini menghapus berkas video MP4, cover, serta catatan klip dari database secara permanen dan tidak bisa dibatalkan.',
    estimatedMb,
    isPermanent: true,
    onConfirm: async () => {
      const res = await apiRequest<{ deletedCount: number; freedMb: number }>('/api/maintenance/actions/delete-clips', {
        method: 'POST',
        body: JSON.stringify({ clipIds })
      });
      notice.value = {
        type: 'ok',
        text: `${res.data?.deletedCount ?? clipIds.length} klip dihapus permanen (${formatSize(res.data?.freedMb ?? 0)} dibebaskan).`
      };
    }
  });
}

function confirmCleanupInactiveVersions() {
  const versions = overview.value?.inactiveVersions ?? [];
  const totalMb = versions.reduce((s, v) => s + v.sizeMb, 0);
  requestConfirm({
    title: `Bersihkan ${versions.length} Berkas Versi Revisi Lama`,
    description:
      'Menghapus berkas fisik versi non-aktif (v1/v2 percobaan lama). Versi aktif/final setiap klip tetap aman 100% tidak tersentuh.',
    estimatedMb: totalMb,
    isPermanent: false,
    onConfirm: async () => {
      const res = await apiRequest<{ cleanedVersionsCount: number; freedMb: number }>(
        '/api/maintenance/actions/cleanup-inactive-versions',
        { method: 'POST' }
      );
      notice.value = {
        type: 'ok',
        text: `${res.data?.cleanedVersionsCount ?? 0} versi lama dibersihkan (${formatSize(res.data?.freedMb ?? 0)} dibebaskan).`
      };
    }
  });
}

function confirmCleanupOrphans() {
  const orphans = overview.value?.orphanAndFailed.orphanEntries ?? [];
  const failed = overview.value?.orphanAndFailed.failedClips ?? [];
  const totalMb =
    orphans.reduce((s, o) => s + o.sizeMb, 0) +
    failed.reduce((s, f) => s + f.sizeMb, 0);
  requestConfirm({
    title: `Bersihkan ${orphans.length} File Temp/Orphan & ${failed.length} Render Gagal`,
    description:
      'Menghapus seluruh berkas sementara, berkas yatim di folder renders yang tidak tercatat di database, serta antrean klip yang gagal render.',
    estimatedMb: totalMb,
    isPermanent: true,
    onConfirm: async () => {
      const res = await apiRequest<{ deletedItemsCount: number; freedMb: number }>(
        '/api/maintenance/actions/cleanup-orphans',
        { method: 'POST' }
      );
      notice.value = {
        type: 'ok',
        text: `${res.data?.deletedItemsCount ?? 0} berkas sampah & render gagal dibersihkan (${formatSize(res.data?.freedMb ?? 0)} dibebaskan).`
      };
    }
  });
}

function confirmDeleteRawAssets(ids: string[], estimatedMb: number) {
  if (ids.length === 0) return;
  requestConfirm({
    title: `Hapus ${ids.length} Berkas Video Mentah (Raw Footage)`,
    description:
      'PERINGATAN: Menghapus video mentah akan menonaktifkan fitur Edit Ulang Prompt & Visual Timeline untuk klip pada campaign terkait. Klip MP4 yang sudah dirender tetap utuh.',
    estimatedMb,
    isPermanent: true,
    onConfirm: async () => {
      const res = await apiRequest<{ deletedCount: number; freedMb: number }>(
        '/api/maintenance/actions/delete-raw-assets',
        { method: 'POST', body: JSON.stringify({ mediaAssetIds: ids }) }
      );
      notice.value = {
        type: 'ok',
        text: `${res.data?.deletedCount ?? ids.length} video mentah dihapus (${formatSize(res.data?.freedMb ?? 0)} dibebaskan).`
      };
    }
  });
}

function toggleSelection(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function selectAllStale() {
  const all = (overview.value?.staleClips ?? []).map((c) => c.id);
  selectedStaleIds.value = selectedStaleIds.value.length === all.length ? [] : all;
}

function selectAllPublished() {
  const all = (overview.value?.publishedWithMedia ?? []).map((c) => c.id);
  selectedPublishedIds.value = selectedPublishedIds.value.length === all.length ? [] : all;
}

onMounted(fetchOverview);
</script>

<template>
  <StudioShell>
    <div class="space-y-6 min-w-0">
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2">
            <HardDrive class="w-5 h-5 shrink-0" style="color: var(--accent-bg);" />
            <h1 class="studio-heading text-2xl md:text-3xl font-bold">{{ copy.maintenanceTitle }}</h1>
          </div>
          <p class="studio-muted text-sm">{{ copy.maintenanceSubtitle }}</p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="studio-btn-secondary text-xs" @click="showPolicyPanel = !showPolicyPanel">
            <Sliders class="w-4 h-4" />
            <span>Aturan Retensi ({{ overview?.policy.staleDaysThreshold ?? 30 }} Hari)</span>
          </button>
          <button type="button" class="studio-btn-secondary text-xs" :disabled="loading" @click="fetchOverview">
            <RefreshCw class="w-4 h-4" :class="loading ? 'animate-spin' : ''" />
            <span>Pindai Ulang</span>
          </button>
        </div>
      </div>

      <!-- Notice -->
      <div
        v-if="notice"
        class="p-3.5 rounded text-sm font-medium"
        :class="notice.type === 'ok' ? 'studio-badge-ok' : 'studio-badge-err'"
        role="status"
      >
        {{ notice.text }}
      </div>

      <!-- Panel Pengaturan Aturan Retensi Dinamis (Zero Hardcode) -->
      <form
        v-if="showPolicyPanel"
        class="studio-card p-5 space-y-4"
        @submit.prevent="handleSavePolicy"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="studio-heading text-base font-bold">Konfigurasi Kebijakan Retensi &amp; Kuota Peringatan</h2>
            <p class="text-xs studio-muted">
              Sistem menerapkan kebijakan Zero Silent Auto-Delete: sistem memberi peringatan sesuai aturan di bawah, dan hanya menghapus setelah Anda menyetujui.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div class="space-y-1">
            <label for="pol-stale" class="block text-xs font-semibold">Ambang Kritis Menganggur (Hari)</label>
            <input id="pol-stale" v-model.number="policyForm.staleDaysThreshold" type="number" min="3" max="365" class="studio-input text-xs font-mono" />
            <p class="text-[11px] studio-muted">Default: 30 hari belum dicek/dijadwalkan</p>
          </div>
          <div class="space-y-1">
            <label for="pol-warn" class="block text-xs font-semibold">Peringatan Dini (Hari)</label>
            <input id="pol-warn" v-model.number="policyForm.warningDaysThreshold" type="number" min="1" max="180" class="studio-input text-xs font-mono" />
            <p class="text-[11px] studio-muted">Default: 14 hari sebelum kritis</p>
          </div>
          <div class="space-y-1">
            <label for="pol-pub" class="block text-xs font-semibold">Saran Arsip Pasca-Tayang (Hari)</label>
            <input id="pol-pub" v-model.number="policyForm.publishedPruneDays" type="number" min="1" max="365" class="studio-input text-xs font-mono" />
            <p class="text-[11px] studio-muted">Default: 14 hari setelah status Tayang</p>
          </div>
          <div class="space-y-1">
            <label for="pol-disk" class="block text-xs font-semibold">Batas Peringatan Disk (MB)</label>
            <input id="pol-disk" v-model.number="policyForm.diskWarningMb" type="number" min="256" max="102400" class="studio-input text-xs font-mono" />
            <p class="text-[11px] studio-muted">Default: 5120 MB (5 GB)</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2">
          <button type="button" class="studio-btn-secondary text-xs" @click="showPolicyPanel = false">Batal</button>
          <button type="submit" class="studio-btn-primary text-xs" :disabled="busy">Simpan Kebijakan Retensi</button>
        </div>
      </form>

      <div v-if="loading && !overview" class="studio-card p-8 text-center text-sm studio-muted">
        Memindai penyimpanan lokal, riwayat interaksi klip, dan status retensi...
      </div>

      <template v-else-if="overview">
        <!-- 4 Kartu KPI Storage & Retensi -->
        <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div class="studio-card p-4 space-y-1">
            <p class="text-xs studio-muted font-semibold">Total Kapasitas Terpakai</p>
            <p class="font-mono text-2xl font-bold">{{ formatSize(overview.storage.usedMb) }}</p>
            <p class="text-[11px]" :class="overview.storage.diskWarningActive ? 'font-bold text-rose-500' : 'studio-muted'">
              Batas peringatan: {{ formatSize(overview.storage.diskWarningMb) }}
            </p>
          </div>

          <div class="studio-card p-4 space-y-1">
            <p class="text-xs studio-muted font-semibold">Perlu Keputusan (&gt;= {{ overview.policy.staleDaysThreshold }} Hari)</p>
            <p class="font-mono text-2xl font-bold">{{ overview.summary.staleCriticalCount }} klip</p>
            <p class="text-[11px] studio-muted">
              + {{ overview.summary.staleWarningCount }} peringatan dini ({{ overview.policy.warningDaysThreshold }}-{{ overview.policy.staleDaysThreshold - 1 }}h)
            </p>
          </div>

          <div class="studio-card p-4 space-y-1">
            <p class="text-xs studio-muted font-semibold">Potensi Ruang Siap Dihemat</p>
            <p class="font-mono text-2xl font-bold" style="color: var(--accent-bg);">{{ formatSize(overview.summary.reclaimableMb) }}</p>
            <p class="text-[11px] studio-muted">
              {{ overview.summary.inactiveVersionsCount }} versi lama, {{ overview.summary.publishedWithMediaCount }} tayang, {{ overview.summary.orphanFilesCount }} orphan
            </p>
          </div>

          <div class="studio-card p-4 space-y-1">
            <p class="text-xs studio-muted font-semibold">Total Berhasil Dihemat</p>
            <p class="font-mono text-2xl font-bold">{{ formatSize(overview.summary.totalSavedEverMb) }}</p>
            <p class="text-[11px] studio-muted">{{ overview.cleanupLogs.length }} riwayat pembersihan tercatat</p>
          </div>
        </section>

        <!-- Bar Distribusi Folder Storage Lokal -->
        <section class="studio-card p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span class="font-bold">Distribusi Penyimpanan Lokal (`storage/`)</span>
            <span class="font-mono studio-muted">
              Uploads {{ formatSize(overview.storage.breakdown.uploadsMb) }} |
              Renders {{ formatSize(overview.storage.breakdown.rendersMb) }} |
              Temp {{ formatSize(overview.storage.breakdown.tempMb) }} |
              DB {{ formatSize(overview.storage.breakdown.databaseMb) }}
            </span>
          </div>
          <div class="h-3 w-full rounded overflow-hidden flex" style="background: var(--bg-elevated);">
            <div :style="{ width: `${folderPercentages.uploads}%`, backgroundColor: '#2563eb' }" title="Raw Video Uploads" />
            <div :style="{ width: `${folderPercentages.renders}%`, backgroundColor: '#10b981' }" title="Hasil Render MP4" />
            <div :style="{ width: `${folderPercentages.temp}%`, backgroundColor: '#f59e0b' }" title="Temp Cache" />
            <div :style="{ width: `${folderPercentages.db}%`, backgroundColor: '#64748b' }" title="Database SQLite" />
          </div>
          <div class="flex flex-wrap gap-4 text-[11px] studio-muted">
            <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-blue-600" /> Raw Uploads ({{ folderPercentages.uploads }}%)</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Renders MP4 ({{ folderPercentages.renders }}%)</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Temp ({{ folderPercentages.temp }}%)</span>
            <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-slate-500" /> SQLite DB ({{ folderPercentages.db }}%)</span>
          </div>
        </section>

        <!-- Peringatan & Insight Proaktif -->
        <section v-if="overview.alerts.length > 0" class="space-y-2.5">
          <div
            v-for="alert in overview.alerts"
            :key="alert.id"
            class="p-3.5 rounded flex flex-wrap items-center justify-between gap-3 text-xs"
            :class="
              alert.level === 'critical'
                ? 'studio-badge-err'
                : alert.level === 'warning'
                  ? 'studio-badge-warn'
                  : 'studio-badge-ok'
            "
          >
            <div class="flex items-start gap-2.5 min-w-0">
              <AlertTriangle v-if="alert.level !== 'info'" class="w-4 h-4 shrink-0 mt-0.5" />
              <Sparkles v-else class="w-4 h-4 shrink-0 mt-0.5" />
              <div class="space-y-0.5">
                <p class="font-bold">{{ alert.title }}</p>
                <p class="opacity-90">{{ alert.message }}</p>
              </div>
            </div>
            <button type="button" class="studio-btn-secondary text-xs shrink-0" @click="activeTab = alert.targetTab">
              Tinjau Sekarang
            </button>
          </div>
        </section>

        <!-- Navigasi 6 Tab Maintenance -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Kategori Pemeliharaan Storage">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'stale'"
            class="px-3 py-2 rounded text-xs font-bold whitespace-nowrap min-h-[40px] inline-flex items-center gap-1.5"
            :style="activeTab === 'stale' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
            @click="activeTab = 'stale'"
          >
            <Clock class="w-3.5 h-3.5" />
            <span>Perlu Keputusan ({{ overview.staleClips.length }})</span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'published'"
            class="px-3 py-2 rounded text-xs font-bold whitespace-nowrap min-h-[40px] inline-flex items-center gap-1.5"
            :style="activeTab === 'published' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
            @click="activeTab = 'published'"
          >
            <Archive class="w-3.5 h-3.5" />
            <span>Sudah Tayang ({{ overview.publishedWithMedia.length }})</span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'versions'"
            class="px-3 py-2 rounded text-xs font-bold whitespace-nowrap min-h-[40px] inline-flex items-center gap-1.5"
            :style="activeTab === 'versions' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
            @click="activeTab = 'versions'"
          >
            <Layers class="w-3.5 h-3.5" />
            <span>Versi Lama ({{ overview.inactiveVersions.length }})</span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'raw'"
            class="px-3 py-2 rounded text-xs font-bold whitespace-nowrap min-h-[40px] inline-flex items-center gap-1.5"
            :style="activeTab === 'raw' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
            @click="activeTab = 'raw'"
          >
            <Film class="w-3.5 h-3.5" />
            <span>Raw Video ({{ overview.rawAssets.length }})</span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'orphans'"
            class="px-3 py-2 rounded text-xs font-bold whitespace-nowrap min-h-[40px] inline-flex items-center gap-1.5"
            :style="activeTab === 'orphans' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
            @click="activeTab = 'orphans'"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>Sampah &amp; Orphan ({{ overview.orphanAndFailed.orphanEntries.length + overview.orphanAndFailed.failedClips.length }})</span>
          </button>

          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'logs'"
            class="px-3 py-2 rounded text-xs font-bold whitespace-nowrap min-h-[40px] inline-flex items-center gap-1.5"
            :style="activeTab === 'logs' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
            @click="activeTab = 'logs'"
          >
            <History class="w-3.5 h-3.5" />
            <span>Dilindungi &amp; Log ({{ overview.protectedClips.length }})</span>
          </button>
        </div>

        <!-- ===============================================================
             TAB 1: KLIP MENGANGGUR / PERLU KEPUTUSAN (>= 14-30 HARI)
             =============================================================== -->
        <section v-if="activeTab === 'stale'" class="studio-card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="studio-heading text-base font-bold">
                Klip Menganggur Belum Dicek / Belum Dijadwalkan (&gt;= {{ overview.policy.warningDaysThreshold }} Hari)
              </h2>
              <p class="text-xs studio-muted">
                Pilih tindakan per klip atau secara massal: jadwalkan upload, lindungi (Pin), tunda 30 hari, arsipkan ringan (hapus MP4 saja), atau hapus permanen.
              </p>
            </div>
            <div v-if="overview.staleClips.length > 0" class="flex flex-wrap items-center gap-2">
              <button type="button" class="studio-btn-secondary text-xs" @click="selectAllStale">
                {{ selectedStaleIds.length === overview.staleClips.length ? 'Batal Pilih Semua' : 'Pilih Semua' }}
              </button>
              <button
                type="button"
                class="studio-btn-secondary text-xs"
                :disabled="selectedStaleIds.length === 0 || busy"
                @click="
                  confirmPruneClips(
                    selectedStaleIds,
                    overview.staleClips.filter((c) => selectedStaleIds.includes(c.id)).reduce((s, c) => s + c.sizeMb, 0)
                  )
                "
              >
                <Archive class="w-3.5 h-3.5" />
                <span>Arsip Ringan ({{ selectedStaleIds.length }})</span>
              </button>
              <button
                type="button"
                class="studio-btn-secondary text-xs"
                :disabled="selectedStaleIds.length === 0 || busy"
                @click="
                  confirmDeleteClips(
                    selectedStaleIds,
                    overview.staleClips.filter((c) => selectedStaleIds.includes(c.id)).reduce((s, c) => s + c.sizeMb, 0)
                  )
                "
              >
                <Trash2 class="w-3.5 h-3.5" />
                <span>Hapus Permanen ({{ selectedStaleIds.length }})</span>
              </button>
            </div>
          </div>

          <div v-if="overview.staleClips.length === 0" class="p-8 text-center space-y-2">
            <ShieldCheck class="w-8 h-8 mx-auto" style="color: var(--status-ok-fg);" />
            <p class="font-bold text-sm">Bersih! Tidak ada klip yang menganggur melewati ambang retensi.</p>
            <p class="text-xs studio-muted">Semua klip hasil generate baru saja aktif, sudah dijadwalkan, atau sudah dilindungi.</p>
          </div>

          <div v-else class="space-y-3">
            <article
              v-for="item in overview.staleClips"
              :key="item.id"
              class="p-4 rounded flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color);"
            >
              <div class="flex items-start gap-3 min-w-0">
                <input
                  type="checkbox"
                  :checked="selectedStaleIds.includes(item.id)"
                  :aria-label="`Pilih ${item.angleTitle}`"
                  class="mt-1 w-4 h-4 shrink-0"
                  @change="selectedStaleIds = toggleSelection(selectedStaleIds, item.id)"
                />
                <div class="space-y-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase"
                      :class="item.severity === 'critical' ? 'studio-badge-err' : 'studio-badge-warn'"
                    >
                      {{ item.severity === 'critical' ? `Kritis ${item.ageDays} Hari` : `Peringatan ${item.ageDays} Hari` }}
                    </span>
                    <span class="font-bold text-sm truncate">{{ item.angleTitle }}</span>
                    <span class="font-mono text-xs studio-muted">({{ formatSize(item.sizeMb) }})</span>
                  </div>
                  <p class="text-xs studio-muted">
                    Campaign: <strong class="text-[var(--text-primary)]">{{ item.campaignTitle }}</strong>
                    | {{ item.neverInspected ? 'Belum Pernah Dicek' : 'Pernah Dicek' }}
                    | {{ item.downloadCount }}x Unduh
                    | Skor {{ item.viralScoreTotal ?? '-' }}/100
                  </p>
                  <p class="text-xs">{{ item.reason }}</p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                <NuxtLink :to="`/clips/${item.id}`" class="studio-btn-secondary text-xs">
                  <Eye class="w-3.5 h-3.5" />
                  <span>Cek</span>
                </NuxtLink>
                <NuxtLink to="/calendar" class="studio-btn-secondary text-xs">
                  <CalendarDays class="w-3.5 h-3.5" />
                  <span>Jadwalkan</span>
                </NuxtLink>
                <button type="button" class="studio-btn-secondary text-xs" :disabled="busy" @click="handleClipRetention(item.id, 'pin')">
                  <Pin class="w-3.5 h-3.5" />
                  <span>Lindungi</span>
                </button>
                <button type="button" class="studio-btn-secondary text-xs" :disabled="busy" @click="handleClipRetention(item.id, 'snooze', 30)">
                  <Clock class="w-3.5 h-3.5" />
                  <span>Snooze 30h</span>
                </button>
                <button type="button" class="studio-btn-secondary text-xs" :disabled="busy" @click="confirmPruneClips([item.id], item.sizeMb)">
                  <Archive class="w-3.5 h-3.5" />
                  <span>Arsip MP4</span>
                </button>
                <button type="button" class="studio-btn-secondary text-xs" :disabled="busy" @click="confirmDeleteClips([item.id], item.sizeMb)">
                  <Trash2 class="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              </div>
            </article>
          </div>
        </section>

        <!-- ===============================================================
             TAB 2: KLIP SUDAH TAYANG (SIAP ARSIP RINGAN HAPUS MP4 SAJA)
             =============================================================== -->
        <section v-if="activeTab === 'published'" class="studio-card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="studio-heading text-base font-bold">Klip Sudah Tayang yang Masih Menyimpan MP4</h2>
              <p class="text-xs studio-muted">
                Gunakan Arsip Ringan untuk membebaskan 98% kapasitas file MP4 tanpa menghapus Skor Viral, Upload Playbook, link tayang, maupun Laporan Excel!
              </p>
            </div>
            <div v-if="overview.publishedWithMedia.length > 0" class="flex flex-wrap items-center gap-2">
              <button type="button" class="studio-btn-secondary text-xs" @click="selectAllPublished">
                {{ selectedPublishedIds.length === overview.publishedWithMedia.length ? 'Batal Pilih' : 'Pilih Semua' }}
              </button>
              <button
                type="button"
                class="studio-btn-primary text-xs"
                :disabled="selectedPublishedIds.length === 0 || busy"
                @click="
                  confirmPruneClips(
                    selectedPublishedIds,
                    overview.publishedWithMedia.filter((c) => selectedPublishedIds.includes(c.id)).reduce((s, c) => s + c.sizeMb, 0)
                  )
                "
              >
                <Archive class="w-4 h-4" />
                <span>Arsip Ringan Terpilih ({{ selectedPublishedIds.length }})</span>
              </button>
            </div>
          </div>

          <p v-if="overview.publishedWithMedia.length === 0" class="text-xs studio-muted py-6 text-center">
            Belum ada klip berstatus Sudah Tayang yang masih menyimpan berkas MP4 besar di disk.
          </p>

          <div v-else class="space-y-2.5">
            <div
              v-for="item in overview.publishedWithMedia"
              :key="item.id"
              class="p-3.5 rounded flex flex-wrap items-center justify-between gap-3"
              style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color);"
            >
              <div class="flex items-start gap-3 min-w-0">
                <input
                  type="checkbox"
                  :checked="selectedPublishedIds.includes(item.id)"
                  class="mt-1 w-4 h-4 shrink-0"
                  @change="selectedPublishedIds = toggleSelection(selectedPublishedIds, item.id)"
                />
                <div class="text-xs space-y-0.5 min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="px-2 py-0.5 rounded font-bold studio-badge-ok">Sudah Tayang</span>
                    <span v-if="item.recommendedPrune" class="px-2 py-0.5 rounded font-bold studio-badge-warn">
                      Disarankan Arsip ({{ item.daysSinceUpdated }}h)
                    </span>
                    <span class="font-bold text-sm">{{ item.angleTitle }}</span>
                    <span class="font-mono studio-muted">{{ formatSize(item.sizeMb) }}</span>
                  </div>
                  <p class="studio-muted">
                    {{ item.campaignTitle }} | Skor {{ item.viralScoreTotal ?? '-' }}/100
                    <span v-if="item.publishedUrl"> | {{ item.publishedUrl }}</span>
                  </p>
                </div>
              </div>

              <button type="button" class="studio-btn-secondary text-xs shrink-0" :disabled="busy" @click="confirmPruneClips([item.id], item.sizeMb)">
                <Archive class="w-3.5 h-3.5" />
                <span>Arsip Ringan (Hapus MP4)</span>
              </button>
            </div>
          </div>
        </section>

        <!-- ===============================================================
             TAB 3: VERSI REVISI LAMA (NON-AKTIF)
             =============================================================== -->
        <section v-if="activeTab === 'versions'" class="studio-card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="studio-heading text-base font-bold">Berkas Versi Revisi Usang (Non-Aktif)</h2>
              <p class="text-xs studio-muted">
                Versi percobaan lama (`v1`, `v2`) hasil Prompt Re-Editor atau Visual Timeline yang sudah digantikan versi aktif terbaru.
              </p>
            </div>
            <button
              v-if="overview.inactiveVersions.length > 0"
              type="button"
              class="studio-btn-primary text-xs"
              :disabled="busy"
              @click="confirmCleanupInactiveVersions"
            >
              <Trash2 class="w-4 h-4" />
              <span>Bersihkan Semua Versi Lama ({{ formatSize(overview.inactiveVersions.reduce((s, v) => s + v.sizeMb, 0)) }})</span>
            </button>
          </div>

          <p v-if="overview.inactiveVersions.length === 0" class="text-xs studio-muted py-6 text-center">
            Tidak ada tumpukan berkas versi revisi lama di disk lokal.
          </p>

          <div v-else class="space-y-2">
            <div
              v-for="v in overview.inactiveVersions"
              :key="v.versionId"
              class="p-3 rounded flex flex-wrap items-center justify-between gap-2 text-xs"
              style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
            >
              <div>
                <span class="font-bold">{{ v.angleTitle }}</span>
                <span class="ml-2 px-1.5 py-0.5 rounded font-mono studio-badge-warn">v{{ v.versionNumber }} (Non-Aktif)</span>
                <p class="studio-muted mt-0.5">{{ v.campaignTitle }} | {{ new Date(v.createdAt).toLocaleDateString('id-ID') }}</p>
              </div>
              <span class="font-mono font-bold">{{ formatSize(v.sizeMb) }}</span>
            </div>
          </div>
        </section>

        <!-- ===============================================================
             TAB 4: RAW VIDEO CAMPAIGN LAMA
             =============================================================== -->
        <section v-if="activeTab === 'raw'" class="studio-card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="studio-heading text-base font-bold">Video Mentah (Raw Footage) di `storage/uploads/`</h2>
              <p class="text-xs studio-muted">
                Video mentah biasanya menyumbang porsi disk terbesar. Hapus hanya pada campaign yang sudah selesai karena penghapusan raw video menonaktifkan re-edit / render ulang.
              </p>
            </div>
            <button
              v-if="selectedRawIds.length > 0"
              type="button"
              class="studio-btn-primary text-xs"
              :disabled="busy"
              @click="
                confirmDeleteRawAssets(
                  selectedRawIds,
                  overview.rawAssets.filter((r) => selectedRawIds.includes(r.id)).reduce((s, r) => s + r.sizeMb, 0)
                )
              "
            >
              <Trash2 class="w-4 h-4" />
              <span>Hapus {{ selectedRawIds.length }} Raw Video Terpilih</span>
            </button>
          </div>

          <p v-if="overview.rawAssets.length === 0" class="text-xs studio-muted py-6 text-center">
            Belum ada berkas video mentah tersimpan di disk lokal.
          </p>

          <div v-else class="space-y-2.5">
            <div
              v-for="raw in overview.rawAssets"
              :key="raw.id"
              class="p-3.5 rounded flex flex-wrap items-center justify-between gap-3 text-xs"
              style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color);"
            >
              <div class="flex items-start gap-3 min-w-0">
                <input
                  type="checkbox"
                  :checked="selectedRawIds.includes(raw.id)"
                  class="mt-1 w-4 h-4 shrink-0"
                  @change="selectedRawIds = toggleSelection(selectedRawIds, raw.id)"
                />
                <div class="space-y-0.5 min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="font-bold text-sm truncate">{{ raw.originalFilename }}</span>
                    <span class="font-mono font-bold">{{ formatSize(raw.sizeMb) }}</span>
                    <span v-if="raw.recommendedForCleanup" class="px-2 py-0.5 rounded font-bold studio-badge-warn">
                      Disarankan Hapus
                    </span>
                  </div>
                  <p class="studio-muted">
                    Campaign: <strong>{{ raw.campaignTitle }}</strong> ({{ raw.campaignStatus }}) | Usia {{ raw.ageDays }} hari | {{ raw.cleanupReason }}
                  </p>
                </div>
              </div>

              <button type="button" class="studio-btn-secondary text-xs shrink-0" :disabled="busy" @click="confirmDeleteRawAssets([raw.id], raw.sizeMb)">
                <Trash2 class="w-3.5 h-3.5" />
                <span>Hapus Raw</span>
              </button>
            </div>
          </div>
        </section>

        <!-- ===============================================================
             TAB 5: SAMPAH TEMP, ORPHAN FILES & RENDER GAGAL
             =============================================================== -->
        <section v-if="activeTab === 'orphans'" class="studio-card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="studio-heading text-base font-bold">Sampah Temp, File Yatim (Orphan) &amp; Render Gagal</h2>
              <p class="text-xs studio-muted">
                Berkas sementara upload/FFmpeg, file sisa di folder renders yang tidak tercatat di database, serta antrean klip gagal render.
              </p>
            </div>
            <button
              v-if="overview.orphanAndFailed.orphanEntries.length > 0 || overview.orphanAndFailed.failedClips.length > 0"
              type="button"
              class="studio-btn-primary text-xs"
              :disabled="busy || overview.activeJobsCount > 0"
              @click="confirmCleanupOrphans"
            >
              <Trash2 class="w-4 h-4" />
              <span>Bersihkan Semua Sampah &amp; Gagal</span>
            </button>
          </div>

          <div v-if="overview.activeJobsCount > 0" class="p-3 rounded text-xs studio-badge-warn">
            Ada {{ overview.activeJobsCount }} proses render sedang berjalan. Pemindaian orphan &amp; pembersihan temp dikunci sementara demi keamanan file.
          </div>

          <p
            v-else-if="overview.orphanAndFailed.orphanEntries.length === 0 && overview.orphanAndFailed.failedClips.length === 0"
            class="text-xs studio-muted py-6 text-center"
          >
            Tidak ditemukan berkas sampah, orphan, maupun klip gagal render.
          </p>

          <div v-else class="space-y-3">
            <div v-if="overview.orphanAndFailed.failedClips.length > 0" class="space-y-2">
              <h3 class="text-xs font-bold uppercase studio-muted">Klip Gagal Render ({{ overview.orphanAndFailed.failedClips.length }})</h3>
              <div
                v-for="fc in overview.orphanAndFailed.failedClips"
                :key="fc.id"
                class="p-3 rounded flex items-center justify-between gap-2 text-xs"
                style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
              >
                <div>
                  <p class="font-bold">{{ fc.angleTitle }} ({{ fc.campaignTitle }})</p>
                  <p class="studio-muted">{{ fc.errorMessage || 'Render terhenti' }}</p>
                </div>
                <span class="font-mono">{{ formatSize(fc.sizeMb) }}</span>
              </div>
            </div>

            <div v-if="overview.orphanAndFailed.orphanEntries.length > 0" class="space-y-2">
              <h3 class="text-xs font-bold uppercase studio-muted">Berkas Temp &amp; Orphan Disk ({{ overview.orphanAndFailed.orphanEntries.length }})</h3>
              <div
                v-for="oe in overview.orphanAndFailed.orphanEntries"
                :key="oe.relPath"
                class="p-2.5 rounded flex items-center justify-between gap-2 text-xs font-mono"
                style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
              >
                <span class="truncate">{{ oe.relPath }}</span>
                <span class="shrink-0">{{ formatSize(oe.sizeMb) }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- ===============================================================
             TAB 6: KLIP DILINDUNGI / SNOOZE & LOG RIWAYAT PEMBERSIHAN
             =============================================================== -->
        <section v-if="activeTab === 'logs'" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="studio-card p-5 space-y-3">
            <h2 class="studio-heading text-base font-bold">Klip Dilindungi (Pin) &amp; Ditunda (Snooze)</h2>
            <p v-if="overview.protectedClips.length === 0" class="text-xs studio-muted py-4">
              Belum ada klip yang di-Pin atau di-Snooze.
            </p>
            <div v-else class="space-y-2">
              <div
                v-for="pc in overview.protectedClips"
                :key="pc.id"
                class="p-3 rounded flex flex-wrap items-center justify-between gap-2 text-xs"
                style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
              >
                <div class="min-w-0">
                  <p class="font-bold truncate">{{ pc.angleTitle }}</p>
                  <p class="studio-muted">
                    {{ pc.campaignTitle }} |
                    {{ pc.retentionProtected ? 'Dilindungi Permanen (Pin)' : `Snooze sampai ${pc.snoozedUntil ? new Date(pc.snoozedUntil).toLocaleDateString('id-ID') : '-'}` }}
                  </p>
                </div>
                <button type="button" class="studio-btn-secondary text-xs" :disabled="busy" @click="handleClipRetention(pc.id, 'unpin')">
                  <PinOff class="w-3.5 h-3.5" />
                  <span>Lepas</span>
                </button>
              </div>
            </div>
          </div>

          <div class="studio-card p-5 space-y-3">
            <h2 class="studio-heading text-base font-bold">Riwayat Audit Pembersihan Disk</h2>
            <p v-if="overview.cleanupLogs.length === 0" class="text-xs studio-muted py-4">
              Belum ada riwayat pembersihan disk yang dieksekusi.
            </p>
            <div v-else class="space-y-2 max-h-96 overflow-y-auto">
              <div
                v-for="log in overview.cleanupLogs"
                :key="log.id"
                class="p-3 rounded text-xs space-y-1"
                style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-mono text-[11px] font-bold studio-badge-ok px-2 py-0.5 rounded">
                    +{{ formatSize(log.freedMb) }} bebas
                  </span>
                  <span class="font-mono text-[11px] studio-muted">{{ new Date(log.createdAt).toLocaleString('id-ID') }}</span>
                </div>
                <p>{{ log.summary }}</p>
              </div>
            </div>
          </div>
        </section>
      </template>

      <!-- Modal Konfirmasi Dry-Run (Zero Silent Auto-Delete) -->
      <div
        v-if="pendingConfirm"
        class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        @keydown.esc="pendingConfirm = null"
      >
        <div class="studio-card max-w-md w-full p-5 space-y-4">
          <div class="flex items-start gap-3">
            <AlertTriangle class="w-5 h-5 shrink-0 mt-0.5" :style="{ color: pendingConfirm.isPermanent ? 'var(--status-err-fg)' : 'var(--status-warn-fg)' }" />
            <div class="space-y-1">
              <h3 class="studio-heading text-base font-bold">{{ pendingConfirm.title }}</h3>
              <p class="text-xs studio-muted leading-relaxed">{{ pendingConfirm.description }}</p>
              <p class="font-mono text-xs font-bold pt-1">
                Perkiraan ruang dibebaskan: ~{{ formatSize(pendingConfirm.estimatedMb) }}
              </p>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2">
            <button type="button" class="studio-btn-secondary text-xs" @click="pendingConfirm = null">Batal</button>
            <button type="button" class="studio-btn-primary text-xs" @click="executeConfirmedAction">
              Ya, Lanjutkan
            </button>
          </div>
        </div>
      </div>
    </div>
  </StudioShell>
</template>
