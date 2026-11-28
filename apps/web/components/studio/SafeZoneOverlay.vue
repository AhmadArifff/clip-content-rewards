<script setup lang="ts">
import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Music2,
  Search,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Plus
} from 'lucide-vue-next';

defineProps<{
  mode: 'off' | 'tiktok' | 'youtube_shorts';
}>();
</script>

<template>
  <div
    v-if="mode !== 'off'"
    class="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none text-white"
    aria-hidden="true"
  >
    <!-- ===============================================================
         MODE 1: TIKTOK REAL MOBILE UI OVERLAY (9:16)
         =============================================================== -->
    <template v-if="mode === 'tiktok'">
      <!-- Top Bar TikTok (0% - 9%): Teman | Mengikuti | Saran + Search -->
      <div
        class="absolute top-0 left-0 right-0 flex items-center justify-between px-2.5 text-[9.5px]"
        style="height: 9%; background: rgba(244, 63, 94, 0.22); border-bottom: 1px dashed rgba(253, 164, 175, 0.85);"
      >
        <div class="flex items-center justify-center gap-2.5 flex-1 pl-3">
          <span class="opacity-70 font-medium">Teman</span>
          <span class="opacity-75 font-medium">Mengikuti</span>
          <span class="relative font-bold text-white">
            Saran
            <span class="block mx-auto mt-0.5 h-[2px] w-4 rounded-full bg-white" />
          </span>
        </div>
        <Search class="w-3.5 h-3.5 shrink-0 opacity-95" />
      </div>

      <!-- Zona Aman Konten & Subtitle TikTok (top 10%, right 20%, bottom 30%) -->
      <div
        class="absolute rounded border border-dashed flex items-end justify-start p-1.5"
        style="top: 10%; left: 3%; right: 20%; bottom: 30%; border-color: rgba(16, 185, 129, 0.85); background: rgba(16, 185, 129, 0.05);"
      >
        <span
          class="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold uppercase tracking-wide"
          style="background: rgba(6, 78, 59, 0.9); color: #a7f3d0;"
        >
          Safe-Zone TikTok
        </span>
      </div>

      <!-- Rail Aksi Kanan TikTok (38% - 90%): Avatar+, Heart, Comment, Bookmark, Share, Sound Disc -->
      <div
        class="absolute right-1.5 rounded flex flex-col items-center justify-between py-2 px-1"
        style="top: 38%; bottom: 10%; width: 17%; background: rgba(244, 63, 94, 0.22); border: 1px dashed rgba(253, 164, 175, 0.85);"
      >
        <!-- Avatar Kreator + Tombol Plus Merah -->
        <div class="relative mb-1">
          <div class="w-6 h-6 rounded-full border-2 border-white bg-white/25" />
          <span
            class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full flex items-center justify-center"
            style="background: #fe2c55;"
          >
            <Plus class="w-2.5 h-2.5 stroke-[3]" />
          </span>
        </div>

        <div class="flex flex-col items-center leading-none gap-0.5">
          <Heart class="w-4 h-4 fill-white text-white" />
          <span class="text-[8px] font-semibold">141 rb</span>
        </div>

        <div class="flex flex-col items-center leading-none gap-0.5">
          <MessageCircle class="w-4 h-4 fill-white text-white" />
          <span class="text-[8px] font-semibold">4.121</span>
        </div>

        <div class="flex flex-col items-center leading-none gap-0.5">
          <Bookmark class="w-4 h-4 fill-white text-white" />
          <span class="text-[8px] font-semibold">5.338</span>
        </div>

        <div class="flex flex-col items-center leading-none gap-0.5">
          <Share2 class="w-4 h-4 text-white" />
          <span class="text-[8px] font-semibold">24 rb</span>
        </div>

        <!-- Piringan Sound Bulat -->
        <div class="w-6 h-6 rounded-full border-2 border-white/85 bg-slate-900/75 flex items-center justify-center">
          <Music2 class="w-3 h-3" />
        </div>
      </div>

      <!-- Zona Metadata Bawah Kiri TikTok (height 29%): Efek, Nama Kreator, Caption 2 baris + Hashtag, Audio -->
      <div
        class="absolute left-0 bottom-0 px-2.5 pt-1.5 pb-10 flex flex-col justify-start gap-1"
        style="width: 81%; height: 29%; background: rgba(244, 63, 94, 0.22); border-top: 1px dashed rgba(253, 164, 175, 0.85); border-right: 1px dashed rgba(253, 164, 175, 0.6);"
      >
        <div>
          <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold bg-black/50">
            <Sparkles class="w-2.5 h-2.5 text-amber-300" />
            <span>Efek · Filter / Anchor</span>
          </span>
        </div>
        <div class="text-[10px] font-bold leading-tight">nama_kreator</div>
        <div class="text-[8.5px] leading-snug opacity-90 line-clamp-2">
          Area caption 2 baris &amp; hashtag #fyp #trending (hindari taruh teks di sini)
        </div>
        <div class="inline-flex items-center gap-1 text-[8px] opacity-90 truncate">
          <Music2 class="w-2.5 h-2.5 shrink-0" />
          <span class="truncate">Berisi: Original Sound / Audio TikTok</span>
        </div>
      </div>
    </template>

    <!-- ===============================================================
         MODE 2: YOUTUBE SHORTS REAL MOBILE UI OVERLAY (9:16)
         =============================================================== -->
    <template v-else>
      <!-- Top-Right ONLY (0% - 8%): Search + More (...) - Kiri & Tengah Atas Terbuka Bersih -->
      <div
        class="absolute top-2 right-2 px-2 py-1 rounded flex items-center gap-2.5"
        style="background: rgba(244, 63, 94, 0.24); border: 1px dashed rgba(253, 164, 175, 0.85);"
      >
        <Search class="w-3.5 h-3.5" />
        <MoreHorizontal class="w-3.5 h-3.5" />
      </div>

      <!-- Zona Aman Konten & Subtitle YouTube Shorts (top 9%, right 20%, bottom 23%) -->
      <div
        class="absolute rounded border border-dashed flex items-end justify-start p-1.5"
        style="top: 9%; left: 3%; right: 20%; bottom: 23%; border-color: rgba(16, 185, 129, 0.85); background: rgba(16, 185, 129, 0.05);"
      >
        <span
          class="px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold uppercase tracking-wide"
          style="background: rgba(6, 78, 59, 0.9); color: #a7f3d0;"
        >
          Safe-Zone YT Shorts
        </span>
      </div>

      <!-- Rail Aksi Kanan YT Shorts (43% - 90%): Like, Comment, Simpan, Bagikan, Remix, Kotak Sound -->
      <div
        class="absolute right-1.5 rounded flex flex-col items-center justify-between py-2 px-1"
        style="top: 43%; bottom: 10%; width: 17%; background: rgba(244, 63, 94, 0.22); border: 1px dashed rgba(253, 164, 175, 0.85);"
      >
        <div class="flex flex-col items-center leading-none gap-0.5">
          <Heart class="w-4 h-4" />
          <span class="text-[8px] font-semibold">130 rb</span>
        </div>

        <div class="flex flex-col items-center leading-none gap-0.5">
          <MessageCircle class="w-4 h-4" />
          <span class="text-[8px] font-semibold">1.342</span>
        </div>

        <div class="flex flex-col items-center leading-none gap-0.5">
          <Bookmark class="w-4 h-4" />
          <span class="text-[7.5px] font-semibold">Simpan</span>
        </div>

        <div class="flex flex-col items-center leading-none gap-0.5">
          <Share2 class="w-4 h-4" />
          <span class="text-[7.5px] font-semibold">Bagikan</span>
        </div>

        <div class="flex flex-col items-center leading-none gap-0.5">
          <RefreshCw class="w-3.5 h-3.5" />
          <span class="text-[7.5px] font-semibold">Remix</span>
        </div>

        <!-- Thumbnail Audio Kotak Membulat -->
        <div class="w-6 h-6 rounded border border-white/85 bg-slate-900/75 flex items-center justify-center">
          <Music2 class="w-3 h-3" />
        </div>
      </div>

      <!-- Zona Metadata Bawah Kiri YT Shorts (height 22%): Avatar + @Handle + Subscribe Pill + 1-baris Judul -->
      <div
        class="absolute left-0 bottom-0 px-2.5 pt-2 pb-10 flex flex-col justify-start gap-1"
        style="width: 81%; height: 22%; background: rgba(244, 63, 94, 0.22); border-top: 1px dashed rgba(253, 164, 175, 0.85); border-right: 1px dashed rgba(253, 164, 175, 0.6);"
      >
        <div class="flex items-center gap-1.5">
          <span class="w-5 h-5 rounded-full border border-white/80 bg-white/25 shrink-0" />
          <span class="text-[9.5px] font-bold truncate">@akun_kreator</span>
          <span class="px-2 py-0.5 rounded-full bg-white text-slate-950 text-[8px] font-bold shrink-0">
            Subscribe
          </span>
        </div>
        <div class="text-[8.5px] opacity-90 truncate">
          Judul singkat video YouTube Shorts ...
        </div>
      </div>
    </template>
  </div>
</template>
