<script setup lang="ts">
import { Heart, MessageCircle, Bookmark, Share2, Music2, ThumbsUp, ThumbsDown } from 'lucide-vue-next';

defineProps<{
  mode: 'off' | 'tiktok' | 'youtube_shorts';
}>();
</script>

<template>
  <div
    v-if="mode !== 'off'"
    class="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between overflow-hidden select-none"
    aria-hidden="true"
  >
    <!-- Zona Atas (Header Aplikasi) -->
    <div
      class="w-full px-3 py-2 flex items-center justify-between text-[10px] font-bold tracking-wide text-white"
      style="background: rgba(244, 63, 94, 0.24); border-bottom: 1px dashed rgba(253, 164, 175, 0.85); height: 11%;"
    >
      <span v-if="mode === 'tiktok'" class="mx-auto uppercase">Mengikuti | Untuk Anda (Area Atas)</span>
      <span v-else class="uppercase">YT Shorts Header (Area Atas)</span>
    </div>

    <!-- Zona Tengah: Batas Aman + Rail Tombol Kanan -->
    <div class="relative flex-1 flex items-center justify-center px-2">
      <div
        class="w-[74%] h-[78%] mr-auto rounded border border-dashed flex items-end justify-start p-1.5"
        style="border-color: rgba(16, 185, 129, 0.78); background: rgba(16, 185, 129, 0.04);"
      >
        <span
          class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase"
          style="background: rgba(6, 78, 59, 0.88); color: #a7f3d0;"
        >
          Safe-Zone Konten & Subtitle
        </span>
      </div>

      <!-- Rail Aksi Kanan (Like / Comment / Share) -->
      <div
        class="w-[18%] py-2 px-1 rounded flex flex-col items-center justify-center gap-2.5 text-white/90"
        style="background: rgba(244, 63, 94, 0.28); border: 1px dashed rgba(253, 164, 175, 0.85);"
      >
        <template v-if="mode === 'tiktok'">
          <Heart class="w-4 h-4" />
          <MessageCircle class="w-4 h-4" />
          <Bookmark class="w-4 h-4" />
          <Share2 class="w-4 h-4" />
        </template>
        <template v-else>
          <ThumbsUp class="w-4 h-4" />
          <ThumbsDown class="w-4 h-4" />
          <MessageCircle class="w-4 h-4" />
          <Share2 class="w-4 h-4" />
        </template>
      </div>
    </div>

    <!-- Zona Bawah (Caption, Akun & Ticker Musik; memberi ruang bawah untuk native scrub bar) -->
    <div
      class="w-full px-3 pt-2 pb-10 flex flex-col justify-start gap-0.5 text-[10px] text-white"
      style="background: rgba(244, 63, 94, 0.28); border-top: 1px dashed rgba(253, 164, 175, 0.85); height: 24%;"
    >
      <div class="font-bold">@akun_kreator</div>
      <div class="opacity-90 truncate">
        {{ mode === 'tiktok' ? 'Area caption, hashtag & ticker musik TikTok' : 'Area judul, tombol Subscribe & audio YouTube Shorts' }}
      </div>
      <div class="inline-flex items-center gap-1 opacity-90 text-[9px]">
        <Music2 class="w-3 h-3" />
        <span>Sound Trending / Audio Platform</span>
      </div>
    </div>
  </div>
</template>
