<script setup lang="ts">
import { computed, useId } from 'vue';
import { useThemeStore } from '~/stores/theme';

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    size: 'md'
  }
);

const themeStore = useThemeStore();
const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'w-8 h-8';
  if (props.size === 'lg') return 'w-12 h-12';
  return 'w-10 h-10';
});

const palette = computed(() => {
  if (themeStore.current === 'daylight-editorial') {
    return {
      bgTop: '#242220',
      bgBot: '#141312',
      rimStart: '#EA580C',
      rimEnd: '#D6CEC0',
      tickA: '#FDBA74',
      tickB: '#EFEAE0',
      prismStart: '#F97316',
      prismMid: '#EA580C',
      prismEnd: '#C2410C',
      sliceFill: '#FFEDD5',
      spark: '#FDBA74',
      strokeWidth: 1.8,
      shadowStyle: 'none'
    };
  }
  if (themeStore.current === 'creator-tactile') {
    return {
      bgTop: '#2563EB',
      bgBot: '#1D4ED8',
      rimStart: '#0F172A',
      rimEnd: '#0F172A',
      tickA: '#BFDBFE',
      tickB: '#38BDF8',
      prismStart: '#FFFFFF',
      prismMid: '#F8FAFC',
      prismEnd: '#DBEAFE',
      sliceFill: '#38BDF8',
      spark: '#FDE047',
      strokeWidth: 2.6,
      shadowStyle: 'drop-shadow(2px 2px 0px #0f172a)'
    };
  }
  return {
    bgTop: '#141B26',
    bgBot: '#090D13',
    rimStart: '#34D399',
    rimEnd: '#06B6D4',
    tickA: '#6EE7B7',
    tickB: '#22D3EE',
    prismStart: '#34D399',
    prismMid: '#10B981',
    prismEnd: '#06B6D4',
    sliceFill: '#A7F3D0',
    spark: '#22D3EE',
    strokeWidth: 1.8,
    shadowStyle: 'none'
  };
});
</script>

<template>
  <svg
    :class="[sizeClass, 'shrink-0 select-none']"
    :style="{ filter: palette.shadowStyle }"
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Logo Clip Content Rewards"
  >
    <defs>
      <linearGradient :id="`bg-${uid}`" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
        <stop offset="0%" :stop-color="palette.bgTop" />
        <stop offset="100%" :stop-color="palette.bgBot" />
      </linearGradient>
      <linearGradient :id="`rim-${uid}`" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
        <stop offset="0%" :stop-color="palette.rimStart" />
        <stop offset="100%" :stop-color="palette.rimEnd" />
      </linearGradient>
      <linearGradient :id="`prism-${uid}`" x1="15" y1="13" x2="34" y2="35" gradientUnits="userSpaceOnUse">
        <stop offset="0%" :stop-color="palette.prismStart" />
        <stop offset="55%" :stop-color="palette.prismMid" />
        <stop offset="100%" :stop-color="palette.prismEnd" />
      </linearGradient>
    </defs>

    <!-- Frame Oktagonal Futuristik (Aperture Viewfinder) -->
    <path
      d="M12 3H36L45 12V36L36 45H12L3 36V12L12 3Z"
      :fill="`url(#bg-${uid})`"
      :stroke="`url(#rim-${uid})`"
      :stroke-width="palette.strokeWidth"
    />

    <!-- Tanda Batas Safe-Zone Presisi -->
    <path d="M10 15V10H15" :stroke="palette.tickA" stroke-width="1.8" stroke-linecap="square" opacity="0.85" />
    <path d="M38 33V38H33" :stroke="palette.tickB" stroke-width="1.8" stroke-linecap="square" opacity="0.85" />

    <!-- Prisma Play Terbelah (Simbol Auto-Cut AI) -->
    <path d="M17 13.5L32.5 22.4L24.2 26.8L17 22.8V13.5Z" :fill="`url(#prism-${uid})`" />
    <path d="M17 26.2L22.6 29.3L33.5 24.4L17 34.5V26.2Z" :fill="palette.sliceFill" />

    <!-- Percikan AI Node 4-Sudut -->
    <path
      d="M35 11L36.1 13.9L39 15L36.1 16.1L35 19L33.9 16.1L31 15L33.9 13.9L35 11Z"
      :fill="palette.spark"
    />
  </svg>
</template>
