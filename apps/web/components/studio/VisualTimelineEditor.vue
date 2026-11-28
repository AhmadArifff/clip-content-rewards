<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { EdlDocument, TargetConfig } from '@clip/shared';
import {
  Scissors,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Copy,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Type,
  Film,
  Subtitles,
  Play,
  Crosshair
} from 'lucide-vue-next';
import { apiRequest } from '~/composables/useApi';
import { useThemeStore } from '~/stores/theme';

export interface SourceMediaInfo {
  id: string;
  originalFilename: string;
  durationSec: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
}

const props = defineProps<{
  clipId: string;
  baseVersionNumber: number;
  nextVersionNumber: number;
  edl: EdlDocument;
  sourceMediaList: SourceMediaInfo[];
  platform: TargetConfig['platform'];
  currentTimeSec: number;
}>();

const emit = defineEmits<{
  seek: [sec: number];
  rendered: [payload: { summary: string; newVersionId: string; newVersionNumber: number; clip: unknown }];
}>();

const themeStore = useThemeStore();

function cloneEdl(src: EdlDocument): EdlDocument {
  return JSON.parse(JSON.stringify(src)) as EdlDocument;
}

const draft = ref<EdlDocument>(cloneEdl(props.edl));
const selectedSegIdx = ref(0);
const editNote = ref('');
const rendering = ref(false);
const autoTracking = ref(false);
const errorMsg = ref('');
const trackNotice = ref('');

watch(
  () => props.edl,
  (next) => {
    draft.value = cloneEdl(next);
    selectedSegIdx.value = 0;
    errorMsg.value = '';
    trackNotice.value = '';
  },
  { deep: false }
);

const mediaById = computed(() => {
  const map = new Map<string, SourceMediaInfo>();
  for (const m of props.sourceMediaList) map.set(m.id, m);
  return map;
});

const defaultSourceMedia = computed<SourceMediaInfo>(() => {
  return (
    props.sourceMediaList[0] ?? {
      id: draft.value.segments[0]?.mediaAssetId ?? '',
      originalFilename: 'video-sumber.mp4',
      durationSec: Math.max(5, ...draft.value.segments.map((s) => s.endSec)),
      width: 1280,
      height: 720,
      hasAudio: true
    }
  );
});

const segmentTimelineLayout = computed(() => {
  let cursor = 0;
  return draft.value.segments.map((seg, index) => {
    const dur = Math.max(0.4, Math.round((seg.endSec - seg.startSec) * 100) / 100);
    const outStart = Math.round(cursor * 100) / 100;
    cursor += dur;
    const outEnd = Math.round(cursor * 100) / 100;
    return { index, seg, dur, outStart, outEnd };
  });
});

const totalOutputDur = computed(() => {
  const sum = segmentTimelineLayout.value.reduce((acc, s) => acc + s.dur, 0);
  return Math.max(0.5, Math.round(sum * 100) / 100);
});

const playheadPct = computed(() => {
  const pct = (Math.max(0, props.currentTimeSec) / totalOutputDur.value) * 100;
  return Math.min(100, Math.max(0, pct));
});

const selectedSeg = computed(() => {
  const idx = Math.min(selectedSegIdx.value, Math.max(0, draft.value.segments.length - 1));
  return draft.value.segments[idx] ?? null;
});

const selectedSegSourceMaxDur = computed(() => {
  if (!selectedSeg.value) return defaultSourceMedia.value.durationSec;
  return mediaById.value.get(selectedSeg.value.mediaAssetId)?.durationSec ?? defaultSourceMedia.value.durationSec;
});

const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(props.edl));

const audioVolumePct = computed({
  get: () => (draft.value.audio.muteOriginal ? 0 : Math.round(draft.value.audio.originalVolume * 100)),
  set: (pct: number) => {
    const clamped = Math.max(0, Math.min(120, Math.round(pct)));
    const platformSound =
      props.platform === 'tiktok'
        ? ('tiktok_trending_overlay' as const)
        : props.platform === 'youtube_shorts'
          ? ('youtube_shorts_sound_overlay' as const)
          : ('none' as const);

    draft.value.audio.muteOriginal = clamped === 0;
    draft.value.audio.originalVolume = Math.round((clamped / 100) * 100) / 100;
    draft.value.audio.intendedPlatformSound = clamped < 90 ? platformSound : 'none';
  }
});

