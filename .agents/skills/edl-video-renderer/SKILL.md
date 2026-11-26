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
3. **Susun `filter_complex` Video (3 Mode Framing + Windows Safe Path):**
   - Trim setiap segmen `[0:v]trim=start=...:end=...,setpts=PTS-STARTPTS`.
   - Terapkan `framingMode`:
     - `center_crop`: scale height/width cover lalu `crop=1080:1920`.
     - `fit_blur_bg`: latar belakang versi scale cover + `gblur=sigma=28` ditumpuk foreground `scale=1080:-2` di tengah (menjaga teks/presentasi 16:9 tidak terpotong).
     - `split_screen`: gabungkan 2 region vertikal atas-bawah (pembicara + produk/B-roll).
   - Concat segmen -> tempel watermark/logo (`supportingOverlays`) jika ada -> burn-in subtitle `.ass` & Hook Banner 0-3 detik.
   - **Guardrail Windows Path Escaping:** Jalankan `spawn('ffmpeg', args, { cwd: clipWorkDir, shell: false })` dan referensikan `ass=subtitles.ass:fontsdir=../../../server/assets/fonts` memakai path relatif bersih tanpa huruf drive (`C:`) agar bebas eror parser filter FFmpeg di Windows.
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
