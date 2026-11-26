<script setup lang="ts">
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-vue-next';
import { useThemeStore } from '~/stores/theme';
import { useThemeCopy } from '~/composables/useThemeCopy';

export interface DoctorReport {
  overallStatus: 'healthy' | 'warning';
  ffmpeg: { available: boolean; versionLine: string };
  ffprobe: { available: boolean; versionLine: string };
  database: { walMode: string; masterPresetCount: number; activeApiKeyCount: number };
  fonts: { bundledCount: number; bundledFiles: string[]; windowsSystemFallbackReady: boolean };
  storage: { rootPath: string; usedBytes: number; usedMb: number };
  runtime: { nodeVersion: string; platform: string; cpuCores: number; maxRenderConcurrency: number };
}

defineProps<{
  report: DoctorReport | null;
  loading: boolean;
}>();

defineEmits<{
  refresh: [];
}>();

const themeStore = useThemeStore();
const copy = useThemeCopy();
</script>

<template>
  <section
    :class="
      themeStore.current === 'daylight-editorial'
        ? 'studio-card-editorial pt-6'
        : 'studio-card p-5'
    "
  >
    <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="studio-heading text-lg font-bold">{{ copy.doctorTitle }}</h2>
          <span
            v-if="report"
            class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded"
            :class="report.overallStatus === 'healthy' ? 'studio-badge-ok' : 'studio-badge-warn'"
          >
            <CheckCircle2 v-if="report.overallStatus === 'healthy'" class="w-3.5 h-3.5" />
            <AlertTriangle v-else class="w-3.5 h-3.5" />
            <span>{{ report.overallStatus === 'healthy' ? 'Siap Produksi' : 'Perlu Perhatian' }}</span>
          </span>
        </div>
        <p class="text-sm studio-muted mt-0.5">{{ copy.doctorSubtitle }}</p>
      </div>
      <button type="button" class="studio-btn-secondary" :disabled="loading" @click="$emit('refresh')">
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        <span>Periksa Ulang</span>
      </button>
    </div>

    <div v-if="loading && !report" class="text-sm studio-muted py-4">Memeriksa perangkat lokal...</div>

    <!-- Slicing 1: Editing Room (Compact Monospace Telemetry Strip) -->
    <div
      v-else-if="report && themeStore.current === 'editing-room'"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs"
    >
      <div class="p-3 rounded" style="background: var(--bg-elevated); border: 1px solid var(--border-color);">
        <p class="studio-muted uppercase text-[10px]">FFMPEG / FFPROBE</p>
        <p class="mt-1 font-semibold" :style="{ color: report.ffmpeg.available ? 'var(--status-ok-fg)' : 'var(--status-err-fg)' }">
          {{ report.ffmpeg.available && report.ffprobe.available ? 'ONLINE' : 'MISSING' }}
        </p>
        <p class="studio-muted truncate mt-1" :title="report.ffmpeg.versionLine">{{ report.ffmpeg.versionLine }}</p>
      </div>
      <div class="p-3 rounded" style="background: var(--bg-elevated); border: 1px solid var(--border-color);">
        <p class="studio-muted uppercase text-[10px]">PENYIMPANAN & PRESET</p>
        <p class="mt-1 font-semibold">MODE {{ report.database.walMode.toUpperCase() }}</p>
        <p class="studio-muted mt-1">{{ report.database.masterPresetCount }} preset | {{ report.storage.usedMb }} MB</p>
      </div>
      <div class="p-3 rounded" style="background: var(--bg-elevated); border: 1px solid var(--border-color);">
        <p class="studio-muted uppercase text-[10px]">FONT SUBTITLE</p>
        <p class="mt-1 font-semibold">
          {{ report.fonts.bundledCount > 0 ? `${report.fonts.bundledCount} Bundled` : report.fonts.windowsSystemFallbackReady ? 'System Ready' : 'Perlu Font' }}
        </p>
        <p class="studio-muted mt-1">Safe-Zone ASS Engine</p>
      </div>
      <div class="p-3 rounded" style="background: var(--bg-elevated); border: 1px solid var(--border-color);">
        <p class="studio-muted uppercase text-[10px]">WORKER CPU LOKAL</p>
        <p class="mt-1 font-semibold">{{ report.runtime.cpuCores }} Core | Max {{ report.runtime.maxRenderConcurrency }} Job</p>
        <p class="studio-muted mt-1">Node {{ report.runtime.nodeVersion }}</p>
      </div>
    </div>

    <!-- Slicing 2: Daylight Editorial (Clean Magazine Ledger Rows) -->
    <div
      v-else-if="report && themeStore.current === 'daylight-editorial'"
      class="divide-y"
      style="border-color: var(--border-color);"
    >
      <div class="py-3 flex flex-wrap justify-between gap-2 text-sm">
        <span class="font-medium">Mesin Pengolah Video Lokal (FFmpeg & FFprobe)</span>
        <span class="studio-muted">{{ report.ffmpeg.available ? 'Terpasang dan siap merender tanpa biaya server' : 'Belum terdeteksi' }}</span>
      </div>
      <div class="py-3 flex flex-wrap justify-between gap-2 text-sm">
        <span class="font-medium">Penyimpanan Lokal & Pustaka Preset</span>
        <span class="studio-muted">{{ report.database.masterPresetCount }} preset aktif, ruang terpakai {{ report.storage.usedMb }} MB</span>
      </div>
      <div class="py-3 flex flex-wrap justify-between gap-2 text-sm">
        <span class="font-medium">Kesiapan Font Teks Subtitle</span>
        <span class="studio-muted">{{ report.fonts.bundledCount > 0 ? `${report.fonts.bundledCount} berkas font khusus` : 'Font standar Windows siap pakai' }}</span>
      </div>
      <div class="py-3 flex flex-wrap justify-between gap-2 text-sm">
        <span class="font-medium">Batas Beban Perangkat</span>
        <span class="studio-muted">{{ report.runtime.cpuCores }} core CPU, antrean dibatasi {{ report.runtime.maxRenderConcurrency }} video sekaligus</span>
      </div>
    </div>

    <!-- Slicing 3: Creator Tactile (Bold Framed Status Stamps) -->
    <div v-else-if="report" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="p-3.5 rounded-xl" style="background: var(--status-ok-bg); border: 2px solid #0f172a;">
        <p class="text-[11px] font-bold uppercase tracking-wide" style="color: var(--status-ok-fg);">Mesin Render</p>
        <p class="studio-heading text-lg font-bold mt-1">{{ report.ffmpeg.available ? 'FFmpeg OK!' : 'Cek FFmpeg' }}</p>
        <p class="text-xs mt-1 truncate">{{ report.runtime.nodeVersion }}</p>
      </div>
      <div class="p-3.5 rounded-xl" style="background: var(--accent-soft-bg); border: 2px solid #0f172a;">
        <p class="text-[11px] font-bold uppercase tracking-wide" style="color: var(--accent-soft-fg);">Kunci AI Aktif</p>
        <p class="studio-heading text-lg font-bold mt-1">{{ report.database.activeApiKeyCount }} Provider</p>
        <p class="text-xs mt-1">Terenkripsi Lokal</p>
      </div>
      <div class="p-3.5 rounded-xl" style="background: var(--bg-elevated); border: 2px solid #0f172a;">
        <p class="text-[11px] font-bold uppercase tracking-wide">Chip Preset</p>
        <p class="studio-heading text-lg font-bold mt-1">{{ report.database.masterPresetCount }} Siap Pakai</p>
        <p class="text-xs mt-1">{{ report.storage.usedMb }} MB dipakai</p>
      </div>
      <div class="p-3.5 rounded-xl" style="background: var(--bg-surface); border: 2px solid #0f172a;">
        <p class="text-[11px] font-bold uppercase tracking-wide">Keamanan CPU</p>
        <p class="studio-heading text-lg font-bold mt-1">Max {{ report.runtime.maxRenderConcurrency }} Antrean</p>
        <p class="text-xs mt-1">{{ report.runtime.cpuCores }} core terdeteksi</p>
      </div>
    </div>
  </section>
</template>
