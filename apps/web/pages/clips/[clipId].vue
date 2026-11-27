<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type {
  EdlDocument,
  TargetConfig,
  UploadPlaybook,
  ViralScoreCritique
} from '@clip/shared';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ClipboardCopy,
  Check,
  Download,
  History,
  Music2,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  AlertTriangle,
  Clock,
  Eye
} from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import SafeZoneOverlay from '~/components/studio/SafeZoneOverlay.vue';
import { apiRequest } from '~/composables/useApi';
import { useThemeStore } from '~/stores/theme';

interface SubtitleCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

interface ClipVersionItem {
  id: string;
  versionNumber: number;
  userPrompt: string | null;
  appliedPresets: string[];
  edl: EdlDocument | null;
  cues: SubtitleCue[];
  hasVideo: boolean;
  hasSrt: boolean;
  hasCover: boolean;
  actualDurationSec: number | null;
  viralScoreTotal: number | null;
  briefCompliance: 'pass' | 'warn' | 'fail' | null;
  scoreBreakdown: ViralScoreCritique['dimensions'] | null;
  briefChecklist: ViralScoreCritique['briefChecklist'];
  projectedImpact: ViralScoreCritique['projectedImpact'] | null;
  critiques: ViralScoreCritique['critiques'];
  uploadPlaybook: UploadPlaybook | null;
  renderDurationMs: number | null;
  createdAt: string;
}

interface ClipDetailResponse {
  id: string;
  batchId: string;
  campaignId: string;
  campaignTitle: string;
  sequenceIndex: number;
  angleTitle: string;
  hookSummary: string | null;
  status: string;
  isApproved: boolean;
  activeVersionId: string | null;
  targetConfig: TargetConfig | null;
  activeVersion: ClipVersionItem | null;
  versions: ClipVersionItem[];
}

interface PromptPresetItem {
  id: string;
  code: string;
  labelId: string;
  config: {
    group?: string;
    promptText?: string;
  };
}

const route = useRoute();
const themeStore = useThemeStore();
const clipId = computed(() => String(route.params.clipId));

const clip = ref<ClipDetailResponse | null>(null);
const selectedVersionId = ref<string>('');
const promptPresets = ref<PromptPresetItem[]>([]);
const loading = ref(false);
const regenerating = ref(false);
const savingApproval = ref(false);
const switchingVersion = ref(false);
const errorMsg = ref('');
const noticeMsg = ref('');

const activeTab = ref<'score' | 'playbook' | 'reedit'>('score');
const safeZoneMode = ref<'off' | 'tiktok' | 'youtube_shorts'>('off');
const videoEl = ref<HTMLVideoElement | null>(null);
const copiedKey = ref('');

const regenPrompt = ref('');
const selectedPresetCodes = ref<string[]>([]);
const showSubtitleEditor = ref(false);
const editedCues = ref<Record<number, string>>({});

const selectedVersion = computed<ClipVersionItem | null>(() => {
  if (!clip.value) return null;
  return (
    clip.value.versions.find((v) => v.id === selectedVersionId.value) ??
    clip.value.activeVersion ??
    clip.value.versions[0] ??
    null
  );
});

const baseVersionV1 = computed<ClipVersionItem | null>(() => {
  if (!clip.value) return null;
  return clip.value.versions.find((v) => v.versionNumber === 1) ?? clip.value.versions[clip.value.versions.length - 1] ?? null;
});

const scoreDeltaFromV1 = computed<number | null>(() => {
  const cur = selectedVersion.value?.viralScoreTotal;
  const base = baseVersionV1.value?.viralScoreTotal;
  if (typeof cur !== 'number' || typeof base !== 'number') return null;
  if (selectedVersion.value?.id === baseVersionV1.value?.id) return null;
  return cur - base;
});

const isSelectedActive = computed(() => {
  return Boolean(clip.value && selectedVersion.value && clip.value.activeVersionId === selectedVersion.value.id);
});

const nextVersionNumber = computed(() => {
  const nums = (clip.value?.versions ?? []).map((v) => v.versionNumber);
  return Math.max(0, ...nums) + 1;
});

const dimensionRows = computed(() => {
  const d = selectedVersion.value?.scoreBreakdown;
  if (!d) return [];
  return [
    { key: 'hookStrength', label: 'Kekuatan Hook (0-3 Detik)', ...d.hookStrength },
    { key: 'retentionPacing', label: 'Ritme & Retensi Visual', ...d.retentionPacing },
    { key: 'briefCompliance', label: 'Kepatuhan Aturan Brief', ...d.briefCompliance },
    { key: 'audienceFit', label: 'Kecocokan Target Audiens', ...d.audienceFit },
    { key: 'engagementTrigger', label: 'Pemicu Komentar & Share', ...d.engagementTrigger },
    { key: 'audioSafeZone', label: 'Audio & Safe-Zone Layar', ...d.audioSafeZone }
  ];
});

watch(selectedVersion, (ver) => {
  const map: Record<number, string> = {};
  for (const cue of ver?.cues ?? []) {
    map[cue.index] = cue.text;
  }
  editedCues.value = map;
});

