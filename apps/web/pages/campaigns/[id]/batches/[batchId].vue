<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import type { EdlDocument, TargetConfig } from '@clip/shared';
import {
  ArrowLeft,
  RefreshCw,
  XCircle,
  Download,
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
  Award,
  ShieldCheck
} from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import { apiRequest } from '~/composables/useApi';
import { useThemeStore } from '~/stores/theme';

interface BatchClipItem {
  id: string;
  sequenceIndex: number;
  angleTitle: string;
  hookSummary: string | null;
  status: string;
  isApproved: boolean;
  errorMessage: string | null;
  activeVersionId: string | null;
  versionCount: number;
  activeVersion: {
    id: string;
    versionNumber: number;
    edl: EdlDocument | null;
    hasVideo: boolean;
    hasCover: boolean;
    actualDurationSec: number | null;
    viralScoreTotal: number | null;
    briefCompliance: string | null;
    renderDurationMs: number | null;
  } | null;
}

interface BatchDetail {
  id: string;
  campaignId: string;
  campaignTitle: string;
  status: string;
  requestedCount: number;
  batchDiversityMode: string;
  estimatedTokens: number | null;
  actualTokens: number | null;
  targetConfig: TargetConfig | null;
  latestJob: {
    status: string;
    progressPct: number;
    stageLabel: string;
    errorMessage: string | null;
  } | null;
  clips: BatchClipItem[];
}

const route = useRoute();
const themeStore = useThemeStore();

const campaignId = computed(() => String(route.params.id));
const batchId = computed(() => String(route.params.batchId));

const batch = ref<BatchDetail | null>(null);
const loading = ref(false);
const liveProgressPct = ref(0);
const liveStageLabel = ref('Menghubungkan status render lokal...');
const errorMsg = ref('');
const sortBy = ref<'score' | 'sequence'>('score');
const filterMode = ref<'all' | 'high_score' | 'brief_pass' | 'approved'>('all');

let sseSource: EventSource | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;

const isRunning = computed(() => ['queued', 'processing'].includes(batch.value?.status ?? ''));

const filteredSortedClips = computed(() => {
  const list = [...(batch.value?.clips ?? [])];
  const filtered = list.filter((c) => {
    if (filterMode.value === 'high_score') return (c.activeVersion?.viralScoreTotal ?? 0) >= 80;
    if (filterMode.value === 'brief_pass') return c.activeVersion?.briefCompliance === 'pass';
    if (filterMode.value === 'approved') return c.isApproved;
    return true;
  });

  if (sortBy.value === 'score') {
    filtered.sort((a, b) => {
      const sa = a.activeVersion?.viralScoreTotal ?? -1;
      const sb = b.activeVersion?.viralScoreTotal ?? -1;
      if (sb !== sa) return sb - sa;
      return a.sequenceIndex - b.sequenceIndex;
    });
  } else {
    filtered.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  }
  return filtered;
});

function scoreBadgeClass(score: number | null | undefined): string {
  if (typeof score !== 'number') return 'studio-badge-warn';
  if (score >= 80) return 'studio-badge-ok';
  if (score >= 65) return 'studio-badge-warn';
  return 'studio-badge-err';
}

function complianceBadgeClass(status: string | null | undefined): string {
  if (status === 'pass') return 'studio-badge-ok';
  if (status === 'fail') return 'studio-badge-err';
  return 'studio-badge-warn';
}

function audioSummary(edl: EdlDocument | null | undefined): string {
  if (!edl) return '-';
  if (edl.audio.muteOriginal || edl.audio.originalVolume <= 0) return 'Mute 0% (Sound Platform)';
  if (edl.audio.originalVolume < 0.9) return `Ducking ${Math.round(edl.audio.originalVolume * 100)}%`;
  return 'Original 100% (-14 LUFS)';
}

async function fetchBatch() {
  loading.value = true;
  try {
    const res = await apiRequest<BatchDetail>(`/api/batches/${batchId.value}`);
    batch.value = res.data;
    if (res.data?.latestJob) {
      liveProgressPct.value = res.data.latestJob.progressPct;
      liveStageLabel.value = res.data.latestJob.stageLabel;
    } else if (res.data?.status === 'completed') {
      liveProgressPct.value = 100;
      liveStageLabel.value = 'Seluruh variasi selesai dirender.';
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memuat status batch.';
  } finally {
    loading.value = false;
  }
}

function connectSse() {
  if (!import.meta.client) return;
  sseSource?.close();
  sseSource = new EventSource(`/api/batches/${batchId.value}/stream`);

  sseSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as {
        status: string;
        progressPct: number;
        stageLabel: string;
        errorMessage?: string | null;
      };
      liveProgressPct.value = data.progressPct;
      liveStageLabel.value = data.stageLabel;
      if (['clip_ready', 'clip_failed', 'completed', 'partial_success', 'failed', 'cancelled'].includes(data.status)) {
        fetchBatch();
      }
      if (['completed', 'partial_success', 'failed', 'cancelled'].includes(data.status)) {
        sseSource?.close();
      }
    } catch {
      // Abaikan frame ping
    }
  };
}