function pctOfTotal(sec: number): number {
  return Math.min(100, Math.max(0, (sec / totalOutputDur.value) * 100));
}

function handleRulerClick(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0) return;
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  emit('seek', Math.round(ratio * totalOutputDur.value * 100) / 100);
}

function selectSegment(index: number) {
  selectedSegIdx.value = index;
  const layout = segmentTimelineLayout.value[index];
  if (layout) emit('seek', layout.outStart);
}

function updateSelectedStart(val: number) {
  const seg = selectedSeg.value;
  if (!seg) return;
  const maxStart = Math.max(0, seg.endSec - 0.5);
  seg.startSec = Math.round(Math.min(maxStart, Math.max(0, val)) * 10) / 10;
}

function updateSelectedEnd(val: number) {
  const seg = selectedSeg.value;
  if (!seg) return;
  const minEnd = Math.min(selectedSegSourceMaxDur.value, seg.startSec + 0.5);
  seg.endSec = Math.round(Math.min(selectedSegSourceMaxDur.value, Math.max(minEnd, val)) * 10) / 10;
}

function handleSplitSelected() {
  const idx = selectedSegIdx.value;
  const seg = draft.value.segments[idx];
  const layout = segmentTimelineLayout.value[idx];
  if (!seg || !layout) return;

  const segDur = seg.endSec - seg.startSec;
  if (segDur < 0.95) {
    errorMsg.value = 'Durasi segmen minimal 1.0 detik untuk bisa dibelah menjadi 2 potongan.';
    return;
  }
  errorMsg.value = '';

  // Gunakan posisi playhead jika berada di dalam segmen terpilih, selain itu belah tepat di tengah
  let localOffset = segDur / 2;
  if (props.currentTimeSec > layout.outStart + 0.45 && props.currentTimeSec < layout.outEnd - 0.45) {
    localOffset = props.currentTimeSec - layout.outStart;
  }
  const splitPoint = Math.round((seg.startSec + localOffset) * 100) / 100;

  const firstHalf = { ...seg, endSec: splitPoint };
  const secondHalf = {
    ...seg,
    startSec: splitPoint,
    zoom: seg.zoom <= 1.02 ? 1.12 : 1.0
  };

  draft.value.segments.splice(idx, 1, firstHalf, secondHalf);
  selectedSegIdx.value = idx + 1;
}

function handleAddSegment() {
  errorMsg.value = '';
  const src = defaultSourceMedia.value;
  const last = draft.value.segments[draft.value.segments.length - 1];
  const dur = Math.min(2.0, Math.max(0.8, src.durationSec / 3));
  const startSec = last && last.endSec + dur <= src.durationSec ? last.endSec : 0;
  const endSec = Math.min(src.durationSec, Math.round((startSec + dur) * 100) / 100);

  draft.value.segments.push({
    mediaAssetId: src.id,
    startSec: Math.round(startSec * 100) / 100,
    endSec: Math.max(startSec + 0.5, endSec),
    zoom: 1.0,
    cropX: 'center'
  });
  selectedSegIdx.value = draft.value.segments.length - 1;
}

function handleDuplicateSelected() {
  const seg = selectedSeg.value;
  if (!seg) return;
  draft.value.segments.splice(selectedSegIdx.value + 1, 0, { ...seg });
  selectedSegIdx.value += 1;
}

function handleMoveSelected(dir: -1 | 1) {
  const idx = selectedSegIdx.value;
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= draft.value.segments.length) return;
  const [moved] = draft.value.segments.splice(idx, 1);
  draft.value.segments.splice(targetIdx, 0, moved);
  selectedSegIdx.value = targetIdx;
}

function handleDeleteSelected() {
  if (draft.value.segments.length <= 1) return;
  draft.value.segments.splice(selectedSegIdx.value, 1);
  selectedSegIdx.value = Math.max(0, selectedSegIdx.value - 1);
}

function getSegmentFocusX(seg: EdlDocument['segments'][number]): number {
  if (typeof seg.focusX === 'number' && Number.isFinite(seg.focusX)) {
    return Math.min(0.92, Math.max(0.08, seg.focusX));
  }
  if (seg.cropX === 'left') return 0.18;
  if (seg.cropX === 'right') return 0.82;
  return 0.5;
}

function onCropXChanged() {
  const seg = selectedSeg.value;
  if (!seg) return;
  seg.focusX = seg.cropX === 'left' ? 0.18 : seg.cropX === 'right' ? 0.82 : 0.5;
}

