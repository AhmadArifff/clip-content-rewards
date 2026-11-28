<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { PublishStatus } from '@clip/shared';
import {
  CalendarDays,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  Clock,
  Award,
  ExternalLink,
  Save,
  LayoutGrid,
  Table2,
  RefreshCw,
  ShieldCheck
} from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import { apiRequest } from '~/composables/useApi';
import { useThemeCopy } from '~/composables/useThemeCopy';
import { useThemeStore } from '~/stores/theme';

interface CalendarCampaignOption {
  id: string;
  title: string;
  brandOwner: string | null;
}

interface CalendarSummary {
  totalReadyClips: number;
  scheduledCount: number;
  publishedCount: number;
  unscheduledCount: number;
  approvedCount: number;
  briefPassCount: number;
  avgViralScore: number;
}

interface CalendarClipItem {
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
  versionNumber: number;
  actualDurationSec: number | null;
  viralScoreTotal: number | null;
  briefCompliance: string | null;
  framingMode: string | null;
  audioSummary: string;
  recommendedTimezone: string;
  recommendedSlots: string[];
  titleOption1: string;
  mandatoryHashtags: string;
}

interface CalendarOverviewResponse {
  campaigns: CalendarCampaignOption[];
  summary: CalendarSummary;
  items: CalendarClipItem[];
}

interface DraftSchedule {
  scheduledDate: string;
  scheduledSlot: string;
  publishStatus: PublishStatus;
  publishedUrl: string;
  calendarNote: string;
}

const route = useRoute();
const copy = useThemeCopy();
const themeStore = useThemeStore();

const campaigns = ref<CalendarCampaignOption[]>([]);
const summary = ref<CalendarSummary>({
  totalReadyClips: 0,
  scheduledCount: 0,
  publishedCount: 0,
  unscheduledCount: 0,
  approvedCount: 0,
  briefPassCount: 0,
  avgViralScore: 0
});
const items = ref<CalendarClipItem[]>([]);
const drafts = ref<Record<string, DraftSchedule>>({});

const filterCampaignId = ref(typeof route.query.campaignId === 'string' ? route.query.campaignId : '');
const filterPlatform = ref('all');
const filterStatus = ref('all');
const filterOnlyApproved = ref(false);
const viewMode = ref<'calendar' | 'table'>('calendar');

const loading = ref(false);
const autoScheduling = ref(false);
const exportingExcel = ref(false);
const savingClipId = ref('');
const errorMsg = ref('');
const noticeMsg = ref('');

function buildQueryParams(): string {
  const qs = new URLSearchParams();
  if (filterCampaignId.value) qs.set('campaignId', filterCampaignId.value);
  if (filterPlatform.value !== 'all') qs.set('platform', filterPlatform.value);
  if (filterStatus.value !== 'all') qs.set('publishStatus', filterStatus.value);
  if (filterOnlyApproved.value) qs.set('onlyApproved', 'true');
  const str = qs.toString();
  return str ? `?${str}` : '';
}

function hydrateDrafts(list: CalendarClipItem[]) {
  const next: Record<string, DraftSchedule> = {};
  for (const item of list) {
    next[item.clipId] = {
      scheduledDate: item.scheduledDate ?? '',
      scheduledSlot: item.scheduledSlot ?? item.recommendedSlots[0] ?? '19:00-21:00 WIB',
      publishStatus: item.publishStatus,
      publishedUrl: item.publishedUrl ?? '',
      calendarNote: item.calendarNote ?? ''
    };
  }
  drafts.value = next;
}

function formatDayLabel(dateKey: string): string {
  if (dateKey === '__unscheduled__') return 'Belum Dijadwalkan (Siap Auto-Jadwalkan)';
  const dt = new Date(`${dateKey}T12:00:00.000Z`);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const day = days[dt.getUTCDay()] ?? '';
  return `${day}, ${dateKey}`;
}

