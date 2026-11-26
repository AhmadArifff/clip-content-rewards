# SOP Pengujian Browser Playwright (`playwright-testing`)

> [!IMPORTANT]
> Pengujian browser Playwright hanya dijalankan atas permintaan atau persetujuan pengguna setelah *Planning Flow Testing* disepakati.

## 1. Prasyarat Pengujian
- Backend Express (`http://localhost:4000` atau port `.env`) dan Frontend Nuxt 3 (`http://localhost:3000`) aktif.
- Gunakan fixture video mentah pendek dummy (dibangkitkan via FFmpeg `testsrc` + `sine` 15-30 detik) dan mock/sandbox AI adapter untuk pengujian E2E deterministik tanpa membakar kuota API key produksi milik user.

## 2. Skenario Wajib E2E (End-to-End Critical Path)
1. **Auth & System Doctor:** Login akun lokal -> cek indikator FFmpeg hijau di `/settings/api-keys`.
2. **BYOK Vault:** Simpan API key uji -> pastikan UI menampilkan versi ter-masking -> tidak ada plaintext key di DOM maupun response network.
3. **Campaign & Brief:** Buat campaign -> upload contoh `.docx`/`.pdf` -> cek hasil ekstraksi aturan tampil dan bisa diedit.
4. **Raw Media & Generate Batch:** Upload video dummy -> isi Target Audience Matrix (Country, Usia, Kontroversi, Audio Mode) -> klik Generate -> cek SSE progress hingga kartu variasi muncul terurut dari skor tertinggi.
5. **Clip Inspector & Safe-Zone:** Buka detail 1 clip -> aktifkan toggle *Safe-Zone TikTok / YouTube Shorts* -> cek tab *Upload Playbook* & *Dampak/Kritik*.
6. **Prompt Regenerate & Versioning:** Klik preset *Mute Audio Asli (0%)* / ketik prompt -> render `v2` -> pastikan versi `v1` & `v2` dapat dibandingkan dan di-rollback.
7. **Export & Mobile Viewport:** Cek tombol download single & bulk ZIP, serta verifikasi tampilan mobile `390x844` bebas horizontal overflow.