function updateSelectedFocusX(val: number) {
  const seg = selectedSeg.value;
  if (!seg) return;
  const clamped = Math.round(Math.min(0.92, Math.max(0.08, val)) * 100) / 100;
  seg.focusX = clamped;
  seg.cropX = clamped < 0.38 ? 'left' : clamped > 0.62 ? 'right' : 'center';
}

async function handleAutoTrackFocus() {
  errorMsg.value = '';
  trackNotice.value = '';
  autoTracking.value = true;
  try {
    const res = await apiRequest<{
      recommendedFramingMode: 'auto_face_track';
      segments: Array<{
        index: number;
        focusX: number;
        cropX: 'left' | 'center' | 'right';
        confidence: number;
        signalType: 'face_skin' | 'motion_edge' | 'balanced_center';
      }>;
    }>(`/api/clips/${props.clipId}/auto-track-crop`, {
      method: 'POST',
      body: JSON.stringify({
        segments: draft.value.segments.map((s) => ({
          mediaAssetId: s.mediaAssetId,
          startSec: s.startSec,
          endSec: s.endSec
        }))
      })
    });

    if (res.data?.segments?.length) {
      res.data.segments.forEach((tr) => {
        const seg = draft.value.segments[tr.index];
        if (seg) {
          seg.focusX = tr.focusX;
          seg.cropX = tr.cropX;
        }
      });
      draft.value.framingMode = 'auto_face_track';
      const faceCount = res.data.segments.filter((s) => s.signalType === 'face_skin').length;
      trackNotice.value =
        faceCount > 0
          ? `Fokus wajah/subjek terdeteksi otomatis pada ${res.data.segments.length} segmen (${faceCount} sinyal wajah). Framing diset ke Smart Auto-Track 9:16.`
          : `Fokus subjek aktif dipetakan pada ${res.data.segments.length} segmen. Framing diset ke Smart Auto-Track 9:16.`;
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memindai fokus subjek otomatis.';
  } finally {
    autoTracking.value = false;
  }
}

function handleResetDraft() {
  draft.value = cloneEdl(props.edl);
  selectedSegIdx.value = 0;
  editNote.value = '';
  errorMsg.value = '';
  trackNotice.value = '';
}

async function handleRenderTimeline() {
  errorMsg.value = '';
  rendering.value = true;
  try {
    const res = await apiRequest<{
      summary: string;
      newVersionId: string;
      newVersionNumber: number;
      clip: unknown;
    }>(`/api/clips/${props.clipId}/render-edl`, {
      method: 'POST',
      body: JSON.stringify({
        edl: draft.value,
        note: editNote.value.trim() || undefined
      })
    });

    if (res.data) {
      editNote.value = '';
      emit('rendered', res.data);
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal merender perubahan timeline.';
  } finally {
    rendering.value = false;
  }
}
</script>

<template>
  <div class="space-y-4 min-w-0">
    <div v-if="errorMsg" class="p-3 rounded text-xs font-semibold studio-badge-err">{{ errorMsg }}</div>
    <div v-if="trackNotice" class="p-3 rounded text-xs font-semibold studio-badge-ok">{{ trackNotice }}</div>

    <!-- ==================== PANEL KANVAS MULTI-TRACK TIMELINE ==================== -->
    <section class="studio-card p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="space-y-0.5">
          <h2 class="studio-heading text-sm md:text-base font-bold inline-flex items-center gap-1.5">
            <Film class="w-4 h-4" style="color: var(--accent-bg);" />
            <span>Visual Multi-Track Timeline (v{{ baseVersionNumber }} -> v{{ nextVersionNumber }})</span>
          </h2>
          <p class="text-[11px] studio-muted font-mono">
            Playhead: {{ currentTimeSec.toFixed(1) }}s / {{ totalOutputDur.toFixed(1) }}s | {{ draft.segments.length }} Segmen
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="studio-btn-primary text-xs !min-h-[38px] !px-2.5"
            :disabled="autoTracking || rendering"
            @click="handleAutoTrackFocus"
          >
            <Crosshair class="w-3.5 h-3.5" />
            <span>{{ autoTracking ? 'Memindai Fokus...' : 'Auto-Deteksi Fokus Subjek' }}</span>
          </button>
          <button
            type="button"
            class="studio-btn-secondary text-xs !min-h-[38px] !px-2.5"
            @click="handleSplitSelected"
          >
            <Scissors class="w-3.5 h-3.5" />
            <span>Belah Segmen</span>
          </button>
          <button
            type="button"
            class="studio-btn-secondary text-xs !min-h-[38px] !px-2.5"
            @click="handleAddSegment"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Tambah Segmen</span>
          </button>
        </div>
      </div>

      <!-- Time Ruler + Interactive Scrubbing Playhead -->
      <div
        class="relative rounded p-2.5 space-y-2 overflow-hidden"
        :style="{
          background: 'var(--bg-elevated)',
          border: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)'
        }"
      >
        <!-- Ruler Clickable -->
        <div
          class="relative h-6 flex items-center justify-between text-[10px] font-mono studio-muted cursor-pointer select-none px-1"
          title="Klik untuk melompatkan posisi pemutaran video"
          @click="handleRulerClick"
        >
          <span>0.0s</span>
          <span>{{ (totalOutputDur * 0.25).toFixed(1) }}s</span>
          <span>{{ (totalOutputDur * 0.5).toFixed(1) }}s</span>
          <span>{{ (totalOutputDur * 0.75).toFixed(1) }}s</span>
          <span>{{ totalOutputDur.toFixed(1) }}s</span>

          <!-- Garis Jarum Playhead -->
          <div
            class="pointer-events-none absolute top-0 bottom-[-140px] w-[2px] z-20"
            :style="{ left: `${playheadPct}%`, backgroundColor: '#f43f5e' }"
          />
        </div>

        <!-- Track 1: Overlay Hook & CTA -->
        <div class="grid grid-cols-12 items-center gap-2">
          <span class="col-span-3 sm:col-span-2 text-[10px] font-bold uppercase studio-muted truncate">Overlay</span>
          <div class="col-span-9 sm:col-span-10 relative h-7 rounded overflow-hidden" style="background: var(--bg-surface);">
            <button
              v-if="draft.hookBanner.enabled"
              type="button"
              class="absolute top-0.5 bottom-0.5 rounded px-1.5 text-[10px] font-bold truncate text-left"
              :style="{
                left: `${pctOfTotal(draft.hookBanner.startSec)}%`,
                width: `${Math.max(12, pctOfTotal(draft.hookBanner.endSec - draft.hookBanner.startSec))}%`,
                background: 'var(--status-warn-bg)',
                color: 'var(--status-warn-fg)',
                border: '1px solid var(--status-warn-fg)'
              }"
              @click="emit('seek', draft.hookBanner.startSec)"
            >
              Hook: {{ draft.hookBanner.text || 'Banner' }}
            </button>

            <button
              v-if="draft.complianceOverlays.ctaText.trim()"
              type="button"
              class="absolute top-0.5 bottom-0.5 rounded px-1.5 text-[10px] font-bold truncate text-left"
              :style="{
                left: `${Math.min(82, pctOfTotal(draft.complianceOverlays.ctaStartSec))}%`,
                right: '2px',
                background: 'var(--status-ok-bg)',
                color: 'var(--status-ok-fg)',
                border: '1px solid var(--status-ok-fg)'
              }"
              @click="emit('seek', draft.complianceOverlays.ctaStartSec)"
            >
              CTA: {{ draft.complianceOverlays.ctaText }}
            </button>
          </div>
        </div>

        <!-- Track 2: Video Segments -->
        <div class="grid grid-cols-12 items-center gap-2">
          <span class="col-span-3 sm:col-span-2 text-[10px] font-bold uppercase studio-muted truncate">Video</span>
          <div class="col-span-9 sm:col-span-10 flex gap-1 h-10">
            <button
              v-for="item in segmentTimelineLayout"
              :key="item.index"
              type="button"
              class="h-full rounded px-2 flex flex-col justify-center items-start overflow-hidden transition text-left"
              :style="{
                width: `${Math.max(14, (item.dur / totalOutputDur) * 100)}%`,
                background: selectedSegIdx === item.index ? 'var(--accent-bg)' : 'var(--accent-soft-bg)',
                color: selectedSegIdx === item.index ? 'var(--accent-fg)' : 'var(--accent-soft-fg)',
                border: selectedSegIdx === item.index ? '2px solid var(--text-primary)' : '1px solid var(--accent-bg)'
              }"
              @click="selectSegment(item.index)"
            >
              <span class="text-[10px] font-mono font-bold leading-none truncate w-full">
                #{{ item.index + 1 }} ({{ item.dur.toFixed(1) }}s)
              </span>
              <span class="text-[9px] font-mono opacity-90 truncate w-full mt-0.5">
                {{ item.seg.zoom.toFixed(2) }}x | {{ item.seg.cropX }} ({{ Math.round(getSegmentFocusX(item.seg) * 100) }}%)
              </span>
            </button>
          </div>
        </div>

        <!-- Track 3: Subtitle & Safe-Zone -->
        <div class="grid grid-cols-12 items-center gap-2">
          <span class="col-span-3 sm:col-span-2 text-[10px] font-bold uppercase studio-muted truncate">Subtitle</span>
          <div
            class="col-span-9 sm:col-span-10 h-7 rounded px-2 flex items-center justify-between text-[10px] font-mono"
            style="background: var(--bg-surface); border: 1px solid var(--border-color);"
          >
            <span class="truncate">
              {{ draft.captions.enabled ? `Aktif (${draft.captions.style})` : 'Subtitle Mati' }}
            </span>
            <span class="font-bold shrink-0">Posisi Vertikal: {{ draft.captions.verticalOffsetPct }}%</span>
          </div>
        </div>

        <!-- Track 4: Audio Mixing -->
        <div class="grid grid-cols-12 items-center gap-2">
          <span class="col-span-3 sm:col-span-2 text-[10px] font-bold uppercase studio-muted truncate">Audio</span>
          <div
            class="col-span-9 sm:col-span-10 h-7 rounded relative overflow-hidden flex items-center px-2 text-[10px] font-mono"
            style="background: var(--bg-surface); border: 1px solid var(--border-color);"
          >
            <div
              class="absolute inset-y-0 left-0 opacity-25"
              :style="{
                width: `${Math.min(100, audioVolumePct)}%`,
                backgroundColor: audioVolumePct === 0 ? '#f43f5e' : 'var(--accent-bg)'
              }"
            />
            <span class="relative z-10 font-bold">
              {{
                audioVolumePct === 0
                  ? 'Audio Asli Di-Mute (0% - Siap Sound Platform)'
                  : audioVolumePct < 90
                    ? `Ducking Audio Asli (${audioVolumePct}%)`
                    : `Audio Asli ${audioVolumePct}% (${draft.audio.normalizeLufs} LUFS)`
              }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== PANEL INSPEKTOR SEGMEN TERPILIH ==================== -->
    <section v-if="selectedSeg" class="studio-card p-4 space-y-3.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="studio-heading text-sm font-bold">
          Inspektor Segmen Video #{{ selectedSegIdx + 1 }} (Dari Total {{ draft.segments.length }})
        </h3>
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            class="studio-btn-secondary !min-h-[34px] !px-2 text-[11px]"
            :disabled="selectedSegIdx === 0"
            title="Geser segmen ke kiri"
            @click="handleMoveSelected(-1)"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            class="studio-btn-secondary !min-h-[34px] !px-2 text-[11px]"
            :disabled="selectedSegIdx >= draft.segments.length - 1"
            title="Geser segmen ke kanan"
            @click="handleMoveSelected(1)"
          >
            <ArrowRight class="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            class="studio-btn-secondary !min-h-[34px] !px-2.5 text-[11px]"
            @click="handleDuplicateSelected"
          >
            <Copy class="w-3.5 h-3.5" />
            <span>Duplikat</span>
          </button>
          <button
            type="button"
            class="studio-btn-secondary !min-h-[34px] !px-2.5 text-[11px]"
            :disabled="draft.segments.length <= 1"
            @click="handleDeleteSelected"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>Hapus</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div class="space-y-1">
          <div class="flex justify-between font-semibold">
            <label for="tl-seg-start">Titik Mulai Potong (In)</label>
            <span class="font-mono">{{ selectedSeg.startSec.toFixed(1) }}s</span>
          </div>
          <input
            id="tl-seg-start"
            type="range"
            min="0"
            :max="Math.max(0, selectedSeg.endSec - 0.5)"
            step="0.1"
            :value="selectedSeg.startSec"
            class="w-full accent-emerald-500"
            @input="updateSelectedStart(Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <div class="space-y-1">
          <div class="flex justify-between font-semibold">
            <label for="tl-seg-end">Titik Selesai Potong (Out)</label>
            <span class="font-mono">{{ selectedSeg.endSec.toFixed(1) }}s / {{ selectedSegSourceMaxDur.toFixed(1) }}s</span>
          </div>
          <input
            id="tl-seg-end"
            type="range"
            :min="Math.min(selectedSegSourceMaxDur, selectedSeg.startSec + 0.5)"
            :max="selectedSegSourceMaxDur"
            step="0.1"
            :value="selectedSeg.endSec"
            class="w-full accent-emerald-500"
            @input="updateSelectedEnd(Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <div class="space-y-1">
          <div class="flex justify-between font-semibold">
            <label for="tl-seg-zoom">Zoom Segmen</label>
            <span class="font-mono">{{ selectedSeg.zoom.toFixed(2) }}x</span>
          </div>
          <input
            id="tl-seg-zoom"
            v-model.number="selectedSeg.zoom"
            type="range"
            min="1"
            max="2"
            step="0.05"
            class="w-full accent-emerald-500"
          />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <label for="tl-seg-crop" class="block font-semibold">Fokus Crop</label>
            <select
              id="tl-seg-crop"
              v-model="selectedSeg.cropX"
              class="studio-input !min-h-[38px] text-xs py-1"
              @change="onCropXChanged"
            >
              <option value="left">Kiri</option>
              <option value="center">Tengah</option>
              <option value="right">Kanan</option>
            </select>
          </div>
          <div class="space-y-1">
            <label for="tl-framing" class="block font-semibold">Framing 9:16</label>
            <select id="tl-framing" v-model="draft.framingMode" class="studio-input !min-h-[38px] text-xs py-1">
              <option value="auto_face_track">Smart Auto-Track 9:16</option>
              <option value="fit_blur_bg">Fit-Blur BG</option>
              <option value="center_crop">Center Crop</option>
              <option value="split_screen">Split-Screen</option>
            </select>
          </div>
        </div>

        <div class="space-y-1 sm:col-span-2">
          <div class="flex justify-between font-semibold">
            <label for="tl-seg-focus-x">Posisi Horizontal Fokus X (Smart Auto-Track)</label>
            <span class="font-mono">{{ Math.round(getSegmentFocusX(selectedSeg) * 100) }}% ({{ selectedSeg.cropX }})</span>
          </div>
          <input
            id="tl-seg-focus-x"
            type="range"
            min="0.08"
            max="0.92"
            step="0.02"
            :value="getSegmentFocusX(selectedSeg)"
            class="w-full accent-emerald-500"
            @input="updateSelectedFocusX(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
    </section>

    <!-- ==================== PANEL OVERLAY, SUBTITLE & AUDIO ==================== -->
    <section class="studio-card p-4 space-y-4 text-xs">
      <!-- Hook Banner & CTA -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold inline-flex items-center gap-1.5">
              <Type class="w-3.5 h-3.5" />
              <span>Hook Banner (0-3 Detik)</span>
            </span>
            <label class="inline-flex items-center gap-1.5 cursor-pointer">
              <input v-model="draft.hookBanner.enabled" type="checkbox" class="w-4 h-4 accent-emerald-600" />
              <span>Aktif</span>
            </label>
          </div>
          <input
            id="tl-hook-text"
            v-model="draft.hookBanner.text"
            type="text"
            maxlength="120"
            class="studio-input !min-h-[40px] text-xs"
            placeholder="Teks Hook 3 detik pertama..."
          />
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="tl-hook-start" class="block studio-muted text-[11px]">Mulai (detik)</label>
              <input
                id="tl-hook-start"
                v-model.number="draft.hookBanner.startSec"
                type="number"
                min="0"
                :max="totalOutputDur"
                step="0.2"
                class="studio-input !min-h-[36px] text-xs font-mono"
              />
            </div>
            <div>
              <label for="tl-hook-end" class="block studio-muted text-[11px]">Selesai (detik)</label>
              <input
                id="tl-hook-end"
                v-model.number="draft.hookBanner.endSec"
                type="number"
                min="0.5"
                :max="totalOutputDur"
                step="0.2"
                class="studio-input !min-h-[36px] text-xs font-mono"
              />
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <span class="font-bold inline-flex items-center gap-1.5">
            <Play class="w-3.5 h-3.5" />
            <span>Overlay CTA Penutup Brief</span>
          </span>
          <input
            id="tl-cta-text"
            v-model="draft.complianceOverlays.ctaText"
            type="text"
            maxlength="120"
            class="studio-input !min-h-[40px] text-xs"
            placeholder="Contoh: Cek link di bio #BrandCampaign"
          />
          <div>
            <label for="tl-cta-start" class="block studio-muted text-[11px]">Muncul Mulai Detik ke-</label>
            <input
              id="tl-cta-start"
              v-model.number="draft.complianceOverlays.ctaStartSec"
              type="number"
              min="0"
              :max="totalOutputDur"
              step="0.2"
              class="studio-input !min-h-[36px] text-xs font-mono"
            />
          </div>
        </div>
      </div>

      <!-- Subtitle Safe-Zone & Audio Mixer -->
      <div
        class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3"
        :style="{ borderTop: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)' }"
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold inline-flex items-center gap-1.5">
              <Subtitles class="w-3.5 h-3.5" />
              <span>Subtitle & Safe-Zone</span>
            </span>
            <label class="inline-flex items-center gap-1.5 cursor-pointer">
              <input v-model="draft.captions.enabled" type="checkbox" class="w-4 h-4 accent-emerald-600" />
              <span>Aktif</span>
            </label>
          </div>
          <select v-model="draft.captions.style" class="studio-input !min-h-[38px] text-xs py-1">
            <option value="hormozi_bold">Hormozi Bold</option>
            <option value="clean_minimal">Clean Minimalist</option>
            <option value="bilingual">Bilingual</option>
            <option value="off">Off</option>
          </select>
          <div class="space-y-1">
            <div class="flex justify-between">
              <label for="tl-sub-offset" class="studio-muted">Posisi Vertikal Safe-Zone</label>
              <span class="font-mono font-bold">{{ draft.captions.verticalOffsetPct }}%</span>
            </div>
            <input
              id="tl-sub-offset"
              v-model.number="draft.captions.verticalOffsetPct"
              type="range"
              min="45"
              max="82"
              step="1"
              class="w-full accent-emerald-500"
            />
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold inline-flex items-center gap-1.5">
              <VolumeX v-if="audioVolumePct === 0" class="w-3.5 h-3.5" />
              <Volume2 v-else class="w-3.5 h-3.5" />
              <span>Volume Audio Asli</span>
            </span>
            <span class="font-mono font-bold">{{ audioVolumePct }}%</span>
          </div>
          <input
            id="tl-audio-vol"
            v-model.number="audioVolumePct"
            type="range"
            min="0"
            max="120"
            step="5"
            class="w-full accent-emerald-500"
          />
          <div class="flex flex-wrap gap-1.5">
            <button
              type="button"
              class="px-2.5 py-1 rounded text-[11px] font-semibold min-h-[32px]"
              :style="audioVolumePct === 0 ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
              @click="audioVolumePct = 0"
            >
              Mute 0%
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded text-[11px] font-semibold min-h-[32px]"
              :style="audioVolumePct === 15 ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
              @click="audioVolumePct = 15"
            >
              Duck 15%
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded text-[11px] font-semibold min-h-[32px]"
              :style="audioVolumePct === 25 ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
              @click="audioVolumePct = 25"
            >
              Duck 25%
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded text-[11px] font-semibold min-h-[32px]"
              :style="audioVolumePct === 100 ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' } : { background: 'var(--bg-elevated)' }"
              @click="audioVolumePct = 100"
            >
              100%
            </button>
          </div>
        </div>
      </div>

      <!-- Footer Render Versi Baru -->
      <div
        class="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        :style="{ borderTop: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)' }"
      >
        <div class="flex-1 min-w-0 space-y-1">
          <input
            id="tl-note"
            v-model="editNote"
            type="text"
            maxlength="200"
            class="studio-input !min-h-[38px] text-xs"
            placeholder="Catatan versi opsional (contoh: Split hook + ducking 25%)"
          />
          <p class="text-[11px] studio-muted">
            {{ isDirty ? 'Ada perubahan draft timeline siap dirender.' : 'Belum ada perubahan pada draft timeline.' }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            class="studio-btn-secondary text-xs"
            :disabled="rendering || !isDirty"
            @click="handleResetDraft"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            class="studio-btn-primary text-xs"
            :disabled="rendering"
            @click="handleRenderTimeline"
          >
            <Sparkles class="w-4 h-4" />
            <span>{{ rendering ? `Merender v${nextVersionNumber}...` : `Render Timeline ke v${nextVersionNumber}` }}</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