function platformBadgeLabel(platform: string): string {
  if (platform === 'tiktok') return 'TikTok 9:16';
  if (platform === 'youtube_shorts') return 'YT Shorts';
  if (platform === 'youtube_long') return 'YT 16:9';
  return platform;
}

function publishStatusLabel(status: PublishStatus): string {
  if (status === 'published') return 'Sudah Tayang';
  if (status === 'scheduled') return 'Terjadwal';
  return 'Belum Dijadwalkan';
}

function publishStatusBadgeClass(status: PublishStatus): string {
  if (status === 'published') return 'studio-badge-ok';
  if (status === 'scheduled') return 'studio-badge-warn';
  return '';
}

function scoreBadgeClass(score: number | null): string {
  if (typeof score !== 'number') return 'studio-badge-warn';
  if (score >= 80) return 'studio-badge-ok';
  if (score >= 65) return 'studio-badge-warn';
  return 'studio-badge-err';
}

const groupedCalendar = computed(() => {
  const groups = new Map<string, CalendarClipItem[]>();
  for (const item of items.value) {
    const key = item.scheduledDate ?? '__unscheduled__';
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }
  return Array.from(groups.entries()).map(([dateKey, clips]) => ({
    dateKey,
    label: formatDayLabel(dateKey),
    clips
  }));
});

async function fetchCalendar() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<CalendarOverviewResponse>(`/api/calendar${buildQueryParams()}`);
    if (res.data) {
      campaigns.value = res.data.campaigns;
      summary.value = res.data.summary;
      items.value = res.data.items;
      hydrateDrafts(res.data.items);
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memuat data kalender konten.';
  } finally {
    loading.value = false;
  }
}

