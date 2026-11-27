# Clip Content Rewards (`v1.0.0`)

Studio produksi video lokal berbasis **Monorepo (Nuxt 3 / Vue 3 + Express.js)**, **BYOK AI API**, **SQLite lokal (WAL mode, zero-config)**, dan **FFmpeg lokal** untuk mengubah brief campaign (`.doc`, `.docx`, `.pdf`, teks) dan video mentah **Content Rewards** menjadi banyak variasi konten siap upload di **TikTok** dan **YouTube (Shorts & Long)**.

Berjalan **100% lokal di PC/Laptop** (gratis biaya server & render, bebas watermark) dan dapat diakses dari **HP di jaringan Wi-Fi LAN yang sama** untuk preview serta mengunduh langsung video/ZIP siap upload.

---

## Fitur Utama (`v1.0.0` Lengkap)

1. **3 Tema Studio Switchable dengan Slicing & Interaksi Berbeda ([DESIGN.md](./DESIGN.md))**:
   - **Editing Room**: Dark Pro Broadcast Console (`#0D0F12`, left rail + telemetry monospace + aksen Emerald `#10B981`).
   - **Daylight Editorial**: Warm Paper Magazine Desk (`#F6F3EC`, topbar editorial + `Newsreader` serif + aksen Vermilion `#C2410C`).
   - **Tactile Workbench**: High-Craft Neo-Tactile Desk (`#EEF2F6`, floating pill dock + border `2px` + tombol fisik press-down + aksen Cobalt `#1D4ED8`).
2. **Keamanan Lokal, System Doctor & Brankas BYOK API Key (`M4`)**:
   - Autentikasi lokal (`bcryptjs` + `HttpOnly JWT`), System Doctor (cek `FFmpeg`, `FFprobe`, `Fonts`, `SQLite WAL`, & rincian kapasitas storage), enkripsi kunci API `AES-256-GCM` tanpa kebocoran plaintext, serta *Test Connection* 6 penyedia (Gemini, OpenAI, Claude, OpenRouter, Groq Whisper, Deepgram).
   - **37 Master Presets Dinamis** (Negara/Timezone, Usia, Gaya Editing, Hook 3 Detik, Level Kontroversi, Mode Framing 9:16, & 9 Preset Prompt Lapangan) yang dapat ditambah/diedit langsung di UI.
3. **Manajemen Campaign, Brief Parser & Raw Media Ingestion (`M5`)**:
   - Ekstraksi aturan brief otomatis dari `.pdf`, `.docx`, `.doc`, `.txt`, atau tempel teks manual menjadi **Editable Brief Rulebook**.
   - Upload video mentah berukuran besar secara *chunked* (`4 MB/part`) + aset pendukung (`watermark` PNG, `outro`, `broll`), **Audio Diagnostic** otomatis (`volumedetect` + peta jeda hening), serta **Auto-Chunked Whisper/Deepgram STT** (potong audio <=10 menit agar kebal batas 25 MB Whisper API).
4. **Target Audience Matrix & Multi-Variant AI Auto-Editor (`M6`)**:
   - Parameter targeting lengkap (Platform, Negara, Bahasa, Usia, Persona/Niche, Kontroversi, Tipe Hook 3 Detik, Pemicu Emosi, Primary KPI, Gaya Editing, 3 Mode Framing 16:9->9:16 `fit_blur_bg` / `center_crop` / `split_screen`, Gaya Caption, Mode Audio Awal `Original -14 LUFS` / `Ducking 20%` / `Mute 0%`, Diversifikasi Batch, Jumlah Variasi 1-10) + simpan/muat **Target Profile** + cek estimasi token & durasi render.
   - Antrean render persisten SQLite (`MAX_RENDER_CONCURRENCY=1` agar laptop tidak hang) + progres real-time **SSE** + HTTP `206 Partial Content` scrubbing video player.
5. **Viral Score 6 Dimensi, Proyeksi Dampak, Kritik & Upload Playbook (`M7`)**:
   - Penilaian skor viral `0-100` (6 dimensi) + **Audit Kepatuhan Brief** (`PASS`/`WARN`/`FAIL`) + ranking & filter variasi.
   - **Proyeksi Dampak Upload** (4 kartu) + **Kritik Spesifik per Timestamp** (klik `Lompat ke 00:xx` untuk seek player & tombol 1-klik `Perbaiki dengan Prompt`).
   - **Safe-Zone Overlay Player** (`Off | TikTok | YT Shorts`) + **Upload Playbook** lengkap (panduan audio/musik tersinkron dengan audio fisik video, 3 opsi judul A/B, caption siap tempel, hashtag bertingkat, jadwal tayang optimal sesuai zona waktu target, pinned comments, checklist 15 menit pertama, & tombol 1-klik *Salin Semua Playbook*).