async function handleCancelBatch() {
  try {
    await apiRequest(`/api/batches/${batchId.value}/cancel`, { method: 'POST' });
    await fetchBatch();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal membatalkan batch.';
  }
}

async function handleRetryClip(clipId: string) {
  try {
    await apiRequest(`/api/clips/${clipId}/retry`, { method: 'POST' });
    connectSse();
    await fetchBatch();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal mengulang render klip.';
  }
}

onMounted(async () => {
  await fetchBatch();
  if (isRunning.value) {
    connectSse();
    fallbackTimer = setInterval(() => {
      if (isRunning.value) fetchBatch();
    }, 3000);
  }
});

onBeforeUnmount(() => {
  sseSource?.close();
  if (fallbackTimer) clearInterval(fallbackTimer);
});
</script>

<template>
  <StudioShell>
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <NuxtLink
            :to="`/campaigns/${campaignId}/studio`"
            class="inline-flex items-center gap-1.5 text-xs font-semibold studio-muted hover:underline"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>Kembali ke Studio Campaign</span>
          </NuxtLink>
          <h1 class="studio-heading text-2xl md:text-3xl font-bold">
            Hasil Generate Multi-Varian
          </h1>
          <p v-if="batch?.targetConfig" class="text-xs studio-muted">
            {{ batch.campaignTitle }} | {{ batch.targetConfig.platform.toUpperCase() }} |
            Target: {{ batch.targetConfig.countryCode }} ({{ batch.targetConfig.ageGroup }}) |
            {{ batch.targetConfig.controversyLevel }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="isRunning"
            type="button"
            class="studio-btn-secondary"
            @click="handleCancelBatch"
          >
            <XCircle class="w-4 h-4" />
            <span>Batalkan Batch</span>
          </button>
          <button type="button" class="studio-btn-secondary" :disabled="loading" @click="fetchBatch">
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      <div v-if="errorMsg" class="p-3.5 rounded text-sm font-medium studio-badge-err">{{ errorMsg }}</div>

      <!-- Panel Live SSE Progress -->
      <section v-if="batch" class="studio-card p-5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div class="flex items-center gap-2">
            <CheckCircle2 v-if="batch.status === 'completed'" class="w-4 h-4" style="color: var(--status-ok-fg);" />
            <Clock v-else class="w-4 h-4" style="color: var(--accent-bg);" />
            <span class="font-bold">{{ liveStageLabel }}</span>
          </div>
          <span class="font-mono text-xs font-bold">{{ liveProgressPct }}% | Status: {{ batch.status.toUpperCase() }}</span>
        </div>

        <div class="h-2.5 w-full rounded overflow-hidden" style="background: var(--bg-elevated);">
          <div
            class="h-full transition-all duration-300"
            :style="{ width: `${Math.max(4, liveProgressPct)}%`, backgroundColor: 'var(--accent-bg)' }"
          />
        </div>
      </section>

      <!-- Kontrol Ranking & Filter Variasi -->
      <div
        v-if="batch && batch.clips.length > 0"
        class="flex flex-wrap items-center justify-between gap-3"
      >
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="px-3 py-1.5 rounded text-xs font-semibold min-h-[38px]"
            :style="filterMode === 'all' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }"
            @click="filterMode = 'all'"
          >
            Semua ({{ batch.clips.length }})
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded text-xs font-semibold min-h-[38px]"
            :style="filterMode === 'high_score' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }"
            @click="filterMode = 'high_score'"
          >
            Skor &gt;= 80
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded text-xs font-semibold min-h-[38px]"
            :style="filterMode === 'brief_pass' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }"
            @click="filterMode = 'brief_pass'"
          >
            Brief PASS
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded text-xs font-semibold min-h-[38px]"
            :style="filterMode === 'approved' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }"
            @click="filterMode = 'approved'"
          >
            Ditandai Final
          </button>
        </div>

        <div class="flex items-center gap-2 text-xs">
          <label for="sort-clips" class="studio-muted font-semibold whitespace-nowrap">Urutkan:</label>
          <select id="sort-clips" v-model="sortBy" class="studio-input !w-auto !min-h-[38px] text-xs py-1">
            <option value="score">Skor Viral Tertinggi</option>
            <option value="sequence">Urutan Variasi</option>
          </select>
        </div>
      </div>

      <!-- Grid Kartu Multi-Varian -->
      <div
        v-if="batch && filteredSortedClips.length > 0"
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        <article
          v-for="clip in filteredSortedClips"
          :key="clip.id"
          class="studio-card overflow-hidden flex flex-col justify-between"
        >
          <div>
            <!-- Area Preview Video 9:16 / 16:9 -->
            <div class="bg-black relative flex items-center justify-center aspect-[9/14] max-h-[420px] w-full overflow-hidden">
              <video
                v-if="clip.status === 'ready' && clip.activeVersion?.hasVideo"
                :key="clip.activeVersion.id"
                controls
                playsinline
                preload="metadata"
                :poster="clip.activeVersion.hasCover ? `/api/clips/${clip.id}/cover?versionId=${clip.activeVersion.id}` : undefined"
                :src="`/api/clips/${clip.id}/stream-video?versionId=${clip.activeVersion.id}`"
                class="w-full h-full object-contain"
              />
              <div v-else class="p-6 text-center text-xs text-slate-300 space-y-2">
                <p class="font-bold uppercase">{{ clip.status }}</p>
                <p v-if="clip.errorMessage" class="text-rose-300">{{ clip.errorMessage }}</p>
                <p v-else>Sedang merender di mesin FFmpeg lokal...</p>
              </div>
            </div>

            <div class="p-4 space-y-2.5">
              <div class="flex items-start justify-between gap-2">
                <h2 class="studio-heading text-base font-bold leading-snug">{{ clip.angleTitle }}</h2>
                <span
                  class="px-2 py-0.5 rounded text-[11px] font-semibold uppercase whitespace-nowrap shrink-0"
                  :class="
                    clip.status === 'ready'
                      ? 'studio-badge-ok'
                      : clip.status === 'failed'
                        ? 'studio-badge-err'
                        : 'studio-badge-warn'
                  "
                >
                  {{ clip.status === 'ready' ? 'Siap' : clip.status }}
                </span>
              </div>

              <!-- Badge Viral Score, Brief Compliance & Final -->
              <div v-if="clip.activeVersion" class="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                <span
                  v-if="typeof clip.activeVersion.viralScoreTotal === 'number'"
                  class="px-2 py-0.5 rounded font-mono inline-flex items-center gap-1"
                  :class="scoreBadgeClass(clip.activeVersion.viralScoreTotal)"
                >
                  <Award class="w-3.5 h-3.5" />
                  <span>Skor {{ clip.activeVersion.viralScoreTotal }}/100</span>
                </span>

                <span
                  v-if="clip.activeVersion.briefCompliance"
                  class="px-2 py-0.5 rounded uppercase inline-flex items-center gap-1"
                  :class="complianceBadgeClass(clip.activeVersion.briefCompliance)"
                >
                  <ShieldCheck class="w-3.5 h-3.5" />
                  <span>Brief: {{ clip.activeVersion.briefCompliance }}</span>
                </span>

                <span
                  v-if="clip.isApproved"
                  class="px-2 py-0.5 rounded uppercase studio-badge-ok"
                >
                  FINAL
                </span>
              </div>

              <p v-if="clip.hookSummary" class="text-xs studio-muted">
                Hook: "{{ clip.hookSummary }}"
              </p>

              <div v-if="clip.activeVersion" class="flex flex-wrap gap-1.5 font-mono text-[11px]">
                <span class="px-2 py-0.5 rounded" style="background: var(--bg-elevated);">
                  v{{ clip.activeVersion.versionNumber }} ({{ clip.versionCount }} ver) | {{ clip.activeVersion.actualDurationSec?.toFixed(1) ?? '-' }}s
                </span>
                <span
                  class="px-2 py-0.5 rounded inline-flex items-center gap-1"
                  style="background: var(--accent-soft-bg); color: var(--accent-soft-fg);"
                >
                  <VolumeX v-if="clip.activeVersion.edl?.audio.muteOriginal" class="w-3 h-3" />
                  <Volume2 v-else class="w-3 h-3" />
                  <span>{{ audioSummary(clip.activeVersion.edl) }}</span>
                </span>
              </div>
            </div>
          </div>

          <div
            class="p-4 pt-3 flex flex-wrap items-center gap-2"
            :style="{ borderTop: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)' }"
          >
            <NuxtLink
              v-if="clip.status === 'ready' && clip.activeVersion?.hasVideo"
              :to="`/clips/${clip.id}`"
              class="studio-btn-primary flex-1 text-xs"
            >
              <SlidersHorizontal class="w-4 h-4" />
              <span>Inspeksi, Playbook & Edit</span>
            </NuxtLink>

            <a
              v-if="clip.status === 'ready' && clip.activeVersion?.hasVideo"
              :href="`/api/clips/${clip.id}/stream-video?versionId=${clip.activeVersion.id}&download=true`"
              class="studio-btn-secondary text-xs"
              title="Unduh file MP4"
            >
              <Download class="w-4 h-4" />
              <span>MP4</span>
            </a>

            <button
              v-if="clip.status === 'failed'"
              type="button"
              class="studio-btn-primary flex-1 text-xs"
              @click="handleRetryClip(clip.id)"
            >
              <RotateCcw class="w-4 h-4" />
              <span>Retry Klip Ini</span>
            </button>
          </div>
        </article>
      </div>

      <div v-else-if="batch && batch.clips.length > 0" class="studio-card p-6 text-center text-sm studio-muted">
        Tidak ada variasi yang cocok dengan filter terpilih. Pilih "Semua" untuk melihat seluruh variasi.
      </div>
    </div>
  </StudioShell>
</template>