function formatTime(sec: number | undefined): string {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return '00:00';
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function audioBadgeLabel(edl: EdlDocument | null | undefined): string {
  if (!edl) return '-';
  if (edl.audio.muteOriginal || edl.audio.originalVolume <= 0) return 'Mute 0% (Sound Platform)';
  if (edl.audio.originalVolume < 0.9) return `Ducking ${Math.round(edl.audio.originalVolume * 100)}%`;
  return `Original 100% (${edl.audio.normalizeLufs} LUFS)`;
}

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

function seekTo(sec: number | undefined) {
  if (!videoEl.value || typeof sec !== 'number') return;
  videoEl.value.currentTime = Math.max(0, sec);
  videoEl.value.play().catch(() => {
    // Abaikan autoplay block browser
  });
}

async function copyText(key: string, text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copiedKey.value = key;
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = '';
    }, 1800);
  } catch {
    errorMsg.value = 'Gagal menyalin teks ke clipboard.';
  }
}

function buildFullPlaybookText(pb: UploadPlaybook): string {
  const allTags = [...pb.hashtags.mandatory, ...pb.hashtags.niche, ...pb.hashtags.broad].join(' ');
  return [
    '=== PANDUAN AUDIO & MUSIK ===',
    `Kondisi Audio Video: ${pb.audioMusicGuide.renderedAudioState}`,
    `Rekomendasi Vibe Musik: ${pb.audioMusicGuide.recommendedMusicVibe} (${pb.audioMusicGuide.bpmRange})`,
    `Instruksi Mixing: ${pb.audioMusicGuide.platformMixingInstruction}`,
    '',
    '=== OPSI JUDUL ===',
    ...pb.titleOptions.map((t, i) => `${i + 1}. ${t}`),
    '',
    '=== CAPTION / DESKRIPSI ===',
    pb.captionDescription,
    '',
    '=== HASHTAG ===',
    allTags,
    '',
    '=== JADWAL TAYANG OPTIMAL ===',
    `Zona Waktu: ${pb.optimalSchedule.timezone}`,
    `Hari Terbaik: ${pb.optimalSchedule.bestDays.join(', ')}`,
    `Jam Tayang: ${pb.optimalSchedule.bestTimeSlots.join(' | ')}`,
    `Alasan: ${pb.optimalSchedule.rationale}`,
    '',
    '=== PINNED COMMENT ===',
    ...pb.engagementToolkit.pinnedComments.map((c, i) => `${i + 1}. ${c}`)
  ].join('\n');
}

function applyCritiqueToReedit(promptSuggestion: string) {
  regenPrompt.value = promptSuggestion;
  activeTab.value = 'reedit';
  noticeMsg.value = 'Saran perbaikan dari kritik sudah diisi ke kotak prompt. Klik "Regenerate" untuk membuat versi baru.';
}

function togglePreset(preset: PromptPresetItem) {
  const idx = selectedPresetCodes.value.indexOf(preset.code);
  if (idx >= 0) {
    selectedPresetCodes.value.splice(idx, 1);
  } else {
    selectedPresetCodes.value.push(preset.code);
    const snippet = preset.config?.promptText;
    if (snippet && !regenPrompt.value.includes(snippet)) {
      regenPrompt.value = regenPrompt.value.trim()
        ? `${regenPrompt.value.trim()}\n${snippet}`
        : snippet;
    }
  }
}

async function fetchClip() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<ClipDetailResponse>(`/api/clips/${clipId.value}`);
    clip.value = res.data;
    if (res.data?.activeVersionId) {
      selectedVersionId.value = res.data.activeVersionId;
    } else if (res.data?.versions?.[0]) {
      selectedVersionId.value = res.data.versions[0].id;
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memuat detail klip video.';
  } finally {
    loading.value = false;
  }
}

async function fetchPromptPresets() {
  try {
    const res = await apiRequest<PromptPresetItem[]>('/api/presets?category=prompt_preset&active=true');
    promptPresets.value = res.data ?? [];
  } catch {
    promptPresets.value = [];
  }
}

