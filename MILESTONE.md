# MILESTONE.md - Roadmap & Tata Kelola Proyek `clip-content-rewards`

> **Dokumen Induk Eksekusi Bertahap (Master Timeline & Milestone Tracker)**
> Proyek: **Clip Content Rewards (AI Auto-Editor, Viral Scorer & Upload Playbook Studio untuk TikTok & YouTube)**
> Status Saat Ini: **M2 Selesai (`.agents/` Governance & Docs V2) -> Siap Masuk ke M3 (Deep Planning, Gap Audit `PRD.md` & Visual-First Gate)**
> Terakhir Diperbarui: **2026-11-26**

---

## 1. Ringkasan Visi & Alur Utama Produk

`clip-content-rewards` adalah web tools produksi konten otomatis berbasis **BYOK (Bring Your Own Key) AI API** untuk kreator dan clipper yang mengikuti campaign di platform **Content Rewards** (TikTok & YouTube Shorts/Long).

### Alur Inti Sistem (3 Tahap End-to-End)

1. **Tahap 1: Brief Ingestion, Raw Media & Multi-Variant AI Auto-Editor**
   - Input brief campaign dari owner dalam format `.doc`, `.docx`, `.pdf`, atau teks + upload video mentah (raw footage).
   - Konfigurasi parameter target & strategi viral sebelum generate: **Country/Region, Rentang Usia, Bahasa/Gaya Bahasa, Persona/Niche, Tingkat Kontroversi/Polarisasi, Tipe Hook 3 Detik Pertama, Pemicu Emosi, Target KPI (Watch-Time/Comments/Shares/Clicks), Target Platform (TikTok / YouTube Shorts / YouTube Long), Gaya Editing/Pacing, Gaya Caption Safe-Zone, Mode Audio Awal, dan Jumlah Variasi Batch**.
   - AI (via API Key milik user) membedah brief, mentranskrip video mentah (*word-level timestamps*), menyusun banyak rencana edit (*Edit Decision List / EDL JSON*), merender variasi video secara asinkron, dan mengevaluasi skor viral tiap variasi.
2. **Tahap 2: Viral Score, Impact & Critique, Upload Playbook & Prompt Re-Editor**
   - Setiap video hasil generate menampilkan:
     - **Viral Score Breakdown (0-100)** + **Checklist Kepatuhan Brief (Brief Compliance)**.
     - **Upload Playbook Siap Pakai**: strategi backsound/musik (termasuk panduan pakai *Trending Sound* TikTok/YouTube langsung di aplikasi), opsi judul/hook cover, caption/deskripsi, kombinasi hashtag/tag, jam tayang optimal sesuai target Country + Timezone + Usia, ide *pinned comment*, dan cover frame.
     - **Projected Upload Impact & Kritik Spesifik**: analisis dampak saat di-upload terhadap target audiens dan daftar kritik konkret agar user tahu bagian mana yang harus diperbaiki.
   - **Iterative Prompt Regenerate (Per Video)**: user bisa mengedit ulang **1 video spesifik saja** lewat prompt natural (atau preset lapangan 1-klik) seperti *"suara audio asli belum sesuai brief, mute atau kecilkan ke 15% karena akan diganti sound musik dari TikTok/YouTube"*, koreksi typo subtitle, geser posisi safe-zone, potong 2 detik awal, atau perketat jeda hening, lengkap dengan *versioning* (`v1 -> v2 -> v3`) dan tombol *"Jadikan Kritik sebagai Prompt Perbaikan"*.
3. **Tahap 3: Export & Download Fleksibel**
   - **Download Satuan**: unduh video `.mp4` siap upload + `upload-playbook.txt`, `subtitles.srt`, dan `cover.jpg`.
   - **Download Keseluruhan (Bulk ZIP Streaming)**: unduh semua video (atau hasil filter seperti `Score >= 80`) dalam 1 arsip `.zip` terstruktur per folder clip + ringkasan jadwal upload campaign.

---

## 2. Audit & Peta Adopsi Skill dari Global `.agents` & `.gemini/config/skills`

