<script setup lang="ts">
import type { ThemeId } from '@clip/shared';
import { Monitor, BookOpen, Layers } from 'lucide-vue-next';
import { useThemeStore } from '~/stores/theme';

const themeStore = useThemeStore();

const options: Array<{
  id: ThemeId;
  label: string;
  swatchBg: string;
  swatchAccent: string;
  icon: typeof Monitor;
}> = [
  { id: 'editing-room', label: 'Editing Room', swatchBg: '#0d0f12', swatchAccent: '#10b981', icon: Monitor },
  { id: 'daylight-editorial', label: 'Editorial', swatchBg: '#f6f3ec', swatchAccent: '#c2410c', icon: BookOpen },
  { id: 'creator-tactile', label: 'Tactile', swatchBg: '#eef2f6', swatchAccent: '#1d4ed8', icon: Layers }
];
</script>

<template>
  <div
    class="inline-flex flex-wrap items-center gap-1 p-1"
    style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color); border-radius: var(--radius-control);"
    role="group"
    aria-label="Pilih tema antarmuka studio"
  >
    <button
      v-for="opt in options"
      :key="opt.id"
      type="button"
      class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-all min-h-[36px]"
      :style="
        themeStore.current === opt.id
          ? {
              backgroundColor: 'var(--accent-bg)',
              color: 'var(--accent-fg)',
              borderRadius: 'var(--radius-control)'
            }
          : {
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              borderRadius: 'var(--radius-control)'
            }
      "
      :aria-pressed="themeStore.current === opt.id"
      @click="themeStore.setTheme(opt.id)"
    >
      <span
        class="inline-flex h-3 w-3 items-center justify-center rounded-full border border-black/30"
        :style="{ backgroundColor: opt.swatchBg }"
      >
        <span class="h-1.5 w-1.5 rounded-full" :style="{ backgroundColor: opt.swatchAccent }" />
      </span>
      <span>{{ opt.label }}</span>
    </button>
  </div>
</template>