async function handleRegenerate() {
  errorMsg.value = '';
  noticeMsg.value = '';

  const subtitleOverrides: Array<{ index: number; text: string }> = [];
  for (const cue of selectedVersion.value?.cues ?? []) {
    const edited = editedCues.value[cue.index];
    if (typeof edited === 'string' && edited.trim() !== cue.text.trim()) {
      subtitleOverrides.push({ index: cue.index, text: edited.trim() });
    }
  }

  if (!regenPrompt.value.trim() && selectedPresetCodes.value.length === 0 && subtitleOverrides.length === 0) {
    errorMsg.value = 'Tulis prompt penyesuaian, pilih minimal 1 preset cepat, atau ubah teks subtitle terlebih dahulu.';
    return;
  }

  regenerating.value = true;
  try {
    const res = await apiRequest<{
      patchSummary: string;
      newVersionId: string;
      newVersionNumber: number;
      clip: ClipDetailResponse;
    }>(`/api/clips/${clipId.value}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({
        userPrompt: regenPrompt.value.trim(),
        presetCodes: selectedPresetCodes.value,
        subtitleOverrides: subtitleOverrides.length > 0 ? subtitleOverrides : undefined
      })
    });

    if (res.data) {
      clip.value = res.data.clip;
      selectedVersionId.value = res.data.newVersionId;
      regenPrompt.value = '';
      selectedPresetCodes.value = [];
      noticeMsg.value = `Versi v${res.data.newVersionNumber} selesai dirender: ${res.data.patchSummary}`;
      activeTab.value = 'score';
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal merender ulang versi baru.';
  } finally {
    regenerating.value = false;
  }
}

async function handleRollbackToSelected() {
  if (!selectedVersion.value) return;
  switchingVersion.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<ClipDetailResponse>(`/api/clips/${clipId.value}/active-version`, {
      method: 'PATCH',
      body: JSON.stringify({ versionId: selectedVersion.value.id })
    });
    clip.value = res.data;
    if (res.data?.activeVersionId) {
      selectedVersionId.value = res.data.activeVersionId;
    }
    noticeMsg.value = `Versi aktif berhasil dikembalikan ke v${selectedVersion.value.versionNumber}.`;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal mengganti versi aktif.';
  } finally {
    switchingVersion.value = false;
  }
}

async function handleToggleApproval() {
  if (!clip.value) return;
  savingApproval.value = true;
  errorMsg.value = '';
  try {
    const nextVal = !clip.value.isApproved;
    const res = await apiRequest<ClipDetailResponse>(`/api/clips/${clipId.value}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ isApproved: nextVal })
    });
    clip.value = res.data;
    noticeMsg.value = nextVal
      ? 'Klip ditandai sebagai Final (Siap Upload & Export).'
      : 'Tanda Final dilepas dari klip ini.';
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memperbarui status Final.';
  } finally {
    savingApproval.value = false;
  }
}

onMounted(async () => {
  await Promise.all([fetchClip(), fetchPromptPresets()]);
});
</script>