Berdasarkan pemindaian aktual terhadap repositori skill global di mesin ini:
- **`C:\Users\ASUS\.gemini\config\skills\`**: **61 skill** (sumber katalog lengkap, termasuk seluruh suite video production & anti-slop).
- **`C:\Users\ASUS\.agents\skills\`**: **29 skill** (28 di antaranya identik dengan katalog `.gemini/config/skills`, plus 1 skill tambahan `motion-design`).
- **Total Gabungan Unik Global**: **62 skill**.

### Ringkasan Kebutuhan Skill Proyek `clip-content-rewards`

| Kategori Adopsi | Dari `.gemini/config/skills` (61) | Dari `~/.agents/skills` (29) | Total Unik Gabungan (62) | Peran di Proyek |
| :--- | :---: | :---: | :---: | :--- |
| **Tier 1: Core / Wajib MVP** | **25 skill** | 12 skill | **25 skill** | Diadopsi penuh sejak M1-M10 |
| **Tier 2: Pendukung / Fase V2** | **18 skill** | 7 skill | **19 skill** | Dipakai on-demand untuk polish UI, diagram, atau ekspansi V2 |
| **Tier 3: Excluded (Di Luar Domain)** | **18 skill** | 10 skill | **18 skill** | Tidak diadopsi (3D WebGL, game engine, alat luar domain) |
| **TOTAL** | **61 skill** | **29 skill** | **62 skill** | **100% terpetakan** |

### Rincian 25 Skill Core (Wajib Diadopsi untuk MVP)

1. **Governance, Planning & Tracking (5 skill)**
   - `pm` : Penyusunan `PRD.md`, user stories, prioritas MoSCoW, dan manajemen milestone.
   - `goal-tracker` : Pengelolaan `.agents/02-session-state/active-session.json` agar bebas *context drift*.
   - `tech-critic` : Review Devil's Advocate independen (arsitektur queue, keamanan BYOK, anti-halusinasi skor viral).
   - `agentic-ai` : Orkestrasi multi-role (OODA loop, Builder vs Reviewer separation, case-bank YAML).
   - `graphify` : Pemetaan knowledge graph codebase seiring bertambahnya modul.
2. **Video Auto-Editing, Short-Form Viral & QA Pipeline (5 skill)**
   - `herk-edit-kit` : Blueprint FFmpeg auto-editor untuk *real footage* (potong hening `cut-silences`, potong salah ucap `cut-mistakes`, format 9:16 TikTok/Shorts `short-form-edit`).
   - `hyperframes` : Engine overlay HTML+GSAP untuk animated captions, title/hook banner, dan transisi deterministik di atas video mentah.
   - `motionmaxxing` : Standar kualitas hook 3 detik pertama, kinetic typography, dan *Mog Check* anti video generik.
   - `showtime` : Validasi QA video (*visual + hearing pass*) dan **TikTok/Shorts Phone Safe-Zone Check** agar subtitle tidak tertutup UI aplikasi.
   - `hypit` : Pola produksi multi-varian video viral tertambat kata (*word-anchored*) untuk variasi angle/bahasa/audiens dalam satu batch.
3. **Core Software Engineering & UI/UX Architecture (7 skill)**
   - `backend` : Arsitektur API terstruktur (Service/Repository/Result Pattern), enkripsi AES-256-GCM API Key BYOK, parser `.docx/.pdf`, Redis/BullMQ worker video, SSE/WebSocket live progress, dan database schema.
   - `frontend` : Studio web interaktif, state separation, video preview player dengan safe-zone overlay, dan real-time job progress.
   - `shadcn-ui` : Pondasi komponen UI accessible (Radix UI + Tailwind) untuk studio workspace, drawer parameter, modal regenerate, dan tab perbandingan.
   - `untitled-ui` : Pola dashboard SaaS, KPI viral scorecard, sidebar navigasi, dan layout manajemen campaign.
   - `design-dna` : Definisi token warna, tipografi, dan gaya studio dark/light yang konsisten.
   - `paint` : Art direction visual antarmuka studio agar presisi dan tidak generik.
   - `motion` : Micro-interaction panel editor, transisi skor, dan feedback state asinkron.
4. **Anti-Slop Quality & Delivery Gate Suite (6 skill)**
   - `antislop` : Core filter & Mandatory Delivery Gate 4-Blok.
   - `antislop-ui` : Disiplin visual, purpose-gate, dan dose caps komponen UI.
   - `antislop-copywriting` : Kualitas bahasa UI, Upload Playbook, dan Kritik Video yang konkret, tajam, dan humanis.
   - `antislop-human` : Aksesibilitas WCAG AA, kontras warna, dan navigasi keyboard editor.
   - `antislop-layoutmobile` : Responsivitas tampilan mobile agar kreator bisa preview & unduh clip langsung dari HP untuk di-upload ke TikTok/YouTube.
   - `antislop-code` : Higienitas komentar kode (*Zero-Outflow*, ringkas, tanpa komentar AI redundan).
5. **Testing & Verification (2 skill)**
   - `qa` : Strategi pengujian unit/integrasi, boundary testing, race-condition queue, dan audit keamanan BYOK.
   - `playwright` : Automated E2E browser testing seluruh alur dari upload brief hingga bulk ZIP download.

### Rincian 19 Skill Pendukung / Opsional Fase V2

- **Dokumentasi & Diagram Arsitektur (2)**: `stack-diagram`, `archify` (membuat diagram arsitektur & data-flow interaktif untuk `PRD.md` dan portal dokumentasi).
- **Ekspansi Studio Video & Computer Vision V2 (6)**:
  - `openmotion` (V2: Visual Timeline Editor penuh ala CapCut di browser),
  - `reelmimic` (V2: kloning pacing & ritme cut dari video referensi kompetitor viral),
  - `motlab` & `motlab-assets` (V2: anotasi catatan langsung di atas frame video + kit aset brand reusable),
  - `ml-vision` (V2: deteksi wajah/pembicara untuk auto-tracking crop 9:16 & seleksi frame cover terbaik),
  - `webbrain` (V3: asisten browser logged-in untuk menarik data brief campaign otomatis).
- **Ekspor & Polish UI Tambahan (11)**: `excel-export` (V2: ekspor content calendar & rekap performa campaign ke `.xlsx`), `playwright-skill` (alternatif runner Playwright), `motion-design-skill`, `motion-design` (dari `~/.agents/skills`), `21st-dev`, `magic-ui`, `react-bits`, `animate-ui`, `cast`, `animejs`, `_jutsu`.

### Rincian 18 Skill Excluded (Tidak Diadopsi)

- **3D WebGL & Game Engine (14)**: `3d-configurator-simulator`, `diorama`, `teardown`, `ohmygame-studio`, serta 10 modul `threejs-*` (`animation`, `fundamentals`, `geometry`, `interaction`, `lighting`, `loaders`, `materials`, `postprocessing`, `shaders`, `textures`).
- **Luar Domain Proyek (4)**: `mocha` (AI character swap berbasis GPU Wan2.1), `posewear` (galeri referensi pose/outfit gambar), `code-animation-prompts` (341 style generative art), `habblaud` (monitor pixel-art sesi lokal).

---

## 3. Peta Ringkas Seluruh Milestone (M0 - M10)

| Kode | Nama Milestone | Fokus Utama & Output Konkret | Status | Gate Verifikasi |
| :---: | :--- | :--- | :---: | :--- |
| **M0** | **Kickoff & Roadmap Induk** | Pemetaan flow produk, audit 62 skill global, pembuatan `MILESTONE.md` | `DONE` | Review & persetujuan user atas urutan milestone |
| **M1** | **PRD Lengkap & GitHub Backup** | Penyusunan `PRD.md` komprehensif + `git init`, `.gitignore` aman, push awal ke GitHub | `DONE` | `PRD.md` disetujui + repo GitHub aktif (`main` & `dev`) |
| **M2** | **Setup `.agents/` & Sistem Dokumentasi ala `adminShuttleV3`** | `AGENTS.md`, modular `rules/`, `workflows/`, `menu-docs/` V2, `knowledge/`, `02-session-state/`, `04-case-bank/`, `skills/`, & `sync-docs.js` | `DONE` | `session-manager.js` & `sync-docs.js` berjalan bersih |
| **M3** | **Deep Planning, Gap Audit PRD & Visual-First Gate** | Tambahan fitur lapangan dari PRD, kunci Tech Stack, Skema DB, Kontrak EDL JSON, Zod Schemas, ASCII Wireframe & Design DNA | `NEXT` | Approval Review Gate + verifikasi `tech-critic` & `qa` |
| **M4** | **Pondasi App, Auth & BYOK AI Key Manager** | Scaffold proyek, FFmpeg/FFprobe preflight check, Auth & Workspace, Enkripsi AES-256-GCM BYOK API Keys + Test Connection + Token Cost Estimator | `PENDING` | Unit test enkripsi & test koneksi provider sukses |
| **M5** | **Campaign Manager, Brief Parser & Raw Media Ingestion** | CRUD Campaign, Parser `.doc/.docx/.pdf` ke aturan terstruktur, Chunked Video Upload, FFprobe metadata, Word-level Transcription & Silence Detection | `PENDING` | Brief PDF/DOCX terekstrak akurat + transkrip ber-timestamp |
| **M6** | **Target Audience Matrix & Multi-Variant Auto-Editor Engine** | Form parameter viral lengkap, AI Director EDL Generator (multi-angle), Async Queue Worker + SSE Progress, FFmpeg + HyperFrames Caption/Hook Renderer | `PENDING` | Batch 3-5 variasi video ter-render mulus 1080x1920 |
| **M7** | **Viral Score Engine, Impact/Critique & Upload Playbook** | Scoring 6 dimensi + Brief Compliance, Proyeksi Dampak & Kritik Actionable, Upload Playbook lengkap (musik/tag/caption/jam tayang), Safe-Zone Player Overlay | `PENDING` | Playbook & kritik akurat sesuai country/usia/platform |
| **M8** | **Iterative Prompt Re-Editor & Clip Versioning** | Regenerate 1 video via prompt natural + Preset Lapangan (Mute/Duck Audio, Cut Hook, Safe-Zone, Edit Typo Subtitle), EDL Patcher, Versioning (`v1..vN`) & Rollback | `PENDING` | Regenerate mute/duck audio & compare v1 vs v2 lulus |
| **M9** | **Single & Bulk ZIP Streaming Export** | Download satuan (`.mp4` + playbook + `.srt` + cover) & Bulk ZIP Streaming terstruktur + filter skor + auto-cleanup file temp | `PENDING` | Unduh satuan & ZIP multi-clip bebas korupsi/OOM |
| **M10** | **E2E QA, Delivery Gate, Docs Sync & Release v1.0** | Unit/Integration tests, Playwright E2E full flow, Mandatory Delivery Gate 4-Blok, finalisasi `menu-docs/` + mirror ke `documentasi-projects`, Release `v1.0.0` | `PENDING` | Semua test hijau + Delivery Gate PASS + Docs tersinkron |

---

## 4. Detail Langkah Pengerjaan Bertahap (Step-by-Step Blueprint)

### Milestone 1 (`M1`): Penyusunan `PRD.md` & Backup Version Control ke GitHub
**Skill Aktif**: `pm`, `tech-critic`, `antislop-copywriting`

- [x] **1.1 Penulisan `PRD.md` Lengkap di Root Proyek**:
  - Problem Statement, Target Persona (Clipper pemula, Agency Content Rewards, Creator solo), dan Success Metrics.
  - Rincian **Flow 1, Flow 2, Flow 3** lengkap dengan *Given/When/Then* Acceptance Criteria.
  - Spesifikasi lengkap **Target Audience & Viral Matrix** (Country, Age Group, Persona/Niche, Bahasa/Dialek, Tingkat Kontroversi Policy-Safe, Tipe Hook 3 Detik, Pemicu Emosi, Primary KPI, Platform & Aspect Ratio, Editing Style/Pacing, Caption Style, Audio Strategy awal, Batch Count).
  - Spesifikasi **Upload Playbook** (strategi audio asli vs *Trending Sound* TikTok/YouTube, judul A/B, deskripsi/caption, hashtag tiered, jam tayang optimal lintas timezone, *pinned comment*, rekomendasi thumbnail/cover).
  - Spesifikasi **Viral Score Rubric (0-100)**, **Projected Upload Impact**, **Actionable Critique**, dan alur **1-Click Critique-to-Prompt Regenerate**.
  - Spesifikasi **Prompt Re-Editor & Quick Presets Lapangan** (Audio Mute/Ducking/Normalize, Cut Intro/Silence, Shift Safe-Zone, Koreksi Typo Subtitle, Crop/Zoom, Tambah Elemen Wajib Brief) + *Clip Versioning*.
  - Spesifikasi **BYOK API Gateway** (multi-provider LLM + Speech-to-Text + enkripsi key + estimasi biaya + fallback error/rate-limit).
  - Spesifikasi **Export & Download** (Single + Bulk Streaming ZIP) & Non-Functional Requirements (keamanan, kuota storage, batasan file video, performa queue).
  - Prioritas **MoSCoW** (MVP v1.0 vs Backlog V2).
- [x] **1.2 Setup Git & Backup Awal ke GitHub**:
  - Jalankan `git init`, buat `.gitignore` ketat (blokir `.env*`, folder upload video mentah, hasil render lokal, temporary cache, `node_modules`).
  - Buat `README.md` ringkas berisi ringkasan proyek dan pointer ke `MILESTONE.md` & `PRD.md`.
  - Siapkan branch `main` dan `dev`, lalu lakukan commit & push awal ke repositori GitHub user sebagai baseline backup.

---

### Milestone 2 (`M2`): Pembuatan `.agents/` dengan Adopsi Skill & Dokumentasi ala `adminShuttleV3`
**Skill Aktif**: `agentic-ai`, `goal-tracker`, `pm`

Mengadaptasi penuh standar tata kelola dan pelacakan `adminShuttleV3` ke konteks `clip-content-rewards`:

- [x] **2.1 Root Governance File (`AGENTS.md`)**:
  - System Identity Card (`clip-content-rewards`, Tech Stack, Arsitektur, Media Engine, Dev Server).
  - Larangan Mutlak (Zero Secret/API-Key Leak, Review Gate Wajib Sebelum Koding, Zero-Outflow Code Comments, No Dead Code, Strict Layer Separation, Docs-First Retrieval & Self-Enrichment, Relative-Path API, No Uncontrolled FFmpeg Shell Injection).
  - Alur Kerja Wajib (Review Task 8 Pilar -> Approval -> Coding -> QA -> Docs V2 + `sync-docs.js`).
- [x] **2.2 Struktur Modular `.agents/`**:
  - `.agents/README.md` : Peta navigasi aturan, workflow, knowledge base, skills, dan session state.
  - `.agents/rules/` :
    - `00-core-guardrails.md` (Guardrails mutlak, keamanan BYOK, proteksi file media, larangan shell injection FFmpeg).
    - `01-workflow-discipline.md` (OODA loop, Review Gate, zero-outflow comments, eliminasi dead code, docs-first protocol).
    - `10-architecture.md` (Clean modular architecture: Controller/Route -> Service -> Repository/Adapter -> Queue Worker, ServiceResult pattern, Zod boundary validation).
    - `20-database.md` (Konvensi skema Prisma/DB, migrasi aman, nilai DB Bahasa Inggris vs UI Bahasa Indonesia, dynamic master data).
    - `30-ui-frontend.md` (Visual-First Gate, Safe-Zone preview standard, anti-slop UI, modal reusable, toast/progress streaming, mobile responsiveness).
    - `40-security-byok.md` (Enkripsi AES-256-GCM API Key BYOK, masking key di UI, zero-log secret policy, sanitasi file upload `.docx/.pdf/video`, RBAC).
    - `50-video-ai-pipeline.md` (Standar kontrak EDL JSON, parameter FFmpeg tervalidasi, manajemen storage temp/cleanup, retry & idempotency queue, rate-limit handling AI API).
  - `.agents/workflows/` :
    - `task-review-protocol.md` (SOP Review Task sebelum koding + audit celah lapangan).
    - `new-module.md` (SOP pembuatan modul/halaman baru + update `menu-docs/`).
    - `post-dev-qa.md` (SOP QA pasca-development hemat token + approval gate testing).
    - `playwright-testing.md` (SOP pengujian browser E2E).
  - `.agents/menu-docs/` :
    - `README.md` (Indeks seluruh menu/modul proyek dengan status tracking).
    - `TEMPLATE-MENU-DOC.md` (Template baku **Standar V2 10 Bagian** adaptasi `adminShuttleV3`, termasuk Peta Alur & Flow Testing Per-Konten UI + Disambiguasi Lintas-Menu).
  - `.agents/knowledge/` :
    - `README.md`, `bug-cases.md` (log kasus bug & solusi), `cross-menu-disambiguation.md`, dan `domain-reference/` (referensi domain Content Rewards, algoritma TikTok/YT Shorts, FFmpeg filter recipes, format EDL JSON).
  - `.agents/02-session-state/` :
    - `active-session.json` (Single Source of Truth milestone, active goal, locked constraints).
    - `session-manager.js` (CLI cepat `node .agents/02-session-state/session-manager.js` untuk cek status sesi & milestone).
  - `.agents/04-case-bank/cases/` : Folder pola terverifikasi berformat YAML.
  - `.agents/skills/` : Manifest adopsi **25 Core Skills** + skill lokal khusus proyek bila diperlukan (misal `edl-video-renderer` & `viral-playbook-rubric`).
  - `.agents/scripts/sync-docs.js` : Skrip mirroring dokumentasi `.agents/menu-docs/` & dokumen fondasi ke portal SaaS `C:\Users\ASUS\Documents\Web Dev\improving\documentasi-projects\content\projects\clip-content-rewards\`.

---

### Milestone 3 (`M3`): Deep Technical Planning, Gap Analysis `PRD.md` & Visual-First Gate
**Skill Aktif**: `pm`, `backend`, `frontend`, `design-dna`, `paint`, `tech-critic`, `qa`, `stack-diagram`

Sebelum menulis kode aplikasi, kita audit kelengkapan `PRD.md` dan mengunci seluruh keputusan teknis:

- [ ] **3.1 Audit Celah Lapangan (*Field Edge-Case & Gap Audit*) atas `PRD.md`**:
  - Penanganan file video mentah berukuran besar (500MB - 2GB+): *chunked/resumable upload* & local/S3 storage.
  - Penanganan brief kompleks (PDF hasil scan/gambar vs teks, file `.doc` lama vs `.docx`, tabel persyaratan brief).
  - Penanganan *audio copyright & TikTok/YT policy*: deteksi apakah raw video sudah punya musik berhak cipta sehingga sistem memberi peringatan & saran *vocal-isolation / mute*.
  - Penanganan kegagalan parsial pada batch generate (misal 4 dari 5 clip sukses, 1 gagal karena rate limit API -> bisa retry 1 clip saja tanpa ulang semua).
  - Penanganan biaya token API user: *dry-run token estimator* & batas maksimal variasi per batch agar API key user tidak jebol.
  - Penanganan *safe-zone UI* yang berbeda antara TikTok (kanan + bawah + atas) dan YouTube Shorts (kanan + bawah).
  - Melengkapi kekurangan yang ditemukan langsung kembali ke `PRD.md` (versi `v1.1`) dan `MILESTONE.md`.
- [ ] **3.2 Penetapan & Penguncian Tech Stack (`established_constraints`)**:
  - Menentukan pilihan final bersama user (rekomendasi default yang efisien untuk video processing lokal/server):
    - **Frontend**: Next.js (App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand) atau Nuxt 3 / Vue 3 sesuai preferensi user.
    - **Backend & Worker**: Node.js / Express + TypeScript + Prisma ORM + PostgreSQL (Supabase / lokal) + BullMQ + Redis (atau fallback SQLite/in-process queue untuk mode *local single-machine* tanpa ribet Docker!).
    - **Media Engine**: FFmpeg + FFprobe + ASS/HyperFrames Subtitle/Overlay Renderer (100% gratis biaya render!).
    - **AI Adapters (BYOK)**: OpenAI SDK, Google Gemini SDK, Anthropic SDK, OpenRouter, Groq Whisper.
- [ ] **3.3 Desain Data Model, Kontrak EDL JSON & AI Prompt Schemas**:
  - ERD tabel utama: `users`, `api_keys` (encrypted), `campaigns`, `campaign_briefs`, `media_assets`, `generation_batches`, `clips`, `clip_versions`, `clip_scores`, `upload_playbooks`, `render_jobs`, `master_presets` (zero hardcoded master data!).
  - Skema kontrak **EDL JSON (Edit Decision List)** untuk menjamin *deterministic rendering* & *targeted prompt patching* di M8.
  - Skema output terstruktur Zod untuk: `ParsedBriefSchema`, `EditPlanSchema`, `ViralScoreCritiqueSchema`, `UploadPlaybookSchema`, `EdlPatchSchema`.
- [ ] **3.4 Visual-First Engineering Gate**:
  - Menyajikan **ASCII Wireframe** seluruh halaman inti (Dashboard Campaign, Studio Upload & Target Matrix, Multi-Variant Results Grid, Clip Inspector + Safe-Zone Player + Playbook + Prompt Re-Editor, Settings BYOK) dan menetapkan **Design DNA** untuk disetujui user sebelum M4.

---

### Milestone 4 (`M4`): Pondasi Aplikasi, Auth, System Preflight & BYOK API Key Manager
**Skill Aktif**: `backend`, `frontend`, `shadcn-ui`, `untitled-ui`, `design-dna`, `antislop-ui`, `qa`

- [ ] **4.1 Project Scaffolding & Media Environment Doctor**:
  - Inisialisasi struktur repo bersih, linting, TypeScript strict, env template (`.env.example`), dan skema Prisma + migrasi awal.
  - Endpoint & indikator status *System Doctor*: mengecek ketersediaan `ffmpeg`, `ffprobe`, font subtitle, direktori storage, dan koneksi queue/DB.
- [ ] **4.2 Autentikasi & RBAC Dasar**:
  - Login/Register, sesi aman, proteksi seluruh route aplikasi & API (*Mandatory Auth Policy*).
- [ ] **4.3 Modul BYOK AI API Key Manager (`/settings/api-keys`)**:
  - Penyimpanan API key terenkripsi **AES-256-GCM** di server (key tampil ter-masking `sk-...xxxx`, tidak pernah ditulis ke log).
  - Pemilihan provider & model aktif per peran:
    - *AI Director & Scorer* (Gemini / OpenAI / Claude / OpenRouter),
    - *Speech-to-Text Transcriber* (Groq Whisper / OpenAI Whisper / Deepgram),
    - *Opsional Voice/TTS*.
  - Tombol **Test Connection** real-time + deteksi error yang ramah manusia (invalid key, quota habis, model tidak tersedia).
  - Master Data dinamis untuk daftar *Target Countries*, *Age Groups*, *Editing Styles*, dan *Quick-Action Prompt Presets* (anti hardcoded).
- [ ] **4.4 Dokumentasi & Verifikasi M4**:
  - Buat `.agents/menu-docs/01-pengaturan/byok-api-keys.md` (Standar V2) + update `active-session.json` + unit test enkripsi.

---

### Milestone 5 (`M5`): Modul Campaign, Brief Parser (`.doc/.docx/.pdf`) & Raw Media Ingestion
**Skill Aktif**: `backend`, `frontend`, `herk-edit-kit`, `shadcn-ui`, `qa`

- [ ] **5.1 Manajemen Campaign Content Rewards (`/campaigns`)**:
  - Create/Read/Update/Delete campaign (judul, brand owner, platform target, CPM/reward notes, deadline, status).
- [ ] **5.2 Brief Uploader & AI Structured Parser**:
  - Upload file `.pdf` (`pdf-parse`), `.docx` (`mammoth`), `.doc` (fallback converter/extractor), atau input teks manual.
  - AI mengekstrak **Brief Rulebook Terstruktur**:
    - Ringkasan objektif campaign,
    - Syarat wajib (*Mandatory Do's*: kata kunci, CTA, hashtag wajib, mention akun, durasi min-max, rasio aspek),
    - Larangan keras (*Don'ts*: klaim terlarang, topik sensitif, watermark terlarang),
    - Tone & target audiens dari owner.
  - UI **Editable Brief Summary**: user bisa merevisi hasil ekstraksi AI sebelum lanjut generate (mencegah salah tafsir brief).
- [ ] **5.3 Raw Video Ingestion & Media Intelligence**:
  - Chunked upload video mentah (`.mp4`, `.mov`, `.mkv`, `.webm`) dengan progress bar dan validasi MIME/ukuran.
  - Ekstraksi metadata otomatis via FFprobe (durasi, resolusi, FPS, codec audio, loudness LUFS, thumbnail timeline).
  - Auto-transkripsi *word-level timestamps* + deteksi segmen hening (*silence intervals*) & *audio energy peaks* untuk memudahkan AI memotong tepat di batas kata tanpa terpotong canggung.
- [ ] **5.4 Dokumentasi & Verifikasi M5**:
  - Buat `.agents/menu-docs/02-campaign/campaign-dan-brief.md` + uji parsing PDF/DOCX nyata + update `active-session.json`.

---

### Milestone 6 (`M6`): Target Audience Matrix & Multi-Variant AI Video Auto-Editor Engine
**Skill Aktif**: `herk-edit-kit`, `hyperframes`, `motionmaxxing`, `hypit`, `backend`, `frontend`, `qa`

- [ ] **6.1 UI Target Audience & Viral Strategy Configurator**:
  - Panel konfigurasi lengkap sebelum generate:
    - **Platform Target**: TikTok (9:16), YouTube Shorts (9:16), YouTube Long (16:9).
    - **Target Audiens**: Country/Region, Bahasa & Gaya Bahasa, Rentang Usia, Gender Focus, Persona/Niche spesifik.
    - **Strategi Viral & Angle**: Tingkat Kontroversi (*Safe Edu -> Bold Opinion -> Hot Take -> Debate-Starter* dengan guard anti-pelanggaran platform), Tipe Hook 3 Detik Pertama, Pemicu Emosi, Primary KPI Goal.
    - **Produksi & Audio Awal**: Gaya Editing/Pacing, Gaya Caption/Subtitle (Hormozi Bold / Clean / Bilingual / Off), Mode Audio Awal (*Original 100% / Original Ducking 20% / Mute Total untuk Trending Sound*), serta **Jumlah Variasi Generate** (misal 1-10 clip).
  - Preview **Estimasi Token & Waktu Render** sebelum eksekusi.
- [ ] **6.2 AI Director -> Multi-Variant EDL Planner**:
  - AI membaca **Brief Rulebook + Transkrip Word-Level + Parameter Targeting**, lalu merancang *N* variasi **EDL JSON** yang saling berbeda secara strategis (bukan sekadar potong acak, melainkan variasi hook, sudut pandang, ritme cut, dan CTA).
  - Validator Zod memastikan setiap timestamp valid dalam durasi raw video dan patuh terhadap durasi wajib brief.
- [ ] **6.3 Async Video Render Engine (FFmpeg + HyperFrames/ASS Caption)**:
  - Job queue per clip (berjalan paralel terbatas agar CPU/RAM stabil) dengan **live progress streaming (SSE/WebSocket)** per tahap: *Analyzing Brief -> Planning EDL -> Cutting & Cropping -> Mixing Audio -> Rendering Captions -> Scoring -> Done*.
  - Pipeline rendering deterministik:
    - Pemotongan multi-segmen (*trim & concat*) bebas glitch audio/video,
    - Pembuangan dead-air/silence otomatis,
    - Smart Framing 9:16 (center crop / blurred background / split-screen),
    - Audio pipeline fleksibel (loudness normalize, volume gain 0%-100%, mute penuh, atau ducking),
    - Animated word-by-word captions dalam **Safe-Zone** + 3-second Hook Banner overlay,
    - Ekstraksi frame cover terbaik (`cover.jpg`) & file subtitle (`subtitles.srt`).
  - Retry parsial per clip yang gagal tanpa mengulang clip yang sudah sukses.
- [ ] **6.4 Dokumentasi & Verifikasi M6**:
  - Buat `.agents/menu-docs/03-studio/ai-video-generator.md` + uji render batch nyata + update `active-session.json`.

---

### Milestone 7 (`M7`): Viral Score Engine, Upload Impact & Critique, dan Upload Playbook
**Skill Aktif**: `showtime`, `motionmaxxing`, `antislop-copywriting`, `frontend`, `untitled-ui`, `backend`, `qa`

- [ ] **7.1 Viral Score Breakdown & Brief Compliance Engine**:
  - Penilaian terukur (0-100) dengan bobot transparan di 6 dimensi:
    1. *Hook Power (0-3 detik pertama)*,
    2. *Retention & Pacing Flow*,
    3. *Brief Compliance* (daftar checklist wajib & larangan brief: Pass / Warning / Fail),
    4. *Target Audience Fit* (kecocokan bahasa, referensi budaya country, usia, persona, angle kontroversi),
    5. *Engagement & Shareability Trigger*,
    6. *Audio & Safe-Zone Technical Health* (cek apakah ada subtitle melanggar batas UI TikTok/YT Shorts atau audio terlalu pelan/clipping).
  - Urutkan hasil variasi dari skor viral tertinggi, lengkap dengan tampilan *Comparison Matrix*.
- [ ] **7.2 Upload Playbook Generator (Siap Eksekusi Upload)**:
  - **Panduan Backsound & Audio**: rekomendasi genre/BPM/vibe musik + instruksi eksak cara pasang sound di aplikasi TikTok/YouTube sesuai kondisi audio hasil render (contoh: *"Audio asli di-mute -> gunakan Trending Sound [X] 100%"* atau *"Audio asli di-set 25% -> tambahkan Trending Sound 15%-20%"*).
  - **Judul / Cover Hook** (3 variasi A/B siap klik copy).
  - **Caption / Deskripsi** (otomatis menyisipkan mention/CTA/disclosure wajib brief).
  - **Hashtag / Tag Pack** (Tiered: Mandatory Campaign Tags + Niche Tags + Broad Discovery Tags).
  - **Jam Tayang Optimal (Posting Schedule)**: rekomendasi hari & jam spesifik dalam zona waktu target Country & kebiasaan Age Group, disertai alasannya.
  - **Engagement Toolkit**: 2 ide *Pinned Comment* pemicu diskusi & tips 15 menit pertama pasca-upload.
- [ ] **7.3 Projected Upload Impact & Actionable Critique Panel**:
  - Narasi **Prediksi Dampak Upload**: simulasi bagaimana audiens target bereaksi di 3 detik pertama, pertengahan, dan akhir.
  - Daftar **Kritik Spesifik & Berbasis Timestamp** (misal: *"00:00-00:02 pembukaan terlalu lambat"*, *"Audio asli masih 100%, berisiko tabrakan saat ditambah musik TikTok"*, *"CTA wajib brief belum muncul di layar"*).
  - Tombol **1-Klik "Perbaiki dengan Prompt"** yang otomatis mengirim poin kritik ke panel Re-Editor M8.
- [ ] **7.4 Video Preview Player dengan Safe-Zone Overlay**:
  - Toggle overlay simulasi UI **TikTok** dan **YouTube Shorts** langsung di atas video player agar user bisa mengecek visual sebelum download.
- [ ] **7.5 Dokumentasi & Verifikasi M7**:
  - Buat `.agents/menu-docs/03-studio/viral-score-dan-playbook.md` + verifikasi konsistensi skor/playbook + update `active-session.json`.

---

### Milestone 8 (`M8`): Iterative Prompt Re-Editor (Regenerate per Video) & Clip Versioning
**Skill Aktif**: `herk-edit-kit`, `hyperframes`, `frontend`, `backend`, `motion`, `qa`

- [ ] **8.1 Prompt-Based Regenerate per Video (Targeted EDL Patching)**:
  - Panel edit ulang khusus untuk 1 video terpilih (tanpa mengganggu video lain dalam batch).
  - AI menerjemahkan prompt bahasa alami user menjadi **EDL Patch JSON** yang presisi, menampilkan ringkasan perubahan (*Edit Diff Preview*) sebelum/saat render ulang.
- [ ] **8.2 Quick-Action Presets Lapangan (1-Klik & Kombinasi)**:
  - **Audio Presets**:
    - *Mute Audio Asli (0%)* untuk ganti full musik TikTok/YouTube,
    - *Kecilkan Audio Asli (15% / 30%)* untuk latar belakang sound trending,
    - *Perjelas & Normalize Vokal Asli*,
    - *Hapus / Ganti Backsound Embedded*.
  - **Pacing & Hook Presets**:
    - *Potong intro lambat / langsung ke punchline*,
    - *Perketat semua jeda hening (jump-cut cepat)*,
    - *Ringkas durasi ke <= 30 detik / <= 45 detik*.
  - **Caption, Visual & Brief Presets**:
    - *Naikkan posisi subtitle ke Safe-Zone*,
    - *Inline Subtitle Editor* (perbaiki kata typo pada transkrip langsung tanpa nebak lewat prompt!),
    - *Ubah ukuran/warna/style subtitle*,
    - *Zoom-in / Re-frame crop 9:16*,
    - *Sisipkan Hook Banner 3 detik / CTA & Disclaimer Wajib Brief*.
- [ ] **8.3 Clip Versioning, Re-Scoring & Rollback**:
  - Setiap regenerate menghasilkan versi baru (`v1`, `v2`, `v3`) lengkap dengan catatan prompt yang dipakai.
  - Perbandingan otomatis **Before vs After** (Video Player + Delta Viral Score + Kritik terselesaikan vs tersisa).
  - Fitur **Set as Final Version** atau **Rollback ke versi sebelumnya** kapan saja.
- [ ] **8.4 Dokumentasi & Verifikasi M8**:
  - Buat `.agents/menu-docs/03-studio/prompt-reeditor-versioning.md` + uji skenario lapangan (mute audio, ducking 15%, koreksi subtitle, rollback) + update `active-session.json`.

---

### Milestone 9 (`M9`): Modul Export & Download (Satuan & Bulk Streaming ZIP)
**Skill Aktif**: `backend`, `frontend`, `antislop-layoutmobile`, `qa`

- [ ] **9.1 Single Clip Export**:
  - Download 1 video `.mp4` (encoding H.264/AAC high-compatibility siap langsung upload TikTok & YouTube di HP maupun desktop).
  - Tombol *Copy All Playbook* (1-klik salin judul, caption, hashtag, jam tayang, instruksi musik) serta opsi unduh `upload-playbook.txt`, `subtitles.srt`, dan `cover.jpg`.
- [ ] **9.2 Bulk Download Keseluruhan (Streaming ZIP)**:
  - Pilih semua clip atau filter tertentu (*Semua Final*, *Hanya Score >= 80*, atau *Checklist Manual*).
  - Streaming ZIP (`archiver` / stream pipeline) agar tidak membebani RAM server (*anti-OOM*) meski ukuran total ratusan MB hingga GB.
  - Struktur arsip rapi:
    ```text
    campaign-[slug]-[tanggal].zip
    ├── 00-RINGKASAN-CAMPAIGN-DAN-JADWAL-UPLOAD.md
    ├── 01-score-92-[angle-slug]/
    │   ├── video-ready-upload.mp4
    │   ├── upload-playbook.txt
    │   ├── subtitles.srt
    │   └── cover.jpg
    └── 02-score-86-[angle-slug]/
        └── ...
    ```
- [ ] **9.3 Storage Hygiene & Retention Policy**:
  - Jadwal pembersihan berkas render sementara/versi usang secara aman dengan indikator kapasitas storage di dashboard.
- [ ] **9.4 Dokumentasi & Verifikasi M9**:
  - Buat `.agents/menu-docs/04-export/download-dan-bundle.md` + uji integrity file ZIP & pemutaran MP4 + update `active-session.json`.

---

### Milestone 10 (`M10`): End-to-End QA, Mandatory Delivery Gate, Docs Sync & Release v1.0
**Skill Aktif**: `qa`, `playwright`, `tech-critic`, `antislop`, `antislop-ui`, `antislop-human`, `antislop-layoutmobile`, `antislop-code`, `graphify`

- [ ] **10.1 Automated Testing Suite**:
  - Unit & Integration tests: enkripsi BYOK, parser `.docx/.pdf`, validator Zod EDL/Playbook/Score, generator argumen FFmpeg (anti shell-injection), EDL patcher, dan streaming ZIP.
  - Playwright E2E Testing: skenario penuh user login -> pasang BYOK key -> buat campaign & upload brief + video mentah -> generate multi-varian -> cek viral score, kritik, safe-zone overlay, & upload playbook -> regenerate 1 video dengan prompt mute/duck audio -> download single & bulk ZIP.
- [ ] **10.2 Mandatory Delivery Gate (4-Blok PASS/FAIL)**:
  - **Block 1 (Hard Gate)**: zero console error, zero mobile overflow, kontras WCAG AA, navigasi keyboard, zero broken buttons, zero API key leak.
  - **Block 2 (Purpose-Gate)**: kebersihan visual studio tanpa efek dekoratif berlebihan.
  - **Block 3 (Liveliness)**: responsivitas & feedback state (empty, loading, rendering progress, partial failure, success).
  - **Block 4 (Craftsmanship)**: bebas dead code, higienitas komentar kode, bahasa UI konsisten & human-friendly.
- [ ] **10.3 Sinkronisasi Dokumentasi & Release**:
  - Finalisasi seluruh berkas `.agents/menu-docs/`, `.agents/knowledge/bug-cases.md`, dan `.agents/02-session-state/active-session.json`.
  - Jalankan `node .agents/scripts/sync-docs.js` untuk mirroring penuh ke portal dokumentasi `documentasi-projects`.
  - Promosikan pola teknis terverifikasi ke `.agents/04-case-bank/cases/`.
  - Merge `dev -> main`, buat tag `v1.0.0`, dan push final ke GitHub.

---

## 5. Backlog Ekspansi Fase 2 (Post-MVP / V2)

Fitur lanjutan setelah `v1.0.0` stabil (memanfaatkan 19 Skill Tier 2):

1. **Reference Video Style & Pacing Cloner (`reelmimic`)**: Tempel link/video viral kompetitor untuk mengekstrak ritme cut, panjang shot, dan kurva klimaks lalu menerapkannya ke raw footage campaign.
2. **Visual Timeline Editor Interaktif (`openmotion`)**: Editor multi-track manual di browser bagi user yang ingin menggeser potongan klip dan subtitle secara presisi selain lewat prompt.
3. **Smart Face-Tracking Auto-Crop & Cover Selector (`ml-vision`)**: Pelacakan wajah/pembicara aktif otomatis untuk crop 9:16 dinamis pada video podcast multi-kamera.
4. **Frame-by-Frame Visual Annotation (`motlab` + `motlab-assets`)**: Klik langsung di frame tertentu untuk menandai revisi prompt + pustaka aset brand (watermark, bumper, font preset) per campaign.
5. **Campaign Content Calendar & Excel Report (`excel-export`)**: Ekspor jadwal upload mingguan/bulanan dan metrik perbandingan batch ke `.xlsx`.
6. **Multi-Account / Team Collaboration & Direct Publish Assist (`webbrain`)**: Manajemen peran tim clipper (Manager -> Editor -> Uploader) serta sinkronisasi campaign otomatis.

---

## 6. Keputusan Arsitektur Terkunci (`Locked Constraints`)

Keputusan berikut telah dikonfirmasi pemilik proyek pada `2026-11-26` dan dikunci untuk seluruh milestone berikutnya:

1. **Stack Aplikasi Terkunci:** **Nuxt 3 / Vue 3** (TypeScript, Pinia, TanStack Vue Query, Tailwind CSS, Shadcn Vue) + **Express.js** (Node.js `v24.18.0`, TypeScript) + **SQLite & Prisma ORM** (zero-config lokal, upgradeable ke PostgreSQL) + **Local Persistent Job Queue**.
2. **Environment Operasional Utama:** Berjalan **100% lokal di PC/Laptop** memanfaatkan **FFmpeg `8.1.2-full_build` & FFprobe** lokal yang telah terverifikasi terpasang (gratis biaya server/render, bebas watermark).
3. **Repositori GitHub Backup:** `https://github.com/AhmadArifff/clip-content-rewards.git` (branch `main` sebagai baseline stabil dan `dev` untuk integrasi pengembangan).
