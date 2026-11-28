<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type {
  EdlDocument,
  PatchChangeItem,
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
  Eye,
  Film,
  Camera,
  Star,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Trash2
} from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import SafeZoneOverlay from '~/components/studio/SafeZoneOverlay.vue';
import FrameAnnotationOverlay, { type FrameAnnotationPin } from '~/components/studio/FrameAnnotationOverlay.vue';
import VisualTimelineEditor, { type SourceMediaInfo } from '~/components/studio/VisualTimelineEditor.vue';
import CriticCouncilPanel from '~/components/studio/CriticCouncilPanel.vue';
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
  sourceMediaList?: SourceMediaInfo[];
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

interface CoverCandidateRow {
  index: number;
  timestampSec: number;
  score: number;
  isRecommended: boolean;
  sharpnessScore: number;
  brightnessScore: number;
  subjectScore: number;
  imageUrl: string;
  downloadHdUrl: string;
  downloadYtUrl: string;
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

const activeTab = ref<'score' | 'playbook' | 'reedit' | 'timeline'>('score');
const safeZoneMode = ref<'off' | 'tiktok' | 'youtube_shorts'>('off');
const videoEl = ref<HTMLVideoElement | null>(null);
const currentTimeSec = ref(0);
const copiedKey = ref('');

const regenPrompt = ref('');
const selectedPresetCodes = ref<string[]>([]);
const showSubtitleEditor = ref(false);
const editedCues = ref<Record<number, string>>({});
const previewingPatch = ref(false);
const patchVerification = ref<{
  status: 'preview' | 'applied';
  patchSummary: string;
  patchMode: string;
  hasEffectiveChange: boolean;
  appliedChanges: PatchChangeItem[];
  hallucinationWarnings: string[];
} | null>(null);

const coverCacheKey = ref(Date.now());
const coverCandidates = ref<CoverCandidateRow[]>([]);
const scanningCovers = ref(false);
const savingCover = ref(false);
const activeCoverTs = ref<number | null>(null);

const annotations = ref<FrameAnnotationPin[]>([]);
const pinMode = ref(false);
const draftPin = ref<{ xPct: number; yPct: number; timestampSec: number } | null>(null);
const draftPinCategory = ref<'visual' | 'subtitle' | 'audio' | 'hook'>('visual');
const draftPinNote = ref('');
const savingPin = ref(false);

const openAnnotations = computed(() => annotations.value.filter((a) => a.status === 'open'));

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
  coverCandidates.value = [];
  activeCoverTs.value = null;
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
  const clamped = Math.max(0, sec);
  videoEl.value.currentTime = clamped;
  currentTimeSec.value = clamped;
  videoEl.value.play().catch(() => {
    // Abaikan autoplay block browser
  });
}

function onVideoTimeUpdate() {
  if (!videoEl.value) return;
  currentTimeSec.value = videoEl.value.currentTime || 0;
}

function onTimelineRendered(payload: {
  summary: string;
  newVersionId: string;
  newVersionNumber: number;
  clip: unknown;
}) {
  clip.value = payload.clip as ClipDetailResponse;
  selectedVersionId.value = payload.newVersionId;
  currentTimeSec.value = 0;
  noticeMsg.value = `Versi v${payload.newVersionNumber} selesai dirender dari Visual Timeline: ${payload.summary}`;
  activeTab.value = 'score';
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
  noticeMsg.value = 'Saran perbaikan dari kritik sudah diisi ke kotak prompt. Klik "Cek Rencana Patch" atau "Regenerate" untuk membuat versi baru.';
}

function handleApplyCriticCouncilPrompt(payload: { prompt: string; presetCodes: string[] }) {
  regenPrompt.value = payload.prompt;
  selectedPresetCodes.value = Array.from(new Set([...selectedPresetCodes.value, ...payload.presetCodes]));
  patchVerification.value = null;
  noticeMsg.value = 'Solusi Dewan Kritikus sudah dimasukkan ke kotak prompt. Klik "Cek Rencana Patch" untuk memverifikasi perubahan nyata sebelum render.';
}

