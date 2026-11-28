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

## 7. Multimodal Cinema Remix Engine & FFmpeg Cinema VFX (`M19` - 100% Gratis)
- **Zero Thinking-Token Truncation:** Untuk model `gemini-2.5-flash*`, kirim `thinkingConfig: { thinkingBudget: 0 }` (dengan auto-retry tanpa field itu bila model baru seperti `gemini-3.5-flash` mengembalikan `400`) serta waterfall otomatis ke `gemini-2.5-flash -> gemini-2.5-flash-lite` bila model mengembalikan `404`/`429`.
- **Vision Storyboard Indexing:** Sebelum menyusun EDL `cinema_remix`, ekstrak contact-sheet `3x2` lokal per video (`vision-storyboard.service.ts`) lalu hapus file temp segera setelah dibaca base64 agar Gemini Vision benar-benar melihat adegan visual semua video mentah.
- **True Cross-Video Remix & VFX:** Mode default `cinema_remix` menggabungkan segmen lintas video (`>= 2` `mediaAssetId` dalam 1 klip) dengan normalisasi timebase `fps=30,format=yuv420p,setsar=1,settb=AVTB` agar `xfade` + `acrossfade` stabil di FFmpeg 8.1.2, dilengkapi 5 preset Cinema Color Grading, per-segment Speed Ramp (`0.6x-1.6x`), `zoompan d=1` camera motion, serta pelaporan transparan `edl.directorMode` & `edl.directorNote` (tanpa fallback diam-diam).

## 8. Precision Subtitle Sync & Smart Anti-Double-Caption (`M20` - 100% Gratis)
- **Single-Formula Timeline Math (`computeEdlSegmentTimeline`):** `ass-subtitle.builder.ts` dan `edl-renderer.service.ts` WAJIB berbagi rumus kompensasi `speed` (`(endSec - startSec) / speed`) dan overlap transisi `xfade` (`td`) agar timestamp `.ass`/`.srt` selalu 100% sinkron hingga akhir video tanpa drift atau timestamp terbalik.
- **Anti-Hallucination & Segment/Silence Isolation:** Saring seluruh token tanda baca murni Whisper (`"."`, `"..."`, `"[Music]"`) di `stt.adapter.ts` & `ass-subtitle.builder.ts`, dan WAJIB pecah pengelompokan cue saat berpindah `segIndex` atau melintasi jeda hening `>= 0.65s` agar subtitle tidak pernah ditarik mundur muncul lebih awal di detik `0:00`.
- **Deteksi 3 Lapis Subtitle Bawaan (Anti-Double Subtitle):** (1) Deteksi trek `subtitle` lunak di `media-probe.service.ts`; (2) Pemindaian 1x ter-cache permanen via Gemini Vision pada contact-sheet `3x2` di `embedded-caption-detector.service.ts`; (3) Saklar manual override per video mentah (`PATCH /api/media/:mediaId/embedded-subtitle`) + opsi `captionOverlapMode` (`auto_skip_embedded` default). Segmen yang berasal dari video bersubtitle bawaan otomatis dilewati saat burn-in ASS, sementara segmen dari video bersih tetap mendapat subtitle sinkron.
- **Clean Viewer-Facing Hook Banner:** Dilarang menyisipkan tag demografi atau kode negara dalam kurung seperti `(Young Creators & Professionals)` atau `(US)` pada teks layar `hookBanner.text`.

## 9. Multi-Persona Critic Council & Anti-Hallucination Re-Editor (`M21` - 100% Gratis)
- **Grounded Critic Injection (`critic-council.service.ts`):** Dewan Kritikus (9 peran: `general_audience`, `target_matrix`, `roger_ebert`, `cinema_poetica`, `pauline_kael`, `shandy_gasella`, `cine_crib`, `tony_zhou`, `mark_kermode`; kombinasi 1-3 peran per sesi) WAJIB diberi *Engine Capability Manifest* dan fakta EDL aktual (beserta contact-sheet visual bila Gemini Vision aktif). Dilarang menyarankan aksi di luar kemampuan FFmpeg EDL v1.1 dan dilarang menghasilkan frase AI slop maupun em-dash.
- **Anti-Hallucination Patch Verifier (`verifyAndDiffEdlPatch`):** Sebelum `renderEdlToMp4()` dieksekusi pada `POST /regenerate` (serta pada `POST /preview-patch`), seluruh `segmentsPatch` wajib diverifikasi terhadap `availableSources[]` aktual (memulihkan `mediaAssetId` fiktif dan clamp `endSec <= durationSec`), dikunci bahasanya sesuai negara target, dihitung diff nyatanya (`appliedChanges[]`), dan ditolak dengan HTTP `422 PATCH_NO_EFFECTIVE_CHANGE` jika patch tidak menghasilkan perubahan efektif (Zero Silent No-Op Guard).
- **HD & YouTube 16:9 Cover Export:** Unduhan kandidat cover tidak boleh memakai preview `320px`; endpoint `?download=1&format=hd|yt16x9` mengekstrak langsung dari `video.mp4` (`-q:v 2`) dalam resolusi Full HD asli atau Thumbnail YouTube `1280x720` (`fit-blur-bg` 16:9).