6. **Iterative Prompt Re-Editor, Inline Subtitle & Clip Versioning (`M8`)**:
   - Edit ulang **1 klip spesifik saja** lewat prompt bahasa alami + 9 chip Preset Cepat Lapangan (*Mute Audio 0%*, *Kecilkan Audio 15%/30%*, *Normalize Vokal*, *Potong 2 Detik Awal*, *Zoom 115%*, *Naikkan Subtitle Safe-Zone*, *Tambah CTA Brief*) + **Editor Teks Subtitle Inline**.
   - Penyimpanan non-destruktif per versi (`v1`, `v2`, `v3`), hitung ulang skor viral + sinkronisasi otomatis Upload Playbook, **Rollback**, dan **Tandai Final**.
7. **Single Export, Bulk Streaming ZIP Anti-OOM & Storage Hygiene (`M9`)**:
   - Unduh satuan (`.mp4`, `upload-playbook.txt`, `subtitles.srt`, `cover.jpg`) atau **Bulk Streaming ZIP** (`Semua Siap`, `Skor >= 80`, `Hanya Final`, atau `Checklist Manual`) berisi `00-RINGKASAN-CAMPAIGN-DAN-JADWAL-UPLOAD.md` + folder terurut skor (`store: true` hemat CPU & anti-OOM).
   - Rincian pemakaian disk (`Uploads`, `Renders`, `Temp`) + tombol aman **Bersihkan File Sementara** di System Doctor.

---

## Prasyarat Sistem Lokal

- **Node.js** `>= 22.0.0` (terverifikasi pada `v24.18.0`) & **npm** `>= 10`
- **FFmpeg & FFprobe** tersedia di `PATH` sistem (terverifikasi pada `8.1.2-full_build`)
- **Google Chrome / Microsoft Edge** (hanya jika ingin menjalankan suite uji Playwright E2E)

---

## Cara Menjalankan Secara Lokal

```bash
# 1. Salin konfigurasi lingkungan lokal (isi JWT_SECRET & APP_ENCRYPTION_KEY 32-byte hex)
cp .env.example .env

# 2. Install seluruh dependency monorepo
npm install

# 3. Build kontrak shared, siapkan database SQLite WAL & seed 37 preset bawaan
npm run build -w @clip/shared
npm run db:generate
npm run db:push
npm run db:seed

# 4. Jalankan Backend API (port 4000) & Frontend Studio (port 3000) bersamaan
npm run dev
```

Buka **`http://localhost:3000`** di browser Anda. Pada kunjungan pertama, buat akun admin lokal, lalu tempelkan API Key BYOK Anda (misal Gemini/OpenAI + Groq Whisper) pada halaman **Brankas API & Mesin**.

### Akses dari HP di Jaringan Wi-Fi LAN yang Sama

Untuk melihat preview video dan langsung mengunduh `.mp4` / `.zip` ke HP (tanpa kabel):
1. Jalankan Nuxt dev server dengan binding host LAN (`npm run dev -w @clip/web -- --host 0.0.0.0`) sementara API tetap aktif di laptop (`npm run dev:api`).
2. Cek IP lokal laptop (Windows: `ipconfig`, contoh `192.168.1.15`).
3. Buka **`http://192.168.1.15:3000`** di browser HP yang terhubung pada Wi-Fi yang sama. Seluruh panggilan `/api/*` otomatis diteruskan oleh proxy server Nitro Nuxt sehingga bebas kendala CORS.

---

## Struktur Monorepo (`npm Workspaces`)

```text
clip-content-rewards/
├── packages/shared/   # Kontrak Zod & TypeScript types bersama (EDL v1.1, ViralScore, Playbook)
├── apps/api/          # Express.js (TS) + Prisma SQLite WAL + Local FFmpeg & Archiver Engine
├── apps/web/          # Nuxt 3 / Vue 3 SPA Studio + 3-Theme Engine + H3 API Proxy
├── tests/e2e/         # 5 Suite Playwright-core E2E hemat token (M4, M5, M6, M7/M8, M9)
├── .agents/           # Tata kelola proyek, 8 Menu Docs Standar V2, Case-Bank & sync-docs.js
└── storage/           # Media lokal & SQLite DB (git-ignored)
```

---

## Perintah Pengujian, Build & Tata Kelola

```bash
# Typecheck & Build seluruh workspace (shared + api + web)
npm run typecheck
npm run build

# Pengujian Integrasi Backend (Vitest + FFprobe nyata + ZIP tar -tf)
npm test

# Pengujian Browser E2E penuh lintas M4, M5, M6, M7/M8, dan M9 (membutuhkan build terbaru)
npm run test:e2e:all

# Status sesi milestone & sinkronisasi dokumentasi ke portal documentasi-projects
npm run session:status
npm run docs:sync
```

---

## Dokumen Perencanaan & Tata Kelola

- [PRD.md](./PRD.md) : Product Requirements Document (`v1.1`).
- [MILESTONE.md](./MILESTONE.md) : Peta eksekusi bertahap (`M0` - `M10` selesai + backlog V2).
- [DESIGN.md](./DESIGN.md) : Arah visual 3 tema switchable & standar kontras WCAG AA.
- [AGENTS.md](./AGENTS.md) & [.agents/README.md](./.agents/README.md) : Guardrails, aturan teknis, [Indeks Menu Docs V2](./.agents/menu-docs/README.md), dan [Daftar Kasus Bug](./.agents/knowledge/bug-cases.md).