function collectSubtitleOverrides(): Array<{ index: number; text: string }> {
  const subtitleOverrides: Array<{ index: number; text: string }> = [];
  for (const cue of selectedVersion.value?.cues ?? []) {
    const edited = editedCues.value[cue.index];
    if (typeof edited === 'string' && edited.trim() !== cue.text.trim()) {
      subtitleOverrides.push({ index: cue.index, text: edited.trim() });
    }
  }
  return subtitleOverrides;
}

async function handlePreviewPatch() {
  errorMsg.value = '';
  const subtitleOverrides = collectSubtitleOverrides();
  if (!regenPrompt.value.trim() && selectedPresetCodes.value.length === 0 && subtitleOverrides.length === 0) {
    errorMsg.value = 'Tulis prompt penyesuaian atau pilih minimal 1 preset sebelum memeriksa rencana patch.';
    return;
  }

  previewingPatch.value = true;
  try {
    const res = await apiRequest<{
      patchSummary: string;
      patchMode: string;
      hasEffectiveChange: boolean;
      appliedChanges: PatchChangeItem[];
      hallucinationWarnings: string[];
    }>(`/api/clips/${clipId.value}/preview-patch`, {
      method: 'POST',
      body: JSON.stringify({
        userPrompt: regenPrompt.value.trim(),
        presetCodes: selectedPresetCodes.value,
        subtitleOverrides: subtitleOverrides.length > 0 ? subtitleOverrides : undefined
      })
    });
    if (res.data) {
      patchVerification.value = {
        status: 'preview',
        ...res.data
      };
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memeriksa rencana patch.';
  } finally {
    previewingPatch.value = false;
  }
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

  const subtitleOverrides = collectSubtitleOverrides();

  if (!regenPrompt.value.trim() && selectedPresetCodes.value.length === 0 && subtitleOverrides.length === 0) {
    errorMsg.value = 'Tulis prompt penyesuaian, pilih minimal 1 preset cepat, atau ubah teks subtitle terlebih dahulu.';
    return;
  }

  regenerating.value = true;
  try {
    const res = await apiRequest<{
      patchSummary: string;
      patchMode: string;
      appliedChanges: PatchChangeItem[];
      hallucinationWarnings: string[];
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
      patchVerification.value = {
        status: 'applied',
        patchSummary: res.data.patchSummary,
        patchMode: res.data.patchMode,
        hasEffectiveChange: true,
        appliedChanges: res.data.appliedChanges ?? [],
        hallucinationWarnings: res.data.hallucinationWarnings ?? []
      };
      noticeMsg.value = `Versi v${res.data.newVersionNumber} selesai dirender (${res.data.appliedChanges?.length ?? 0} perubahan terverifikasi): ${res.data.patchSummary}`;
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

async function handleScanCoverCandidates() {
  if (!selectedVersion.value) return;
  scanningCovers.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<{
      versionId: string;
      versionNumber: number;
      candidates: CoverCandidateRow[];
    }>(`/api/clips/${clipId.value}/cover-candidates?versionId=${selectedVersion.value.id}`);
    coverCandidates.value = res.data?.candidates ?? [];
    noticeMsg.value = `Berhasil memindai ${coverCandidates.value.length} kandidat sampul terbaik untuk v${selectedVersion.value.versionNumber}.`;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memindai kandidat sampul cover.';
  } finally {
    scanningCovers.value = false;
  }
}

async function handleApplyCover(timestampSec: number) {
  if (!selectedVersion.value) return;
  savingCover.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<{
      updated: boolean;
      timestampSec: number;
    }>(`/api/clips/${clipId.value}/cover`, {
      method: 'PATCH',
      body: JSON.stringify({
        versionId: selectedVersion.value.id,
        timestampSec: Math.max(0.05, timestampSec)
      })
    });
    if (res.data?.updated) {
      activeCoverTs.value = res.data.timestampSec;
      coverCacheKey.value = Date.now();
      selectedVersion.value.hasCover = true;
      noticeMsg.value = `Sampul cover v${selectedVersion.value.versionNumber} diperbarui dari detik ${res.data.timestampSec.toFixed(1)}s!`;
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memperbarui sampul cover.';
  } finally {
    savingCover.value = false;
  }
}

function stepFrame(deltaSec: number) {
  if (!videoEl.value) return;
  videoEl.value.pause();
  const maxDur = selectedVersion.value?.actualDurationSec ?? videoEl.value.duration ?? 60;
  const next = Math.min(Math.max(0, maxDur - 0.03), Math.max(0, (videoEl.value.currentTime || 0) + deltaSec));
  videoEl.value.currentTime = next;
  currentTimeSec.value = next;
}

function handleVideoPinClick(coords: { xPct: number; yPct: number }) {
  if (videoEl.value) {
    videoEl.value.pause();
    currentTimeSec.value = videoEl.value.currentTime || 0;
  }
  draftPin.value = {
    xPct: coords.xPct,
    yPct: coords.yPct,
    timestampSec: Math.round(currentTimeSec.value * 100) / 100
  };
}

function jumpToAnnotation(ann: FrameAnnotationPin) {
  if (videoEl.value) {
    videoEl.value.pause();
    videoEl.value.currentTime = ann.timestampSec;
    currentTimeSec.value = ann.timestampSec;
  }
}

async function fetchAnnotations() {
  try {
    const res = await apiRequest<FrameAnnotationPin[]>(`/api/clips/${clipId.value}/annotations`);
    annotations.value = res.data ?? [];
  } catch {
    annotations.value = [];
  }
}

async function handleSaveAnnotation() {
  if (!draftPin.value || draftPinNote.value.trim().length < 2) {
    errorMsg.value = 'Tuliskan catatan revisi minimal 2 karakter pada pin frame ini.';
    return;
  }
  savingPin.value = true;
  errorMsg.value = '';
  try {
    await apiRequest(`/api/clips/${clipId.value}/annotations`, {
      method: 'POST',
      body: JSON.stringify({
        versionId: selectedVersion.value?.id,
        timestampSec: draftPin.value.timestampSec,
        xPct: draftPin.value.xPct,
        yPct: draftPin.value.yPct,
        category: draftPinCategory.value,
        noteText: draftPinNote.value.trim()
      })
    });
    draftPin.value = null;
    draftPinNote.value = '';
    pinMode.value = false;
    noticeMsg.value = 'Pin catatan frame berhasil disimpan!';
    await fetchAnnotations();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menyimpan pin catatan.';
  } finally {
    savingPin.value = false;
  }
}

async function handleToggleAnnotationStatus(ann: FrameAnnotationPin) {
  const nextStatus = ann.status === 'resolved' ? 'open' : 'resolved';
  try {
    await apiRequest(`/api/annotations/${ann.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    });
    await fetchAnnotations();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memperbarui status pin.';
  }
}

async function handleDeleteAnnotation(ann: FrameAnnotationPin) {
  try {
    await apiRequest(`/api/annotations/${ann.id}`, { method: 'DELETE' });
    await fetchAnnotations();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menghapus pin catatan.';
  }
}

function compileAnnotationsToReedit() {
  if (openAnnotations.value.length === 0) return;
  const lines = openAnnotations.value.map(
    (a, idx) => `${idx + 1}. [Detik ${a.timestampSec.toFixed(1)}s | Titik ${a.xPct}%,${a.yPct}% | ${a.category}] ${a.noteText}`
  );
  regenPrompt.value = `Terapkan revisi berdasarkan catatan pin frame berikut:\n${lines.join('\n')}`;
  activeTab.value = 'reedit';
  noticeMsg.value = `${openAnnotations.value.length} catatan pin frame dikompilasi ke Tab Edit Prompt. Klik Regenerate untuk menerapkan!`;
}

onMounted(async () => {
  await Promise.all([fetchClip(), fetchPromptPresets(), fetchAnnotations()]);
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
            :href="`/api/clips/${clip.id}/download?type=mp4&versionId=${selectedVersion.id}`"
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
                  :poster="selectedVersion.hasCover ? `/api/clips/${clip.id}/cover?versionId=${selectedVersion.id}&cb=${coverCacheKey}` : undefined"
                  :src="`/api/clips/${clip.id}/stream-video?versionId=${selectedVersion.id}`"
                  class="w-full h-full object-contain"
                  @timeupdate="onVideoTimeUpdate"
                />
                <div
                  v-else
                  class="w-full h-full flex flex-col items-center justify-center p-5 text-center text-white space-y-2"
                >
                  <img
                    v-if="selectedVersion.hasCover"
                    :src="`/api/clips/${clip.id}/cover?versionId=${selectedVersion.id}`"
                    alt="Cover arsip klip"
                    class="w-36 rounded opacity-75 object-cover"
                  />
                  <p class="text-xs font-bold">Media MP4 Diarsipkan Ringan</p>
                  <p class="text-[11px] opacity-80 leading-relaxed">
                    Berkas video MP4 sudah dibersihkan untuk menghemat disk lokal, namun Skor Viral, Upload Playbook, Kalender, &amp; Laporan Excel tetap utuh di kanan.
                  </p>
                </div>
                <SafeZoneOverlay :mode="safeZoneMode" />
                <FrameAnnotationOverlay
                  :pin-mode="pinMode"
                  :current-time-sec="currentTimeSec"
                  :annotations="annotations"
                  :draft-pin="draftPin"
                  @pin-click="handleVideoPinClick"
                  @select-pin="jumpToAnnotation"
                />
              </div>
            </div>

            <!-- Bar Langkah Frame (-1/+1 Frame) & Mode Pin Catatan (M15) -->
            <div
              class="px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
              :style="{
                background: 'var(--bg-elevated)',
                borderTop: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)'
              }"
            >
              <div class="inline-flex items-center gap-1">
                <button
                  type="button"
                  class="px-2 py-1 rounded text-[11px] font-semibold min-h-[32px] inline-flex items-center gap-0.5"
                  style="background: var(--bg-surface); border: 1px solid var(--border-color);"
                  title="Mundur 1 frame (1/30 detik)"
                  @click="stepFrame(-1 / 30)"
                >
                  <ChevronLeft class="w-3.5 h-3.5" />
                  <span>-1f</span>
                </button>
                <span class="px-2 font-mono text-[11px] font-bold">{{ currentTimeSec.toFixed(2) }}s</span>
                <button
                  type="button"
                  class="px-2 py-1 rounded text-[11px] font-semibold min-h-[32px] inline-flex items-center gap-0.5"
                  style="background: var(--bg-surface); border: 1px solid var(--border-color);"
                  title="Maju 1 frame (1/30 detik)"
                  @click="stepFrame(1 / 30)"
                >
                  <span>+1f</span>
                  <ChevronRight class="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                class="px-2.5 py-1 rounded text-[11px] font-bold min-h-[34px] inline-flex items-center gap-1 transition"
                :aria-pressed="pinMode"
                :style="
                  pinMode
                    ? { background: '#f59e0b', color: '#0f172a' }
                    : { background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }
                "
                @click="pinMode = !pinMode; if (!pinMode) draftPin = null"
              >
                <MapPin class="w-3.5 h-3.5" />
                <span>{{ pinMode ? 'Mode Pin AKTIF' : 'Pin Catatan Frame' }}</span>
              </button>
            </div>

            <!-- Form Mini Simpan Pin Catatan Saat Titik Frame Diklik -->
            <div
              v-if="draftPin"
              class="px-3.5 py-3 space-y-2 text-xs"
              style="background: var(--accent-soft-bg); border-top: 1px solid var(--accent-bg);"
            >
              <div class="flex items-center justify-between gap-2 font-mono text-[11px] font-bold">
                <span>Pin Baru @ {{ draftPin.timestampSec.toFixed(2) }}s (X:{{ draftPin.xPct }}%, Y:{{ draftPin.yPct }}%)</span>
                <button type="button" class="underline" @click="draftPin = null">Batal</button>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <select v-model="draftPinCategory" class="studio-input !min-h-[36px] text-xs py-1">
                  <option value="visual">Visual</option>
                  <option value="subtitle">Subtitle</option>
                  <option value="audio">Audio</option>
                  <option value="hook">Hook</option>
                </select>
                <input
                  id="ann-note"
                  v-model="draftPinNote"
                  type="text"
                  maxlength="380"
                  placeholder="Tulis catatan perbaikan di titik ini..."
                  class="col-span-2 studio-input !min-h-[36px] text-xs"
                />
              </div>
              <button
                type="button"
                class="studio-btn-primary w-full text-xs !min-h-[38px]"
                :disabled="savingPin"
                @click="handleSaveAnnotation"
              >
                <MapPin class="w-3.5 h-3.5" />
                <span>{{ savingPin ? 'Menyimpan Pin...' : 'Simpan Pin Catatan' }}</span>
              </button>
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

            <!-- Paket Unduh Satuan Lengkap (M9) -->
            <div
              class="px-3.5 pb-3.5 pt-2.5 space-y-2"
              :style="{ borderTop: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)' }"
            >
              <div class="text-xs font-bold">Paket Unduh Satuan (v{{ selectedVersion.versionNumber }})</div>
              <div class="grid grid-cols-2 gap-2">
                <a
                  v-if="selectedVersion.hasVideo"
                  :href="`/api/clips/${clip.id}/download?type=mp4&versionId=${selectedVersion.id}`"
                  class="studio-btn-secondary text-xs !min-h-[40px]"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>Video (.mp4)</span>
                </a>
                <a
                  :href="`/api/clips/${clip.id}/download?type=playbook&versionId=${selectedVersion.id}`"
                  class="studio-btn-secondary text-xs !min-h-[40px]"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>Playbook (.txt)</span>
                </a>
                <a
                  :href="`/api/clips/${clip.id}/download?type=srt&versionId=${selectedVersion.id}`"
                  class="studio-btn-secondary text-xs !min-h-[40px]"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>Subtitle (.srt)</span>
                </a>
                <a
                  v-if="selectedVersion.hasCover"
                  :href="`/api/clips/${clip.id}/download?type=cover&versionId=${selectedVersion.id}`"
                  class="studio-btn-secondary text-xs !min-h-[40px]"
                >
                  <Download class="w-3.5 h-3.5" />
                  <span>Cover (.jpg)</span>
                </a>
              </div>
            </div>
          </section>

          <!-- Panel Pemilih Sampul / Cover Frame Selector (M13) -->
          <section class="studio-card p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="studio-heading text-sm font-bold inline-flex items-center gap-1.5">
                <Camera class="w-4 h-4" style="color: var(--accent-bg);" />
                <span>Pemilih Sampul / Cover Terbaik</span>
              </h2>
              <div class="flex items-center gap-1.5">
                <span
                  v-if="activeCoverTs !== null"
                  class="px-2 py-0.5 rounded font-mono text-[11px] font-bold studio-badge-ok"
                >
                  Aktif: {{ activeCoverTs.toFixed(1) }}s
                </span>
                <a
                  v-if="selectedVersion.hasCover"
                  :href="`/api/clips/${clip.id}/download?type=cover&versionId=${selectedVersion.id}`"
                  class="px-2 py-1 rounded text-[11px] font-bold inline-flex items-center gap-1"
                  style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
                  title="Unduh cover aktif saat ini (.jpg)"
                >
                  <Download class="w-3 h-3" />
                  <span>Unduh Aktif</span>
                </a>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                class="studio-btn-primary text-xs !min-h-[40px]"
                :disabled="!selectedVersion.hasVideo || scanningCovers || savingCover"
                @click="handleScanCoverCandidates"
              >
                <Sparkles class="w-3.5 h-3.5" />
                <span>{{ scanningCovers ? 'Memindai 6 Frame...' : 'Pindai 6 Kandidat Cover' }}</span>
              </button>

              <button
                type="button"
                class="studio-btn-secondary text-xs !min-h-[40px]"
                :disabled="!selectedVersion.hasVideo || savingCover"
                @click="handleApplyCover(Math.max(0.1, currentTimeSec))"
              >
                <Camera class="w-3.5 h-3.5" />
                <span>Pakai Frame Playhead ({{ currentTimeSec.toFixed(1) }}s)</span>
              </button>
            </div>

            <p v-if="coverCandidates.length === 0" class="text-[11px] studio-muted leading-relaxed">
              Pindai otomatis 6 momen terbaik berdasarkan ketajaman, pencahayaan, dan fokus wajah, atau geser pemutar video lalu jadikan frame saat ini sebagai cover unduhan (.jpg) &amp; paket ZIP.
            </p>

            <div v-else class="grid grid-cols-3 gap-2">
              <div
                v-for="cand in coverCandidates"
                :key="cand.index"
                class="rounded overflow-hidden flex flex-col"
                :style="{
                  background: 'var(--bg-elevated)',
                  border: activeCoverTs === cand.timestampSec
                    ? '2.5px solid var(--accent-bg)'
                    : '1.5px solid var(--border-color)'
                }"
              >
                <button
                  type="button"
                  class="group relative w-full overflow-hidden text-left transition focus:outline-none"
                  :class="selectedVersion.edl?.aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'"
                  :disabled="savingCover"
                  :title="`Jadikan frame detik ${cand.timestampSec.toFixed(1)}s sebagai cover aktif (Skor ${cand.score})`"
                  @click="handleApplyCover(cand.timestampSec)"
                >
                  <img
                    :src="cand.imageUrl"
                    :alt="`Kandidat cover detik ${cand.timestampSec.toFixed(1)}s`"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span
                    v-if="cand.isRecommended"
                    class="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase inline-flex items-center gap-0.5 bg-amber-400 text-slate-950"
                  >
                    <Star class="w-2.5 h-2.5 fill-current" />
                    <span>TOP</span>
                  </span>
                  <div class="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-black/75 text-white flex items-center justify-between text-[10px] font-mono">
                    <span>{{ cand.timestampSec.toFixed(1) }}s</span>
                    <span class="font-bold">{{ cand.score }}pt</span>
                  </div>
                </button>
                <div class="grid grid-cols-2 divide-x text-[10px] font-bold" style="border-top: 1px solid var(--border-color);">
                  <a
                    :href="cand.downloadHdUrl"
                    download
                    class="py-1.5 px-1 inline-flex items-center justify-center gap-0.5 hover:underline"
                    title="Unduh frame kandidat ini resolusi penuh (HD JPG)"
                  >
                    <Download class="w-2.5 h-2.5 shrink-0" />
                    <span>HD</span>
                  </a>
                  <a
                    :href="cand.downloadYtUrl"
                    download
                    class="py-1.5 px-1 inline-flex items-center justify-center gap-0.5 hover:underline"
                    title="Unduh sebagai Thumbnail YouTube 16:9 (1280x720 JPG)"
                  >
                    <Download class="w-2.5 h-2.5 shrink-0" />
                    <span>YT 16:9</span>
                  </a>
                </div>
              </div>
            </div>
          </section>

          <!-- Panel Catatan Pin Frame Interaktif (M15) -->
          <section class="studio-card p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="studio-heading text-sm font-bold inline-flex items-center gap-1.5">
                <MapPin class="w-4 h-4" style="color: var(--accent-bg);" />
                <span>Catatan Pin Frame ({{ openAnnotations.length }} Aktif)</span>
              </h2>
              <button
                v-if="openAnnotations.length > 0"
                type="button"
                class="studio-btn-primary !min-h-[34px] !px-2.5 text-[11px]"
                @click="compileAnnotationsToReedit"
              >
                <Sparkles class="w-3.5 h-3.5" />
                <span>Terapkan ke Edit Prompt</span>
              </button>
            </div>

            <p v-if="annotations.length === 0" class="text-[11px] studio-muted leading-relaxed">
              Aktifkan <strong>Pin Catatan Frame</strong> di bawah pemutar video, lalu klik langsung titik pada frame untuk menandai revisi presisi (seperti teks tertutup tombol atau perbaikan hook).
            </p>

            <div v-else class="space-y-2">
              <div
                v-for="(ann, idx) in annotations"
                :key="ann.id"
                class="p-2.5 rounded space-y-1.5 text-xs"
                style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
              >
                <div class="flex flex-wrap items-center justify-between gap-1.5">
                  <button
                    type="button"
                    class="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold hover:underline"
                    @click="jumpToAnnotation(ann)"
                  >
                    <span
                      class="w-4 h-4 rounded-full text-[9px] text-white inline-flex items-center justify-center"
                      :style="{ backgroundColor: ann.status === 'resolved' ? '#10b981' : '#f43f5e' }"
                    >
                      {{ idx + 1 }}
                    </span>
                    <span>{{ ann.timestampSec.toFixed(1) }}s ({{ ann.xPct }}%, {{ ann.yPct }}%)</span>
                  </button>

                  <div class="inline-flex items-center gap-1">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase" style="background: var(--bg-surface);">
                      {{ ann.category }}
                    </span>
                    <button
                      type="button"
                      class="px-2 py-0.5 rounded text-[10px] font-bold"
                      :class="ann.status === 'resolved' ? 'studio-badge-ok' : 'studio-badge-warn'"
                      @click="handleToggleAnnotationStatus(ann)"
                    >
                      {{ ann.status === 'resolved' ? 'Selesai' : 'Tandai Selesai' }}
                    </button>
                    <button
                      type="button"
                      class="p-1 rounded studio-muted hover:text-rose-500"
                      aria-label="Hapus catatan pin"
                      @click="handleDeleteAnnotation(ann)"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p class="text-xs leading-snug break-words" :class="ann.status === 'resolved' ? 'line-through studio-muted' : ''">
                  {{ ann.noteText }}
                </p>
              </div>
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
          <!-- Bar Tab (4 Tab: Skor | Playbook | Edit Prompt | Timeline Visual) -->
          <div
            class="studio-card p-1.5 grid grid-cols-4 gap-1"
            role="tablist"
            aria-label="Navigasi inspeksi klip"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'score'"
              class="min-h-[44px] px-1.5 py-2 rounded text-[11px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 transition"
              :style="activeTab === 'score' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : {}"
              @click="activeTab = 'score'"
            >
              <Award class="w-3.5 h-3.5 shrink-0" />
              <span class="hidden sm:inline">Skor &amp; Kritik</span>
              <span class="sm:hidden">Skor</span>
            </button>

            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'playbook'"
              class="min-h-[44px] px-1.5 py-2 rounded text-[11px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 transition"
              :style="activeTab === 'playbook' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : {}"
              @click="activeTab = 'playbook'"
            >
              <Music2 class="w-3.5 h-3.5 shrink-0" />
              <span class="hidden sm:inline">Upload Playbook</span>
              <span class="sm:hidden">Playbook</span>
            </button>

            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'reedit'"
              class="min-h-[44px] px-1.5 py-2 rounded text-[11px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 transition"
              :style="activeTab === 'reedit' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : {}"
              @click="activeTab = 'reedit'"
            >
              <SlidersHorizontal class="w-3.5 h-3.5 shrink-0" />
              <span class="hidden sm:inline">Edit Prompt</span>
              <span class="sm:hidden">Prompt</span>
            </button>

            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'timeline'"
              class="min-h-[44px] px-1.5 py-2 rounded text-[11px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 transition"
              :style="activeTab === 'timeline' ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : {}"
              @click="activeTab = 'timeline'"
            >
              <Film class="w-3.5 h-3.5 shrink-0" />
              <span class="hidden sm:inline">Timeline Visual</span>
              <span class="sm:hidden">Timeline</span>
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
            <CriticCouncilPanel
              :clip-id="clip.id"
              :version-id="selectedVersion.id"
              @apply-prompt="handleApplyCriticCouncilPrompt"
              @seek="seekTo"
            />

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
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="studio-btn-secondary text-xs"
                    :disabled="previewingPatch || regenerating"
                    @click="handlePreviewPatch"
                  >
                    <ShieldCheck class="w-4 h-4" />
                    <span>{{ previewingPatch ? 'Memverifikasi...' : 'Cek Rencana Patch (Anti-Halusinasi)' }}</span>
                  </button>
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
              </div>

              <!-- Verifikasi Perubahan Nyata (Before vs After Diff - Anti-Halusinasi M21) -->
              <div
                v-if="patchVerification"
                class="p-3.5 rounded space-y-2.5 text-xs"
                :style="{
                  background: 'var(--bg-elevated)',
                  border: patchVerification.hasEffectiveChange
                    ? '1.5px solid var(--status-ok-fg)'
                    : '1.5px solid var(--status-warn-fg)'
                }"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="font-extrabold inline-flex items-center gap-1.5">
                    <ShieldCheck class="w-4 h-4" />
                    <span>
                      {{
                        patchVerification.status === 'applied'
                          ? 'Verifikasi Perubahan Nyata (Sudah Dirender)'
                          : 'Pratinjau Rencana Patch (Dry-Run Anti-Halusinasi)'
                      }}
                    </span>
                  </span>
                  <span class="px-2 py-0.5 rounded font-mono text-[10px] font-bold studio-badge-ok">
                    {{ patchVerification.patchMode === 'ai' ? 'AI Grounded Patch' : 'Patch Deterministik' }}
                  </span>
                </div>

                <p class="studio-muted">{{ patchVerification.patchSummary }}</p>

                <div
                  v-if="patchVerification.hallucinationWarnings.length > 0"
                  class="p-2.5 rounded space-y-1 text-[11px] studio-badge-warn"
                >
                  <div class="font-bold">Catatan Penjaga Anti-Halusinasi:</div>
                  <ul class="list-disc pl-4 space-y-0.5">
                    <li v-for="(warn, wIdx) in patchVerification.hallucinationWarnings" :key="wIdx">{{ warn }}</li>
                  </ul>
                </div>

                <div v-if="patchVerification.appliedChanges.length > 0" class="space-y-1.5">
                  <div
                    v-for="(chg, cIdx) in patchVerification.appliedChanges"
                    :key="cIdx"
                    class="p-2 rounded text-[11px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                    style="background: var(--bg-surface); border: 1px solid var(--border-color);"
                  >
                    <span class="font-bold">{{ chg.label }}</span>
                    <span class="font-mono break-words">
                      <span class="studio-muted">{{ chg.before }}</span>
                      <span class="mx-1.5 font-extrabold">-&gt;</span>
                      <span>{{ chg.after }}</span>
                    </span>
                  </div>
                </div>
                <p v-else class="text-[11px] font-semibold studio-badge-warn p-2 rounded">
                  Belum ada perubahan nyata yang terdeteksi pada parameter EDL. Perjelas instruksi (contoh: "ubah colorGrade moody_cinema", "potong 1.5 detik awal", "percepat 1.15x", atau "mute 0%") sebelum klik Regenerate.
                </p>
              </div>
            </section>
          </div>

          <!-- ==================== TAB 4: VISUAL MULTI-TRACK TIMELINE (M12) ==================== -->
          <div v-else-if="activeTab === 'timeline' && selectedVersion.edl">
            <VisualTimelineEditor
              :clip-id="clip.id"
              :base-version-number="selectedVersion.versionNumber"
              :next-version-number="nextVersionNumber"
              :edl="selectedVersion.edl"
              :source-media-list="clip.sourceMediaList ?? []"
              :platform="clip.targetConfig?.platform ?? 'tiktok'"
              :current-time-sec="currentTimeSec"
              @seek="seekTo"
              @rendered="onTimelineRendered"
            />
          </div>
        </main>
      </div>
    </div>
  </StudioShell>
</template>