<template>
  <StudioShell>
    <div class="space-y-5 min-w-0">
      <!-- Header Navigasi & Aksi Cepat -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1 min-w-0">
          <NuxtLink
            v-if="clip"
            :to="`/campaigns/${clip.campaignId}/batches/${clip.batchId}`"
            class="inline-flex items-center gap-1.5 text-xs font-semibold studio-muted hover:underline"
          >
            <ArrowLeft class="w-3.5 h-3.5 shrink-0" />
            <span>Kembali ke Daftar Variasi Batch</span>
          </NuxtLink>
          <h1 class="studio-heading text-xl md:text-2xl font-bold break-words">
            {{ clip ? `Inspektor Klip: ${clip.angleTitle}` : 'Memuat Inspektor Klip...' }}
          </h1>
          <p v-if="clip?.targetConfig" class="text-xs studio-muted">
            {{ clip.campaignTitle }} | {{ clip.targetConfig.platform.toUpperCase() }} |
            Target {{ clip.targetConfig.countryCode }} ({{ clip.targetConfig.ageGroup }}) |
            {{ clip.targetConfig.personaNiche }}
          </p>
        </div>

        <div v-if="clip && selectedVersion" class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="studio-btn-secondary text-xs"
            :disabled="savingApproval"
            @click="handleToggleApproval"
          >
            <CheckCircle2 class="w-4 h-4" :style="clip.isApproved ? { color: 'var(--status-ok-fg)' } : {}" />
            <span>{{ clip.isApproved ? 'Ditandai Final' : 'Tandai Final' }}</span>
          </button>

          <a
            v-if="selectedVersion.hasVideo"
            :href="`/api/clips/${clip.id}/stream-video?versionId=${selectedVersion.id}&download=true`"
            class="studio-btn-primary text-xs"
          >
            <Download class="w-4 h-4" />
            <span>Unduh MP4 (v{{ selectedVersion.versionNumber }})</span>
          </a>
        </div>
      </div>

      <div v-if="errorMsg" class="p-3.5 rounded text-sm font-medium studio-badge-err">{{ errorMsg }}</div>
      <div v-if="noticeMsg" class="p-3.5 rounded text-sm font-medium studio-badge-ok">{{ noticeMsg }}</div>

      <div v-if="loading && !clip" class="studio-card p-8 text-center text-sm studio-muted">
        Sedang memuat detail klip, skor viral, dan Upload Playbook...
      </div>

      <!-- Layout 2 Kolom Inspektor -->
      <div v-else-if="clip && selectedVersion" class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- KOLOM KIRI: Video Player + Safe-Zone Overlay + Riwayat Versi -->
        <aside class="lg:col-span-5 space-y-4 min-w-0">
          <section class="studio-card overflow-hidden">
            <!-- Bar Kontrol Safe-Zone -->
            <div
              class="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              :style="{
                background: 'var(--bg-elevated)',
                borderBottom: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)'
              }"
            >
              <span class="inline-flex items-center gap-1.5 font-semibold">
                <Eye class="w-3.5 h-3.5" />
                <span>Overlay Safe-Zone</span>
              </span>
              <div class="inline-flex items-center gap-1" role="group" aria-label="Pilih overlay safe-zone">
                <button
                  type="button"
                  class="px-2.5 py-1.5 rounded text-[11px] font-semibold min-h-[34px]"
                  :aria-pressed="safeZoneMode === 'off'"
                  :style="safeZoneMode === 'off' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-surface)' }"
                  @click="safeZoneMode = 'off'"
                >
                  Off
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1.5 rounded text-[11px] font-semibold min-h-[34px]"
                  :aria-pressed="safeZoneMode === 'tiktok'"
                  :style="safeZoneMode === 'tiktok' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-surface)' }"
                  @click="safeZoneMode = 'tiktok'"
                >
                  TikTok
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1.5 rounded text-[11px] font-semibold min-h-[34px]"
                  :aria-pressed="safeZoneMode === 'youtube_shorts'"
                  :style="safeZoneMode === 'youtube_shorts' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-surface)' }"
                  @click="safeZoneMode = 'youtube_shorts'"
                >
                  YT Shorts
                </button>
              </div>
            </div>

            <!-- Stage Player -->
            <div class="bg-black flex items-center justify-center p-2">
              <div
                class="relative w-full overflow-hidden flex items-center justify-center bg-black"
                :class="selectedVersion.edl?.aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16] max-w-[310px]'"
              >
                <video
                  v-if="selectedVersion.hasVideo"
                  ref="videoEl"
                  :key="selectedVersion.id"
                  controls
                  playsinline
                  preload="metadata"
                  :poster="selectedVersion.hasCover ? `/api/clips/${clip.id}/cover?versionId=${selectedVersion.id}` : undefined"
                  :src="`/api/clips/${clip.id}/stream-video?versionId=${selectedVersion.id}`"
                  class="w-full h-full object-contain"
                />
                <SafeZoneOverlay :mode="safeZoneMode" />
              </div>
            </div>

            <!-- Strip Info Teknis Audio & Framing -->
            <div class="p-3.5 flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span class="px-2 py-1 rounded font-bold" style="background: var(--bg-elevated);">
                v{{ selectedVersion.versionNumber }} | {{ selectedVersion.actualDurationSec?.toFixed(1) ?? '-' }}s
              </span>
              <span
                class="px-2 py-1 rounded inline-flex items-center gap-1 font-semibold"
                style="background: var(--accent-soft-bg); color: var(--accent-soft-fg);"
              >
                <VolumeX v-if="selectedVersion.edl?.audio.muteOriginal" class="w-3.5 h-3.5" />
                <Volume2 v-else class="w-3.5 h-3.5" />
                <span>{{ audioBadgeLabel(selectedVersion.edl) }}</span>
              </span>
              <span v-if="selectedVersion.edl" class="px-2 py-1 rounded" style="background: var(--bg-elevated);">
                Framing: {{ selectedVersion.edl.framingMode }} | Sub: {{ selectedVersion.edl.captions.verticalOffsetPct }}%
              </span>
            </div>
          </section>

          <!-- Panel Riwayat Versi & Rollback -->
          <section class="studio-card p-4 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <h2 class="studio-heading text-sm font-bold inline-flex items-center gap-1.5">
                <History class="w-4 h-4" />
                <span>Riwayat Versi ({{ clip.versions.length }})</span>
              </h2>
              <button
                v-if="!isSelectedActive"
                type="button"
                class="studio-btn-primary text-xs !min-h-[36px] !py-1 !px-3"
                :disabled="switchingVersion"
                @click="handleRollbackToSelected"
              >
                <RotateCcw class="w-3.5 h-3.5" />
                <span>Jadikan Versi Aktif (Rollback)</span>
              </button>
            </div>

            <div class="space-y-2">
              <button
                v-for="ver in clip.versions"
                :key="ver.id"
                type="button"
                class="w-full text-left p-3 rounded transition flex flex-col gap-1"
                :style="{
                  background: selectedVersion.id === ver.id ? 'var(--accent-soft-bg)' : 'var(--bg-elevated)',
                  border: selectedVersion.id === ver.id
                    ? '1.5px solid var(--accent-bg)'
                    : '1px solid var(--border-color)'
                }"
                @click="selectedVersionId = ver.id"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-mono text-xs font-bold">v{{ ver.versionNumber }}</span>
                    <span
                      v-if="ver.id === clip.activeVersionId"
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase studio-badge-ok"
                    >
                      Aktif
                    </span>
                    <span class="text-[11px] studio-muted">{{ audioBadgeLabel(ver.edl) }}</span>
                  </div>
                  <span
                    class="px-2 py-0.5 rounded font-mono text-[11px] font-bold whitespace-nowrap"
                    :class="scoreBadgeClass(ver.viralScoreTotal)"
                  >
                    Skor {{ ver.viralScoreTotal ?? '-' }}
                  </span>
                </div>
                <p class="text-xs studio-muted line-clamp-2 break-words">
                  {{ ver.userPrompt || 'Generasi awal batch (v1)' }}
                </p>
              </button>
            </div>
          </section>
        </aside>

        <!-- KOLOM KANAN: 3 Tab Utama (Skor & Kritik | Upload Playbook | Re-Editor Prompt) -->
        <main class="lg:col-span-7 space-y-4 min-w-0">
          <!-- Bar Tab -->
          <div
            class="studio-card p-1.5 grid grid-cols-3 gap-1.5"
            role="tablist"
            aria-label="Navigasi inspeksi klip"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'score'"
              class="min-h-[44px] px-2 py-2 rounded text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition"
              :style="activeTab === 'score' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : {}"
              @click="activeTab = 'score'"
            >
              <Award class="w-4 h-4 shrink-0" />
              <span class="truncate">Skor & Kritik</span>
            </button>

            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'playbook'"
              class="min-h-[44px] px-2 py-2 rounded text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition"
              :style="activeTab === 'playbook' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : {}"
              @click="activeTab = 'playbook'"
            >
              <Music2 class="w-4 h-4 shrink-0" />
              <span class="hidden sm:inline">Upload Playbook</span>
              <span class="sm:hidden">Playbook</span>
            </button>

            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'reedit'"
              class="min-h-[44px] px-2 py-2 rounded text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition"
              :style="activeTab === 'reedit' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : {}"
              @click="activeTab = 'reedit'"
            >
              <SlidersHorizontal class="w-4 h-4 shrink-0" />
              <span class="truncate">Edit Ulang</span>
            </button>
          </div>

          <!-- ==================== TAB 1: SKOR VIRAL, DAMPAK & KRITIK ==================== -->
          <div v-if="activeTab === 'score'" class="space-y-4">
            <!-- Kartu Ringkasan Skor & Kepatuhan -->
            <section class="studio-card p-5 space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                  <div
                    class="w-20 h-20 rounded-lg flex flex-col items-center justify-center font-mono shrink-0"
                    :class="scoreBadgeClass(selectedVersion.viralScoreTotal)"
                  >
                    <span class="text-2xl font-extrabold leading-none">{{ selectedVersion.viralScoreTotal ?? '-' }}</span>
                    <span class="text-[10px] font-bold uppercase mt-1">/ 100</span>
                  </div>
                  <div class="space-y-1">
                    <h2 class="studio-heading text-lg font-bold">
                      Skor Potensi Viral (v{{ selectedVersion.versionNumber }})
                    </h2>
                    <div class="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        class="px-2 py-0.5 rounded font-bold uppercase inline-flex items-center gap-1"
                        :class="complianceBadgeClass(selectedVersion.briefCompliance)"
                      >
                        <ShieldCheck class="w-3.5 h-3.5" />
                        <span>Brief: {{ (selectedVersion.briefCompliance ?? 'warn').toUpperCase() }}</span>
                      </span>
                      <span
                        v-if="scoreDeltaFromV1 !== null"
                        class="px-2 py-0.5 rounded font-mono font-bold"
                        :class="scoreDeltaFromV1 >= 0 ? 'studio-badge-ok' : 'studio-badge-err'"
                      >
                        {{ scoreDeltaFromV1 >= 0 ? `+${scoreDeltaFromV1}` : scoreDeltaFromV1 }} vs v1
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 6 Dimensi Breakdown -->
              <div v-if="dimensionRows.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div
                  v-for="dim in dimensionRows"
                  :key="dim.key"
                  class="p-3 rounded space-y-1.5"
                  style="background: var(--bg-elevated);"
                >
                  <div class="flex items-center justify-between gap-2 text-xs font-bold">
                    <span>{{ dim.label }}</span>
                    <span class="font-mono">{{ dim.score }}/100</span>
                  </div>
                  <div class="h-1.5 w-full rounded overflow-hidden" style="background: var(--border-color);">
                    <div
                      class="h-full rounded"
                      :style="{ width: `${dim.score}%`, backgroundColor: 'var(--accent-bg)' }"
                    />
                  </div>
                  <p class="text-[11px] studio-muted leading-relaxed">{{ dim.note }}</p>
                </div>
              </div>
            </section>

            <!-- Checklist Kepatuhan Brief -->
            <section v-if="selectedVersion.briefChecklist.length > 0" class="studio-card p-5 space-y-3">
              <h3 class="studio-heading text-base font-bold">Audit Kepatuhan Brief Campaign</h3>
              <div class="space-y-2">
                <div
                  v-for="(item, idx) in selectedVersion.briefChecklist"
                  :key="idx"
                  class="p-3 rounded flex flex-wrap sm:flex-nowrap items-start justify-between gap-2"
                  style="background: var(--bg-elevated);"
                >
                  <div class="space-y-0.5 min-w-0">
                    <p class="text-xs font-bold">{{ item.rule }}</p>
                    <p class="text-xs studio-muted break-words">{{ item.evidence }}</p>
                  </div>
                  <span
                    class="px-2 py-0.5 rounded text-[11px] font-bold uppercase whitespace-nowrap shrink-0"
                    :class="complianceBadgeClass(item.status)"
                  >
                    {{ item.status }}
                  </span>
                </div>
              </div>
            </section>

            <!-- Proyeksi Dampak Saat Upload -->
            <section v-if="selectedVersion.projectedImpact" class="studio-card p-5 space-y-3">
              <h3 class="studio-heading text-base font-bold">Proyeksi Dampak Saat Upload ke Target Audiens</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div class="p-3 rounded space-y-1" style="background: var(--bg-elevated);">
                  <div class="font-bold">Daya Henti 0-3 Detik Pertama</div>
                  <p class="studio-muted leading-relaxed">{{ selectedVersion.projectedImpact.firstThreeSeconds }}</p>
                </div>
                <div class="p-3 rounded space-y-1" style="background: var(--bg-elevated);">
                  <div class="font-bold">Retensi Menonton Tengah Video</div>
                  <p class="studio-muted leading-relaxed">{{ selectedVersion.projectedImpact.midRetention }}</p>
                </div>
                <div class="p-3 rounded space-y-1" style="background: var(--bg-elevated);">
                  <div class="font-bold">Potensi Komentar, Save & Share</div>
                  <p class="studio-muted leading-relaxed">{{ selectedVersion.projectedImpact.commentSharePotential }}</p>
                </div>
                <div class="p-3 rounded space-y-1" style="background: var(--bg-elevated);">
                  <div class="font-bold">Ringkasan Reaksi Audiens</div>
                  <p class="studio-muted leading-relaxed">{{ selectedVersion.projectedImpact.audienceReactionSummary }}</p>
                </div>
              </div>
            </section>

            <!-- Kritik Spesifik + 1-Klik Perbaiki -->
            <section class="studio-card p-5 space-y-3">
              <h3 class="studio-heading text-base font-bold inline-flex items-center gap-1.5">
                <AlertTriangle class="w-4 h-4" />
                <span>Kritik & Saran Perbaikan Spesifik ({{ selectedVersion.critiques.length }})</span>
              </h3>

              <div class="space-y-3">
                <div
                  v-for="crit in selectedVersion.critiques"
                  :key="crit.id"
                  class="p-3.5 rounded space-y-2.5"
                  style="background: var(--bg-elevated);"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <span
                        class="px-2 py-0.5 rounded text-[11px] font-bold uppercase"
                        :class="
                          crit.severity === 'high'
                            ? 'studio-badge-err'
                            : crit.severity === 'medium'
                              ? 'studio-badge-warn'
                              : 'studio-badge-ok'
                        "
                      >
                        {{ crit.severity === 'high' ? 'Prioritas Tinggi' : crit.severity === 'medium' ? 'Perlu Perhatian' : 'Optimasi Opsional' }}
                      </span>

                      <button
                        v-if="typeof crit.timestampSec === 'number'"
                        type="button"
                        class="px-2 py-0.5 rounded font-mono text-[11px] font-bold inline-flex items-center gap-1 hover:underline"
                        style="background: var(--bg-surface); border: 1px solid var(--border-color);"
                        @click="seekTo(crit.timestampSec)"
                      >
                        <PlayCircle class="w-3.5 h-3.5" />
                        <span>Lompat ke {{ formatTime(crit.timestampSec) }}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      class="studio-btn-primary text-xs !min-h-[36px] !py-1 !px-3"
                      @click="applyCritiqueToReedit(crit.suggestedRegeneratePrompt)"
                    >
                      <Sparkles class="w-3.5 h-3.5" />
                      <span>Perbaiki dengan Prompt</span>
                    </button>
                  </div>

                  <p class="text-xs leading-relaxed">{{ crit.issue }}</p>
                  <p class="text-[11px] studio-muted italic">
                    Saran prompt: "{{ crit.suggestedRegeneratePrompt }}"
                  </p>
                </div>
              </div>
            </section>
          </div>

          <!-- ==================== TAB 2: UPLOAD PLAYBOOK ==================== -->
          <div v-else-if="activeTab === 'playbook' && selectedVersion.uploadPlaybook" class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="studio-heading text-base font-bold">Panduan Siap Upload (Sinkron Versi v{{ selectedVersion.versionNumber }})</h2>
              <button
                type="button"
                class="studio-btn-primary text-xs"
                @click="copyText('all_playbook', buildFullPlaybookText(selectedVersion.uploadPlaybook))"
              >
                <Check v-if="copiedKey === 'all_playbook'" class="w-4 h-4" />
                <ClipboardCopy v-else class="w-4 h-4" />
                <span>{{ copiedKey === 'all_playbook' ? 'Semua Playbook Tersalin!' : 'Salin Semua Playbook' }}</span>
              </button>
            </div>

            <!-- Panduan Audio & Backsound Musik -->
            <section
              class="studio-card p-5 space-y-2.5"
              style="border-left: 4px solid var(--accent-bg);"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="studio-heading text-sm font-bold inline-flex items-center gap-1.5">
                  <Music2 class="w-4 h-4" />
                  <span>Strategi Audio & Backsound Musik Platform</span>
                </h3>
                <span class="px-2.5 py-1 rounded text-xs font-bold" style="background: var(--accent-soft-bg); color: var(--accent-soft-fg);">
                  {{ selectedVersion.uploadPlaybook.audioMusicGuide.renderedAudioState }}
                </span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div class="p-2.5 rounded" style="background: var(--bg-elevated);">
                  <span class="studio-muted block text-[11px]">Rekomendasi Vibe Musik</span>
                  <span class="font-bold">{{ selectedVersion.uploadPlaybook.audioMusicGuide.recommendedMusicVibe }}</span>
                </div>
                <div class="p-2.5 rounded" style="background: var(--bg-elevated);">
                  <span class="studio-muted block text-[11px]">Rentang Tempo (BPM)</span>
                  <span class="font-bold font-mono">{{ selectedVersion.uploadPlaybook.audioMusicGuide.bpmRange }}</span>
                </div>
              </div>
              <p class="text-xs leading-relaxed">
                {{ selectedVersion.uploadPlaybook.audioMusicGuide.platformMixingInstruction }}
              </p>
            </section>

            <!-- Opsi Judul -->
            <section class="studio-card p-5 space-y-2.5">
              <h3 class="studio-heading text-sm font-bold">Opsi Judul / Hook Upload</h3>
              <div class="space-y-2">
                <div
                  v-for="(title, idx) in selectedVersion.uploadPlaybook.titleOptions"
                  :key="idx"
                  class="p-2.5 rounded flex items-center justify-between gap-2 text-xs"
                  style="background: var(--bg-elevated);"
                >
                  <span class="font-medium break-words">{{ idx + 1 }}. {{ title }}</span>
                  <button
                    type="button"
                    class="studio-btn-secondary !min-h-[34px] !px-2.5 text-[11px] shrink-0"
                    @click="copyText(`title_${idx}`, title)"
                  >
                    <Check v-if="copiedKey === `title_${idx}`" class="w-3.5 h-3.5" />
                    <ClipboardCopy v-else class="w-3.5 h-3.5" />
                    <span>{{ copiedKey === `title_${idx}` ? 'Tersalin' : 'Salin' }}</span>
                  </button>
                </div>
              </div>
            </section>

            <!-- Caption & Hashtag -->
            <section class="studio-card p-5 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <h3 class="studio-heading text-sm font-bold">Caption & Deskripsi Siap Tempel</h3>
                <button
                  type="button"
                  class="studio-btn-secondary !min-h-[36px] text-xs"
                  @click="copyText('caption', selectedVersion.uploadPlaybook.captionDescription)"
                >
                  <Check v-if="copiedKey === 'caption'" class="w-3.5 h-3.5" />
                  <ClipboardCopy v-else class="w-3.5 h-3.5" />
                  <span>{{ copiedKey === 'caption' ? 'Tersalin' : 'Salin Caption' }}</span>
                </button>
              </div>
              <pre
                class="p-3 rounded text-xs whitespace-pre-wrap break-words font-sans leading-relaxed"
                style="background: var(--bg-elevated);"
              >{{ selectedVersion.uploadPlaybook.captionDescription }}</pre>

              <div class="space-y-2 pt-1">
                <div class="text-xs font-bold">Grup Hashtag Bertingkat</div>
                <div class="flex flex-wrap gap-1.5 text-xs">
                  <span
                    v-for="tag in selectedVersion.uploadPlaybook.hashtags.mandatory"
                    :key="`m_${tag}`"
                    class="px-2 py-1 rounded font-mono font-bold studio-badge-ok"
                  >
                    {{ tag }} (Wajib)
                  </span>
                  <span
                    v-for="tag in selectedVersion.uploadPlaybook.hashtags.niche"
                    :key="`n_${tag}`"
                    class="px-2 py-1 rounded font-mono"
                    style="background: var(--accent-soft-bg); color: var(--accent-soft-fg);"
                  >
                    {{ tag }}
                  </span>
                  <span
                    v-for="tag in selectedVersion.uploadPlaybook.hashtags.broad"
                    :key="`b_${tag}`"
                    class="px-2 py-1 rounded font-mono"
                    style="background: var(--bg-elevated);"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
            </section>

            <!-- Jadwal Tayang Optimal & Engagement 15 Menit -->
            <section class="studio-card p-5 space-y-3">
              <h3 class="studio-heading text-sm font-bold inline-flex items-center gap-1.5">
                <Clock class="w-4 h-4" />
                <span>Jadwal Tayang Optimal ({{ selectedVersion.uploadPlaybook.optimalSchedule.timezone }})</span>
              </h3>
              <div class="flex flex-wrap gap-2 text-xs">
                <span class="px-2.5 py-1 rounded font-semibold" style="background: var(--bg-elevated);">
                  Hari: {{ selectedVersion.uploadPlaybook.optimalSchedule.bestDays.join(', ') }}
                </span>
                <span class="px-2.5 py-1 rounded font-mono font-bold" style="background: var(--accent-soft-bg); color: var(--accent-soft-fg);">
                  Jam: {{ selectedVersion.uploadPlaybook.optimalSchedule.bestTimeSlots.join(' | ') }}
                </span>
              </div>
              <p class="text-xs studio-muted leading-relaxed">
                {{ selectedVersion.uploadPlaybook.optimalSchedule.rationale }}
              </p>

              <div class="pt-2 space-y-2">
                <div class="text-xs font-bold">Pinned Comment Siap Pakai</div>
                <div
                  v-for="(pc, idx) in selectedVersion.uploadPlaybook.engagementToolkit.pinnedComments"
                  :key="idx"
                  class="p-2.5 rounded flex items-center justify-between gap-2 text-xs"
                  style="background: var(--bg-elevated);"
                >
                  <span class="break-words">{{ pc }}</span>
                  <button
                    type="button"
                    class="studio-btn-secondary !min-h-[34px] !px-2.5 text-[11px] shrink-0"
                    @click="copyText(`pin_${idx}`, pc)"
                  >
                    {{ copiedKey === `pin_${idx}` ? 'Tersalin' : 'Salin' }}
                  </button>
                </div>
              </div>

              <div class="pt-1 space-y-1.5">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-xs font-bold">Checklist 15 Menit Pertama Setelah Upload</span>
                  <button
                    type="button"
                    class="text-xs font-semibold hover:underline inline-flex items-center gap-1"
                    style="color: var(--accent-bg);"
                    @click="seekTo(selectedVersion.uploadPlaybook.engagementToolkit.coverFrameSec)"
                  >
                    <PlayCircle class="w-3.5 h-3.5" />
                    <span>Lihat Rekomendasi Frame Cover ({{ selectedVersion.uploadPlaybook.engagementToolkit.coverFrameSec.toFixed(1) }}s)</span>
                  </button>
                </div>
                <ul class="list-disc pl-5 text-xs studio-muted space-y-1">
                  <li v-for="(step, idx) in selectedVersion.uploadPlaybook.engagementToolkit.first15MinChecklist" :key="idx">
                    {{ step }}
                  </li>
                </ul>
              </div>
            </section>
          </div>

          <!-- ==================== TAB 3: EDIT ULANG / REGENERATE PROMPT ==================== -->
          <div v-else-if="activeTab === 'reedit'" class="space-y-4">
            <section class="studio-card p-5 space-y-4">
              <div class="space-y-1">
                <h2 class="studio-heading text-base font-bold">
                  Edit Ulang Spesifik Klip Ini (Akan Disimpan sebagai v{{ nextVersionNumber }})
                </h2>
                <p class="text-xs studio-muted leading-relaxed">
                  Revisi hanya diterapkan pada klip ini tanpa menimpa versi sebelumnya. Jika suara asli di-mute atau dikecilkan, Upload Playbook akan ikut disinkronkan otomatis.
                </p>
              </div>

              <!-- Quick-Action Presets dari Master Presets -->
              <div v-if="promptPresets.length > 0" class="space-y-2">
                <div class="text-xs font-bold">Preset Cepat Lapangan (Klik 1 atau Lebih)</div>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="preset in promptPresets"
                    :key="preset.id"
                    type="button"
                    class="px-3 py-2 rounded text-xs font-semibold text-left min-h-[40px] transition"
                    :style="
                      selectedPresetCodes.includes(preset.code)
                        ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)', border: '1.5px solid var(--accent-bg)' }
                        : { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }
                    "
                    @click="togglePreset(preset)"
                  >
                    {{ preset.labelId }}
                  </button>
                </div>
              </div>

              <!-- Prompt Penyesuaian Bebas -->
              <div class="space-y-1.5">
                <label for="regen-prompt" class="text-xs font-bold block">
                  Prompt Penyesuaian Video Ini
                </label>
                <textarea
                  id="regen-prompt"
                  v-model="regenPrompt"
                  rows="4"
                  class="studio-input text-sm leading-relaxed"
                  placeholder="Contoh: Suara audio asli belum sesuai brief, tolong mute total 0% karena akan diganti sound musik TikTok, naikkan subtitle ke area aman, dan tambah CTA brief di akhir."
                />
              </div>

              <!-- Inline Subtitle Editor (Opsional) -->
              <div
                class="rounded p-3.5 space-y-2.5"
                style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-bold">
                    Editor Teks Subtitle Inline ({{ selectedVersion.cues.length }} Baris)
                  </span>
                  <button
                    type="button"
                    class="text-xs font-semibold hover:underline"
                    style="color: var(--accent-bg);"
                    @click="showSubtitleEditor = !showSubtitleEditor"
                  >
                    {{ showSubtitleEditor ? 'Sembunyikan' : 'Koreksi Typo Subtitle' }}
                  </button>
                </div>

                <div v-if="showSubtitleEditor" class="space-y-2 max-h-60 overflow-y-auto pr-1">
                  <div
                    v-for="cue in selectedVersion.cues"
                    :key="cue.index"
                    class="flex items-center gap-2"
                  >
                    <button
                      type="button"
                      class="font-mono text-[11px] px-2 py-1 rounded shrink-0"
                      style="background: var(--bg-surface); border: 1px solid var(--border-color);"
                      @click="seekTo(cue.startSec)"
                    >
                      {{ cue.startSec.toFixed(1) }}s
                    </button>
                    <input
                      v-model="editedCues[cue.index]"
                      type="text"
                      class="studio-input !min-h-[38px] text-xs"
                    />
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span class="text-xs studio-muted">
                  Versi dasar: v{{ selectedVersion.versionNumber }} | Output baru: v{{ nextVersionNumber }}
                </span>
                <button
                  type="button"
                  class="studio-btn-primary text-sm"
                  :disabled="regenerating"
                  @click="handleRegenerate"
                >
                  <Sparkles class="w-4 h-4" />
                  <span>{{ regenerating ? `Merender Versi v${nextVersionNumber}...` : `Regenerate Versi v${nextVersionNumber}` }}</span>
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  </StudioShell>
</template>
