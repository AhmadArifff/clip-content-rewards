# 50 - Video Pipeline (FFmpeg + EDL JSON) & AI Director Standards

## 1. Prinsip Deterministik: AI Merancang EDL, FFmpeg Mengeksekusi
- AI (BYOK LLM) **tidak** menulis string perintah shell FFmpeg secara bebas (rawan halusinasi syntax & celah keamanan).
- AI menghasilkan **EDL JSON (Edit Decision List)** atau **EDL Patch JSON** terstruktur sesuai skema **Zod**.
- Layer `FfmpegCommandBuilder` menerjemahkan EDL JSON tervalidasi menjadi array argumen `spawn('ffmpeg', args, { shell: false })`.

## 2. Validasi Batas Timestamp & Media Integrity
- Sebelum render dimulai, setiap segmen `[startSec, endSec]` dalam EDL wajib divalidasi:
  - `0 <= startSec < endSec <= actualDurationSec` (diambil dari `ffprobe`),
  - Total durasi akhir patuh terhadap rentang durasi wajib pada Brief Rulebook (atau memberi flag `brief_compliance: WARN/FAIL` yang transparan).
- Output standar upload TikTok & YouTube:
  - Codec Video: `libx264`, pixel format `yuv420p`, `-movflags +faststart` (agar langsung bisa diputar cepat di HP/browser), resolusi `1080x1920` (9:16) atau `1920x1080` (16:9), FPS konstan `30` (atau ikut sumber jika 60fps).
  - Codec Audio: `aac` 192kbps 48kHz stereo (atau audio track diam valid jika `muteOriginal: true` agar tidak ditolak oleh beberapa parser platform).

## 3. Resep Audio Lapangan (Wajib Mendukung Skenario Content Rewards)
- **Original Normal (`originalVolume: 1.0`, `muteOriginal: false`):** Terapkan `loudnorm=I=-14:TP=-1.5:LRA=11` agar volume setara standar TikTok/YouTube.
- **Original Ducking (`originalVolume: 0.15 - 0.30`):** Kecilkan volume asli secara mulus agar siap ditumpuk *Trending Sound* langsung di aplikasi TikTok/YouTube.
- **Mute Original Total (`muteOriginal: true` / `originalVolume: 0`):** Hapus/bisukan audio asli (ganti track hening valid) dan otomatis perbarui instruksi audio di Upload Playbook agar kreator tahu video ini disiapkan 100% untuk sound platform.

## 4. Safe-Zone Subtitle & Hook Banner
- Gunakan koordinat safe-zone terukur untuk frame `1080x1920`:
  - **TikTok Safe-Zone:** Hindari 15% atas (search/following bar), 20% kanan (like/comment/share/sound icons), dan 25% bawah (caption/username/audio ticker). Area subtitle default berada di `MarginV` aman sekitar `360px-480px` dari bawah (sekitar 68%-76% tinggi layar) dengan `MarginR >= 160px`.
  - **YouTube Shorts Safe-Zone:** Hindari 12% atas, 18% kanan, dan 22% bawah.
- Setiap kali user mengubah gaya atau memperbaiki typo subtitle lewat *Inline Subtitle Editor*, file `.ass` & `.srt` diperbarui lalu dirender ulang tanpa mengubah potongan video kecuali diminta.

## 5. Ketahanan Queue, Estimasi Token & Hygiene Storage
- Sebelum mengeksekusi batch generate, tampilkan estimasi jumlah token input/output agar user dapat mengontrol biaya API BYOK.
- Terapkan exponential backoff saat API AI mengembalikan `429 Rate Limit`, dan izinkan **Partial Batch Retry** (ulang 1 clip yang gagal saja).
- Sediakan pembersihan aman untuk folder `storage/temp` setelah job selesai/gagal agar disk lokal tetap lega.
