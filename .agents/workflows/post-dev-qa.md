# SOP Post-Development QA (Hemat Token & Berlapis)

Setiap modul selesai dibangun wajib melalui QA independen sebelum ditandai `VERIFIED_PASS`:

## Tier 1 - Automated Logic, Schema & Media Probe (Wajib Setiap Selesai Fitur)
1. **Typecheck & Lint:** Pastikan `tsc --noEmit` (client & server) bersih tanpa error.
2. **Unit & Integration Tests:**
   - Validasi enkripsi/dekripsi AES-256-GCM BYOK & masking output (zero plaintext leak).
   - Validasi Zod parser Brief, EDL JSON, Viral Score, Playbook, dan EDL Patch.
   - Validasi `FfmpegCommandBuilder` (anti shell-injection & clamp durasi).
3. **Media Output Probe (Khusus M5-M9):**
   - Verifikasi file `.mp4` hasil render dengan `ffprobe` (cek codec `h264`/`aac`, `yuv420p`, resolusi `1080x1920`, durasi sesuai EDL, dan verifikasi level volume audio aktual untuk skenario *Mute 0%* / *Ducking 15%*).
   - Verifikasi file Bulk ZIP dapat diekstrak bersih tanpa korupsi.

## Tier 2 - Mandatory Delivery Gate 4-Blok (`antislop`)
- **Block 1 (Hard Gate):** Zero console error, zero mobile overflow, kontras WCAG AA, keyboard navigation, zero broken button, zero API key leak.
- **Block 2 (Purpose-Gate):** Setiap elemen visual punya fungsi operasional yang jelas.
- **Block 3 (Liveliness):** Semua state UI (`loading`, `empty`, `error`, `partial_success`, `success`) terverifikasi.
- **Block 4 (Craftsmanship):** Zero dead code, komentar kode ringkas & bersih, copywriting Indonesia human-friendly.

## Tier 3 - Browser E2E Testing (Playwright - On-Demand)
- Ajukan *Planning Flow Testing* dan tunggu persetujuan pengguna sebelum menjalankan browser Playwright (lihat [playwright-testing.md](./playwright-testing.md)).
