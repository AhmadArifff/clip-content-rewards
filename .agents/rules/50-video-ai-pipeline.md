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

## 4. Safe-Zone Subtitle & Hook Banner (Kalibrasi HP 2026)
- Gunakan koordinat safe-zone terukur untuk frame `1080x1920`:
  - **TikTok Safe-Zone:** Hindari `9%-10%` atas (tab `Teman | Mengikuti | Saran` + Search), `20%` kanan (avatar+, like, comment, bookmark, share, sound disc -> `MarginR >= 215px`), dan `29%-30%` bawah (efek, kreator, caption 2 baris, audio ticker -> `MarginV >= 560px`, default `verticalOffsetPct = 66%`).
  - **YouTube Shorts Safe-Zone:** Hindari `9%` pojok kanan atas (`Search` + `...`), `18%-20%` kanan (`MarginR >= 195px`), dan `22%-23%` bawah (`Avatar + @Handle + Subscribe` + judul -> `MarginV >= 440px`, default `verticalOffsetPct = 72%`).
  - **CTA Overlay (`CtaOverlay`):** Posisikan rapi tepat di tepi bawah zona aman (`565px` TikTok / `455px` YT Shorts) agar tidak menutupi wajah/mulut pembicara maupun bertabrakan dengan metadata platform.
- Setiap kali user mengubah gaya atau memperbaiki typo subtitle lewat *Inline Subtitle Editor*, file `.ass` & `.srt` diperbarui lalu dirender ulang tanpa mengubah potongan video kecuali diminta.

## 5. Ketahanan Queue, Estimasi Token & Hygiene Storage (Zero Silent Auto-Delete)
- Sebelum mengeksekusi batch generate, tampilkan estimasi jumlah token input/output agar user dapat mengontrol biaya API BYOK.
- Terapkan Free-Tier RPM Pacer, retry `429/503`, Gemini Model Waterfall (`pro -> flash -> flash-lite`), dan izinkan **Partial Batch Retry** (ulang 1 clip yang gagal saja).
- **Zero Silent Auto-Delete Policy (`M18`):** Sistem **dilarang** menghapus video hasil generate atau video mentah secara diam-diam di background. Pembersihan selalu didahului peringatan retensi (`14/30 hari` tanpa interaksi/jadwal atau melewati kuota disk), pratinjau Dry-Run MB, opsi **Arsip Ringan** (hapus MP4 saja, pertahankan Skor/Playbook/Kalender/Excel), opsi **Pin/Snooze**, proteksi kunci HTTP `409` bila ada `render_jobs` aktif, serta audit log ke `storage_cleanup_logs`.

## 6. Multi-Video Director, Anti-Cut Speech Boundary & Kunci Bahasa Target Negara
- **Multi-Video Utilization:** Jika campaign memiliki >1 `raw_video`, `render-queue.worker.ts` wajib meneruskan SELURUH `rawVideos[]` (beserta transkrip, durasi, dan silence masing-masing) ke `planMultiVariantEdls()` agar variasi terdistribusi lintas semua video mentah (termasuk `auto_face_track` per `mediaAssetId`).
- **Anti-Mid-Sentence Cutoff (`snapSegmentToSpeechBoundary`):** Setiap segmen (baik dari AI maupun heuristik) wajib diselaraskan ke batas akhir kalimat (tanda baca `.!?` atau jeda bicara `>= 0.38s`) dan mengikuti `clipEndingMode`: `complete_story` (tuntas sampai akhir kalimat / penuh bila muat batas brief), `full_source` (utuh 0 hingga durasi penuh), atau `part_series` (berurutan Part 1 -> Part 2 lengkap dengan CTA teaser).
- **Target-Country Content Language Lock (`resolveContentLanguage`):** Seluruh teks yang terbaca audiens & algoritma platform (`angleTitle`, `hookBanner.text`, `ctaText`, `titleOptions`, `captionDescription`, `hashtags`, `pinnedComments`) WAJIB 100% mengikuti bahasa target negara (Bahasa Inggris untuk `US`/`UK`/`AU`/`CA`/`SG`/`GLOBAL`, bebas teks & hashtag Indonesia seperti `#tiktokindonesia`), sementara catatan evaluasi internal studio tetap berbahasa Indonesia human-friendly untuk kreator.
