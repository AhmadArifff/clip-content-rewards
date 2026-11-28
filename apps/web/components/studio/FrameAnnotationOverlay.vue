<script setup lang="ts">
export interface FrameAnnotationPin {
  id: string;
  timestampSec: number;
  xPct: number;
  yPct: number;
  category: string;
  noteText: string;
  status: string;
}

const props = defineProps<{
  pinMode: boolean;
  currentTimeSec: number;
  annotations: FrameAnnotationPin[];
  draftPin: { xPct: number; yPct: number } | null;
}>();

const emit = defineEmits<{
  pinClick: [coords: { xPct: number; yPct: number }];
  selectPin: [annotation: FrameAnnotationPin];
}>();

function handleStageClick(event: MouseEvent) {
  if (!props.pinMode) return;
  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const rawX = ((event.clientX - rect.left) / rect.width) * 100;
  const rawY = ((event.clientY - rect.top) / rect.height) * 100;
  const xPct = Math.round(Math.min(96, Math.max(4, rawX)) * 10) / 10;
  const yPct = Math.round(Math.min(92, Math.max(6, rawY)) * 10) / 10;
  emit('pinClick', { xPct, yPct });
}

function isNearPlayhead(ts: number): boolean {
  return Math.abs(ts - props.currentTimeSec) <= 0.7;
}
</script>

<template>
  <div
    class="absolute inset-0 z-20"
    :class="pinMode ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'"
    :aria-label="pinMode ? 'Klik titik pada frame video untuk menaruh pin catatan' : undefined"
    @click="handleStageClick"
  >
    <!-- Banner Petunjuk Mode Pin Aktif -->
    <div
      v-if="pinMode"
      class="pointer-events-none absolute top-2 left-2 right-2 flex justify-center"
    >
      <span class="px-2.5 py-1 rounded bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wide shadow">
        Mode Pin Aktif: Klik Titik di Frame Video
      </span>
    </div>

    <!-- Pin Tersimpan -->
    <button
      v-for="(ann, idx) in annotations"
      v-show="isNearPlayhead(ann.timestampSec) || pinMode"
      :key="ann.id"
      type="button"
      class="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-[10px] font-extrabold flex items-center justify-center shadow-md border-2 border-white transition-transform hover:scale-110"
      :style="{
        left: `${ann.xPct}%`,
        top: `${ann.yPct}%`,
        backgroundColor: ann.status === 'resolved' ? '#10b981' : '#f43f5e',
        color: '#ffffff',
        opacity: isNearPlayhead(ann.timestampSec) ? 1 : 0.45
      }"
      :title="`#${idx + 1} [${ann.timestampSec.toFixed(1)}s] ${ann.noteText}`"
      @click.stop="emit('selectPin', ann)"
    >
      {{ idx + 1 }}
    </button>

    <!-- Pin Draft Baru (Sedang Ditulis Catatannya) -->
    <div
      v-if="draftPin"
      class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-amber-400 text-slate-950 border-2 border-white flex items-center justify-center text-xs font-extrabold shadow-lg animate-pulse"
      :style="{ left: `${draftPin.xPct}%`, top: `${draftPin.yPct}%` }"
    >
      +
    </div>
  </div>
</template>
