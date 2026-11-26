---
name: edl-video-renderer
description: Panduan teknis dan spesifikasi pipeline rendering video lokal (EDL JSON -> FFmpeg 8.1.2 + FFprobe + ASS Safe-Zone Captions + Audio Mute/Ducking/Normalize) khusus untuk proyek clip-content-rewards. Gunakan skill ini saat membangun, mengubah, atau mendiagnosis modul media ingestion (M5), auto-editor batch renderer (M6), dan iterative prompt re-editor (M8).
---

# Skill: EDL Video Renderer (`clip-content-rewards`)

## 1. Arsitektur Eksekusi Aman
- **Binary Lokal Terverifikasi:** `ffmpeg` (`8.1.2-full_build`) & `ffprobe` (`8.1.2`).
- **Larangan Shell Injection:** Wajib panggil melalui `child_process.spawn(bin, argsArray, { shell: false })`.
- **Isolasi Path:** Setiap argumen path file wajib melewati `resolveSafeStoragePath()`.

## 2. Alur Kompilasi `EDL JSON` -> `video.mp4`
1. **Validasi Zod & Durasi:** Clamp semua `startSec`/`endSec` terhadap `mediaAsset.durationSec` dari `ffprobe`.
2. **Generate Subtitle `.ass` & `.srt`:**
   - Ambil *word-level timestamps* hasil transkrip yang jatuh di rentang segmen EDL, lalu geser (*re-time*) terhadap timeline video hasil concat!
   - Terapkan `edl.captions.overrides` (koreksi typo dari Inline Subtitle Editor) sebelum menulis `.ass`/`.srt`.
   - Set `PlayResX: 1080`, `PlayResY: 1920`, `MarginR: 180`, `MarginL: 70`, dan `MarginV` sesuai preset Safe-Zone (`tiktok_9_16` default `MarginV: 420`, `youtube_shorts_9_16` default `MarginV: 380`).
3. **Susun `filter_complex` Video:**
   - Trim setiap segmen `[0:v]trim=start=...:end=...,setpts=PTS-STARTPTS` -> scale & crop ke `1080x1920` (atau `1920x1080` untuk 16:9) -> `concat=n=K:v=1:a=0`.
   - Burn-in subtitle `.ass` (gunakan path ter-escape aman untuk Windows drive colon) + Hook Banner 0-3 detik jika `hookBanner.enabled = true`.
4. **Susun `filter_complex` Audio (Kritis untuk Skenario Lapangan):**
   - Jika `audio.muteOriginal === true` atau `audio.originalVolume === 0`:
     - Gunakan sumber audio hening deterministik `anullsrc=channel_layout=stereo:sample_rate=48000` dengan durasi sama persis agar container MP4 tetap punya track AAC valid (tidak ditolak TikTok/YouTube/iOS!).
   - Jika `0 < audio.originalVolume < 1.0` (Ducking, misal `0.15` atau `0.25`):
     - Trim & concat audio asli -> `loudnorm=I=-14:TP=-1.5:LRA=11` -> `volume=${audio.originalVolume}` (agar level ducking konsisten tanpa tergantung rekaman mentah yang pelan/keras!).
   - Jika `audio.originalVolume === 1.0`:
     - Trim & concat audio asli -> `loudnorm=I=-14:TP=-1.5:LRA=11`.
5. **Encoding Kompatibilitas Universal:**
   - `-c:v libx264 -preset fast -crf 21 -pix_fmt yuv420p -r 30`
   - `-c:a aac -b:a 192k -ar 48000 -ac 2`
   - `-movflags +faststart`
6. **Post-Render Probe (Verifikasi Otomatis):**
   - Jalankan `ffprobe` pada hasil akhir untuk memastikan file tidak 0 byte, durasi valid, dan `cover.jpg` terekstrak dari frame terbaik.