async function handleSaveSchedule(clipId: string, overrideStatus?: PublishStatus) {
  const draft = drafts.value[clipId];
  if (!draft) return;

  savingClipId.value = clipId;
  errorMsg.value = '';
  noticeMsg.value = '';
  try {
    const nextStatus = overrideStatus ?? draft.publishStatus;
    const todayIso = new Date().toISOString().slice(0, 10);
    const nextDate =
      overrideStatus === 'published' && !draft.scheduledDate
        ? todayIso
        : draft.scheduledDate || null;

    await apiRequest(`/api/clips/${clipId}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify({
        scheduledDate: nextDate,
        scheduledSlot: draft.scheduledSlot.trim() || null,
        publishStatus: nextStatus,
        publishedUrl: draft.publishedUrl.trim() || null,
        calendarNote: draft.calendarNote.trim() || null
      })
    });

    noticeMsg.value =
      overrideStatus === 'published'
        ? 'Klip berhasil ditandai Sudah Tayang!'
        : 'Jadwal publikasi klip berhasil disimpan.';
    await fetchCalendar();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menyimpan jadwal klip.';
  } finally {
    savingClipId.value = '';
  }
}

async function handleAutoSchedule() {
  autoScheduling.value = true;
  errorMsg.value = '';
  noticeMsg.value = '';
  try {
    const res = await apiRequest<{ scheduledCount: number; startDate: string }>('/api/calendar/auto-schedule', {
      method: 'POST',
      body: JSON.stringify({
        campaignId: filterCampaignId.value || undefined,
        onlyApproved: filterOnlyApproved.value,
        maxPerPlatformPerDay: 2
      })
    });

    const count = res.data?.scheduledCount ?? 0;
    noticeMsg.value =
      count > 0
        ? `Berhasil menjadwalkan otomatis ${count} variasi klip ke slot jam optimal mulai ${res.data?.startDate}!`
        : 'Semua variasi pada filter ini sudah terjadwal atau sudah tayang.';
    await fetchCalendar();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menjadwalkan klip otomatis.';
  } finally {
    autoScheduling.value = false;
  }
}

async function handleExportExcel() {
  errorMsg.value = '';
  noticeMsg.value = '';

  if (items.value.length === 0) {
    errorMsg.value = 'Tidak ada data variasi klip yang cocok dengan filter untuk diekspor ke Excel.';
    return;
  }

  exportingExcel.value = true;
  try {
    const response = await fetch(`/api/export/calendar.xlsx${buildQueryParams()}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      let msg = 'Gagal menyusun laporan Excel (.xlsx).';
      try {
        const errPayload = (await response.json()) as { error?: { message?: string } };
        if (errPayload.error?.message) msg = errPayload.error.message;
      } catch {
        // Gunakan pesan default
      }
      errorMsg.value = msg;
      return;
    }

    const blob = await response.blob();
    const disp = response.headers.get('content-disposition') || '';
    const match = disp.match(/filename="([^"]+)"/i);
    const filename = match?.[1] || `laporan-kalender-${Date.now()}.xlsx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    noticeMsg.value = `Laporan Excel 3-sheet berhasil diunduh: ${filename}`;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal mengunduh laporan Excel.';
  } finally {
    exportingExcel.value = false;
  }
}

watch([filterCampaignId, filterPlatform, filterStatus, filterOnlyApproved], () => {
  fetchCalendar();
});

onMounted(fetchCalendar);
</script>

<template>
  <StudioShell>
    <div class="space-y-6 min-w-0">
      <!-- Header & Primary Actions -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1 min-w-0">
          <h1 class="studio-heading text-2xl md:text-3xl font-bold inline-flex items-center gap-2">
            <CalendarDays class="w-6 h-6 shrink-0" style="color: var(--accent-bg);" />
            <span>{{ copy.calendarTitle }}</span>
          </h1>
          <p class="text-sm studio-muted max-w-2xl leading-relaxed">
            {{ copy.calendarSubtitle }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="studio-btn-primary text-xs"
            :disabled="autoScheduling || loading"
            @click="handleAutoSchedule"
          >
            <Sparkles class="w-4 h-4" />
            <span>{{ autoScheduling ? 'Menjadwalkan...' : 'Auto-Jadwalkan Cerdas' }}</span>
          </button>

          <button
            type="button"
            class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold min-h-[44px] transition"
            style="background: var(--status-ok-bg); color: var(--status-ok-fg); border: 1.5px solid var(--status-ok-fg);"
            :disabled="exportingExcel || loading"
            @click="handleExportExcel"
          >
            <FileSpreadsheet class="w-4 h-4" />
            <span>{{ exportingExcel ? 'Menyusun .xlsx...' : 'Unduh Laporan Excel (.xlsx)' }}</span>
          </button>
        </div>
      </div>

      <div v-if="errorMsg" class="p-3.5 rounded text-sm font-medium studio-badge-err">{{ errorMsg }}</div>
      <div v-if="noticeMsg" class="p-3.5 rounded text-sm font-medium studio-badge-ok">{{ noticeMsg }}</div>

      <!-- 4 Kartu KPI Ringkasan -->
      <section class="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div class="studio-card p-4 space-y-1">
          <span class="text-xs font-semibold studio-muted">Total Klip Siap</span>
          <p class="studio-heading text-2xl font-extrabold font-mono">{{ summary.totalReadyClips }}</p>
          <span class="text-[11px] studio-muted">Final: {{ summary.approvedCount }} | Brief PASS: {{ summary.briefPassCount }}</span>
        </div>

        <div class="studio-card p-4 space-y-1">
          <span class="text-xs font-semibold studio-muted">Terjadwal Tayang</span>
          <p class="studio-heading text-2xl font-extrabold font-mono" style="color: var(--status-warn-fg);">
            {{ summary.scheduledCount }}
          </p>
          <span class="text-[11px] studio-muted">Belum dijadwalkan: {{ summary.unscheduledCount }}</span>
        </div>

        <div class="studio-card p-4 space-y-1">
          <span class="text-xs font-semibold studio-muted">Sudah Tayang</span>
          <p class="studio-heading text-2xl font-extrabold font-mono" style="color: var(--status-ok-fg);">
            {{ summary.publishedCount }}
          </p>
          <span class="text-[11px] studio-muted">Status terverifikasi selesai</span>
        </div>

        <div class="studio-card p-4 space-y-1">
          <span class="text-xs font-semibold studio-muted">Rata-Rata Skor Viral</span>
          <p class="studio-heading text-2xl font-extrabold font-mono" style="color: var(--accent-bg);">
            {{ summary.avgViralScore }}
          </p>
          <span class="text-[11px] studio-muted">Skala 0 sampai 100</span>
        </div>
      </section>

      <!-- Bar Filter & Switch Tampilan -->
      <section class="studio-card p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
          <div class="space-y-1">
            <label for="cal-campaign" class="block text-xs font-semibold">Campaign</label>
            <select id="cal-campaign" v-model="filterCampaignId" class="studio-input !min-h-[40px] text-xs py-1">
              <option value="">Semua Campaign</option>
              <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.title }}</option>
            </select>
          </div>

          <div class="space-y-1">
            <label for="cal-platform" class="block text-xs font-semibold">Platform</label>
            <select id="cal-platform" v-model="filterPlatform" class="studio-input !min-h-[40px] text-xs py-1">
              <option value="all">Semua Platform</option>
              <option value="tiktok">TikTok (9:16)</option>
              <option value="youtube_shorts">YouTube Shorts (9:16)</option>
              <option value="youtube_long">YouTube Standard (16:9)</option>
            </select>
          </div>

          <div class="space-y-1">
            <label for="cal-status" class="block text-xs font-semibold">Status Publikasi</label>
            <select id="cal-status" v-model="filterStatus" class="studio-input !min-h-[40px] text-xs py-1">
              <option value="all">Semua Status</option>
              <option value="unscheduled">Belum Dijadwalkan</option>
              <option value="scheduled">Terjadwal</option>
              <option value="published">Sudah Tayang</option>
            </select>
          </div>

          <div class="flex items-center gap-2 pt-4">
            <label class="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer min-h-[40px]">
              <input id="cal-approved" v-model="filterOnlyApproved" type="checkbox" class="w-4 h-4 accent-emerald-600" />
              <span>Hanya Klip Final</span>
            </label>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            class="px-3 py-2 rounded text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
            :style="viewMode === 'calendar' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
            @click="viewMode = 'calendar'"
          >
            <LayoutGrid class="w-3.5 h-3.5" />
            <span>Kalender</span>
          </button>
          <button
            type="button"
            class="px-3 py-2 rounded text-xs font-bold inline-flex items-center gap-1.5 min-h-[40px]"
            :style="viewMode === 'table' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
            @click="viewMode = 'table'"
          >
            <Table2 class="w-3.5 h-3.5" />
            <span>Tabel Matriks</span>
          </button>
          <button
            type="button"
            class="studio-btn-secondary !min-h-[40px] !px-2.5"
            title="Segarkan data"
            :disabled="loading"
            @click="fetchCalendar"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
          </button>
        </div>
      </section>

      <!-- State Kosong -->
      <section v-if="!loading && items.length === 0" class="studio-card p-8 text-center space-y-3">
        <CalendarDays class="w-10 h-10 mx-auto studio-muted" />
        <h2 class="studio-heading text-lg font-bold">Belum Ada Klip Siap Tayang pada Filter Ini</h2>
        <p class="text-sm studio-muted max-w-md mx-auto">
          Buat variasi video pada menu Campaign terlebih dahulu atau longgarkan filter status agar klip muncul di kalender konten dan siap diekspor ke Excel.
        </p>
        <NuxtLink to="/campaigns" class="studio-btn-primary text-xs inline-flex">
          <span>Buka Daftar Campaign</span>
        </NuxtLink>
      </section>

      <!-- MODE 1: TAMPILAN KALENDER TERKELOMPOK PER TANGGAL -->
      <div v-else-if="viewMode === 'calendar'" class="space-y-5">
        <section
          v-for="group in groupedCalendar"
          :key="group.dateKey"
          class="space-y-2.5"
        >
          <div class="flex items-center justify-between gap-2">
            <h2 class="studio-heading text-sm md:text-base font-bold inline-flex items-center gap-2">
              <Clock class="w-4 h-4" style="color: var(--accent-bg);" />
              <span>{{ group.label }}</span>
            </h2>
            <span class="font-mono text-xs studio-muted">{{ group.clips.length }} klip</span>
          </div>

          <div class="space-y-3">
            <article
              v-for="item in group.clips"
              :key="item.clipId"
              class="studio-card p-4 space-y-3"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="space-y-1 min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                    <span class="px-2 py-0.5 rounded" style="background: var(--bg-elevated);">
                      {{ platformBadgeLabel(item.platform) }}
                    </span>
                    <span class="px-2 py-0.5 rounded font-mono inline-flex items-center gap-1" :class="scoreBadgeClass(item.viralScoreTotal)">
                      <Award class="w-3 h-3" />
                      <span>Skor {{ item.viralScoreTotal ?? '-' }}</span>
                    </span>
                    <span
                      class="px-2 py-0.5 rounded uppercase inline-flex items-center gap-1"
                      :class="item.briefCompliance === 'pass' ? 'studio-badge-ok' : 'studio-badge-warn'"
                    >
                      <ShieldCheck class="w-3 h-3" />
                      <span>Brief: {{ (item.briefCompliance ?? 'warn').toUpperCase() }}</span>
                    </span>
                    <span v-if="item.isApproved" class="px-2 py-0.5 rounded studio-badge-ok uppercase">FINAL</span>
                    <span
                      class="px-2 py-0.5 rounded uppercase"
                      :class="publishStatusBadgeClass(item.publishStatus)"
                      :style="item.publishStatus === 'unscheduled' ? { background: 'var(--bg-elevated)' } : {}"
                    >
                      {{ publishStatusLabel(item.publishStatus) }}
                    </span>
                  </div>

                  <h3 class="studio-heading text-sm md:text-base font-bold break-words">
                    {{ item.angleTitle }}
                  </h3>
                  <p class="text-xs studio-muted break-words">
                    {{ item.campaignTitle }} | v{{ item.versionNumber }} ({{ item.actualDurationSec?.toFixed(1) ?? '-' }}s) |
                    {{ item.audioSummary }}
                  </p>
                </div>

                <NuxtLink
                  :to="`/clips/${item.clipId}`"
                  class="studio-btn-secondary !min-h-[38px] text-xs shrink-0"
                >
                  <ExternalLink class="w-3.5 h-3.5" />
                  <span>Inspektor</span>
                </NuxtLink>
              </div>

              <!-- Bar Edit Jadwal Inline -->
              <div
                v-if="drafts[item.clipId]"
                class="pt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end text-xs"
                :style="{ borderTop: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)' }"
              >
                <div class="lg:col-span-3 space-y-1">
                  <label :for="`date-${item.clipId}`" class="block font-semibold studio-muted">Tanggal Tayang</label>
                  <input
                    :id="`date-${item.clipId}`"
                    v-model="drafts[item.clipId].scheduledDate"
                    type="date"
                    class="studio-input !min-h-[38px] text-xs font-mono"
                  />
                </div>

                <div class="lg:col-span-3 space-y-1">
                  <label :for="`slot-${item.clipId}`" class="block font-semibold studio-muted">Slot Jam Optimal</label>
                  <input
                    :id="`slot-${item.clipId}`"
                    v-model="drafts[item.clipId].scheduledSlot"
                    type="text"
                    placeholder="19:00-21:00 WIB"
                    class="studio-input !min-h-[38px] text-xs font-mono"
                  />
                </div>

                <div class="lg:col-span-2 space-y-1">
                  <label :for="`status-${item.clipId}`" class="block font-semibold studio-muted">Status</label>
                  <select
                    :id="`status-${item.clipId}`"
                    v-model="drafts[item.clipId].publishStatus"
                    class="studio-input !min-h-[38px] text-xs py-1"
                  >
                    <option value="unscheduled">Belum Dijadwalkan</option>
                    <option value="scheduled">Terjadwal</option>
                    <option value="published">Sudah Tayang</option>
                  </select>
                </div>

                <div class="lg:col-span-4 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    class="studio-btn-secondary !min-h-[38px] text-xs flex-1"
                    :disabled="savingClipId === item.clipId"
                    @click="handleSaveSchedule(item.clipId)"
                  >
                    <Save class="w-3.5 h-3.5" />
                    <span>Simpan Jadwal</span>
                  </button>

                  <button
                    v-if="item.publishStatus !== 'published'"
                    type="button"
                    class="studio-btn-primary !min-h-[38px] text-xs flex-1"
                    :disabled="savingClipId === item.clipId"
                    @click="handleSaveSchedule(item.clipId, 'published')"
                  >
                    <CheckCircle2 class="w-3.5 h-3.5" />
                    <span>Tandai Tayang</span>
                  </button>
                </div>

                <div class="sm:col-span-2 lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    v-model="drafts[item.clipId].publishedUrl"
                    type="text"
                    maxlength="280"
                    placeholder="Tautan postingan TikTok / YouTube (opsional)"
                    class="studio-input !min-h-[36px] text-xs"
                  />
                  <input
                    v-model="drafts[item.clipId].calendarNote"
                    type="text"
                    maxlength="280"
                    placeholder="Catatan uploader (mis. pakai sound trending #1)"
                    class="studio-input !min-h-[36px] text-xs"
                  />
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>

      <!-- MODE 2: TABEL MATRIKS TUNGGAL -->
      <section v-else class="studio-card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr style="background: var(--bg-elevated); border-bottom: 1px solid var(--border-color);">
                <th class="p-3 font-bold whitespace-nowrap">Tanggal &amp; Jam</th>
                <th class="p-3 font-bold whitespace-nowrap">Campaign &amp; Variasi</th>
                <th class="p-3 font-bold whitespace-nowrap">Platform</th>
                <th class="p-3 font-bold whitespace-nowrap text-right">Skor</th>
                <th class="p-3 font-bold whitespace-nowrap">Audio</th>
                <th class="p-3 font-bold whitespace-nowrap">Status</th>
                <th class="p-3 font-bold whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in items"
                :key="item.clipId"
                style="border-bottom: 1px solid var(--border-color);"
              >
                <td class="p-3 font-mono whitespace-nowrap">
                  <div class="font-bold">{{ item.scheduledDate ?? 'Belum diatur' }}</div>
                  <div class="studio-muted text-[11px]">{{ item.scheduledSlot ?? '-' }}</div>
                </td>
                <td class="p-3 min-w-[200px]">
                  <div class="font-bold">{{ item.angleTitle }}</div>
                  <div class="studio-muted text-[11px]">{{ item.campaignTitle }} (v{{ item.versionNumber }})</div>
                </td>
                <td class="p-3 whitespace-nowrap">{{ platformBadgeLabel(item.platform) }}</td>
                <td class="p-3 text-right font-mono font-bold">{{ item.viralScoreTotal ?? '-' }}</td>
                <td class="p-3 whitespace-nowrap">{{ item.audioSummary }}</td>
                <td class="p-3 whitespace-nowrap">
                  <span
                    class="px-2 py-0.5 rounded font-bold uppercase text-[10px]"
                    :class="publishStatusBadgeClass(item.publishStatus)"
                    :style="item.publishStatus === 'unscheduled' ? { background: 'var(--bg-elevated)' } : {}"
                  >
                    {{ publishStatusLabel(item.publishStatus) }}
                  </span>
                </td>
                <td class="p-3 whitespace-nowrap">
                  <NuxtLink :to="`/clips/${item.clipId}`" class="font-semibold hover:underline" style="color: var(--accent-bg);">
                    Buka Klip ->
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </StudioShell>
</template>
