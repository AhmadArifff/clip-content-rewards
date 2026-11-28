# MILESTONE.md - Roadmap & Tata Kelola Proyek `clip-content-rewards`

> **Dokumen Induk Eksekusi Bertahap (Master Timeline & Milestone Tracker)**
> Proyek: **Clip Content Rewards (AI Auto-Editor, Viral Scorer & Upload Playbook Studio untuk TikTok & YouTube)**
> Status Saat Ini: **M0-M10 (`v1.0.0`) + M11 (`v2.1` Reference Video Pacing Cloner) Verified PASS**
> Terakhir Diperbarui: **2026-11-28**

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
| **M3** | **Deep Planning, Gap Audit PRD & Visual-First Gate** | Tambahan 7 fitur lapangan (`PRD.md` v1.1), Prisma Schema 11 model, Kontrak EDL v1.1 & Zod Schemas, API/SSE Map, ASCII Wireframe & Tech Critic Pre-Mortem | `DONE` | Approval Review Gate + verifikasi `tech-critic` & `qa` |
| **M4** | **Pondasi App, Auth & BYOK AI Key Manager** | Monorepo (`apps/web`, `apps/api`, `packages/shared`), `DESIGN.md` 3 tema switchable, SQLite WAL + 37 presets, Auth, System Doctor & BYOK AES-256-GCM + Test Connection | `DONE` | 5/5 Vitest PASS + Nuxt 3 & Express build PASS |
| **M5** | **Campaign Manager, Brief Parser & Raw Media Ingestion** | CRUD Campaign, Parser `.pdf/.docx/.doc`/teks + Editable Rulebook, Chunked Upload 4MB/part + Supporting Assets, FFprobe, Audio Diagnostic, Silence Map & Auto-Chunked Whisper STT | `DONE` | 6/6 Vitest PASS + 5/5 Playwright E2E M5 PASS |
| **M6** | **Target Audience Matrix & Multi-Variant Auto-Editor Engine** | Form Target Matrix dinamis + Target Profiles, AI Director EDL Planner, Local Queue + SSE, FFmpeg 1080x1920 3 Framing + Mute/Duck Audio + ASS Safe-Zone + HTTP 206 Streaming | `DONE` | 7/7 Vitest PASS + 5/5 Playwright E2E M6 PASS |
| **M7** | **Viral Score Engine, Impact/Critique & Upload Playbook** | Scoring 6 dimensi + Brief Compliance, Proyeksi Dampak & Kritik Actionable, Upload Playbook lengkap (musik/tag/caption/jam tayang), Safe-Zone Player Overlay | `DONE` | 8/8 Vitest PASS + 7/7 Playwright E2E M78 PASS |
| **M8** | **Iterative Prompt Re-Editor & Clip Versioning** | Regenerate 1 video via prompt natural + Preset Lapangan (Mute/Duck Audio, Cut Hook, Safe-Zone, Edit Typo Subtitle), EDL Patcher, Versioning (`v1..vN`) & Rollback | `DONE` | FFprobe `< -60 dB` Mute v2 + Playbook sinkron + Rollback lulus |
| **M9** | **Single & Bulk ZIP Streaming Export** | Download satuan (`.mp4` + playbook + `.srt` + cover) & Bulk ZIP Streaming terstruktur + filter skor + auto-cleanup file temp | `DONE` | 9/9 Vitest PASS (verifikasi ZIP `tar -tf`) + 5/5 E2E M9 PASS |
| **M10** | **E2E QA, Delivery Gate, Docs Sync & Release v1.0** | Unit/Integration tests, Playwright E2E full flow, Mandatory Delivery Gate 4-Blok, finalisasi `menu-docs/` + mirror ke `documentasi-projects`, Release `v1.0.0` | `DONE` | 9/9 Vitest + 5/5 Suite E2E M4-M9 + Delivery Gate 4-Blok PASS |
| **M11** | **V2: Reference Video Pacing Cloner** | Upload video viral referensi -> FFmpeg scene-cut & BPM extractor (style-only auto-delete) -> Profil Ritme `/pacing` -> Multi-Cut EDL Cloning & Playbook BPM sync | `DONE` | 10/10 Vitest PASS + 4/4 Playwright E2E M11 PASS |

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

- [x] **3.1 Audit Celah Lapangan (*Field Edge-Case & Gap Audit*) atas `PRD.md` (`v1.0 -> v1.1`)**:
  - Penanganan file video mentah berukuran besar (500MB - 2GB+): *chunked/resumable upload* + **auto-chunking audio <=20MB/chunk** untuk batas Whisper API pada video >1 jam.
  - Dukungan **Supporting Assets** (logo/watermark PNG, outro, B-roll), **3 Mode Framing 16:9->9:16** (*Center Crop*, *Fit-Width Blur BG*, *Split-Screen*), **Reusable Target Profiles**, **Anti-Duplicate Batch Mode** (`<=30%` overlap vs A/B Hook Test), **Bundled Local Windows Fonts**, dan **Pre-Generate Audio Diagnostic**.
  - Seluruh temuan telah dituangkan ke `PRD.md` (`v1.1`) dan `.agents/knowledge/technical-blueprint-m3.md`.
- [x] **3.2 Penetapan & Penguncian Tech Stack (`established_constraints`)**:
  - Terkunci: **Nuxt 3 / Vue 3** (TypeScript, Pinia, TanStack Vue Query, Tailwind CSS, Shadcn Vue) + **Express.js** (Node.js v24.18.0, TypeScript) + **SQLite WAL & Prisma ORM** (PostgreSQL-portable) + **Local Persistent Job Queue** + **Local FFmpeg `8.1.2` & FFprobe** + **BYOK Multi-Provider Adapters**.
- [x] **3.3 Desain Data Model, Kontrak EDL JSON v1.1 & AI Prompt Schemas**:
  - Final Prisma Schema 11 model (`User`, `ApiKey`, `MasterPreset`, `TargetProfile`, `Campaign`, `CampaignBrief`, `MediaAsset`, `GenerationBatch`, `Clip`, `ClipVersion`, `RenderJob`) + 6 Zod Contracts + REST/SSE Endpoint Map di `.agents/knowledge/technical-blueprint-m3.md`.
- [x] **3.4 Visual-First Engineering Gate & Tech Critic Pre-Mortem**:
  - ASCII Wireframe 5 layar utama (Desktop 1440px + Mobile 390px), 3 opsi arah visual (`DESIGN.md` menunggu pilihan user sebelum M4), dan Tech Critic Approved Verdict (dengan 3 mitigasi wajib: startup zombie-job recovery, FFmpeg relative `cwd` anti drive-colon Windows, dan HTTP 206 Range video streaming).

---

### Milestone 4 (`M4`): Pondasi Aplikasi, Auth, System Preflight & BYOK API Key Manager
**Skill Aktif**: `backend`, `frontend`, `shadcn-ui`, `untitled-ui`, `design-dna`, `antislop-ui`, `qa`

- [x] **4.1 Project Scaffolding Monorepo (`npm Workspaces`), `DESIGN.md` 3 Tema & Media Environment Doctor**:
  - Monorepo terbentuk: `packages/shared` (6 Zod contracts), `apps/api` (Express TS + Prisma 11 model SQLite WAL + startup zombie-job recovery), dan `apps/web` (Nuxt 3 SPA Studio dengan 3 Tema Switchable berbeda slicing layout, warna, tipografi, interaksi, dan copywriting: `editing-room`, `daylight-editorial`, `creator-tactile`).
  - `GET /api/system/doctor` + komponen `DoctorPanel.vue` (3 variasi slicing) terverifikasi mengecek `ffmpeg 8.1.2`, `ffprobe 8.1.2`, SQLite `WAL`, font subtitle, storage lokal, dan concurrency CPU.
- [x] **4.2 Autentikasi Lokal & Auth Guard**:
  - Setup akun pertama `/api/auth/setup`, Login `/api/auth/login`, Logout, Me (`bcryptjs` cost 12 + `HttpOnly SameSite=Lax JWT Cookie`) serta proteksi global frontend `auth.global.ts` dan middleware `requireAuth`.
- [x] **4.3 Modul BYOK AI API Key Manager (`/settings/api-keys`) & Dynamic Master Presets (`/settings/presets`)**:
  - Enkripsi **AES-256-GCM** di server, masking `AIza...xxxx`, zero plaintext leak, dan **Test Connection** live 6 penyedia (Gemini, OpenAI, Claude, OpenRouter, Groq Whisper, Deepgram).
  - Seed & CRUD **37 Master Presets dinamis** (Countries, Age Groups, Editing Styles, Hook Types, Controversy Levels, Framing Modes 9:16, & 9 Quick-Action Prompt Presets Lapangan) + API `target_profiles`.
- [x] **4.4 Dokumentasi V2 & Verifikasi M4**:
  - Dibuat `.agents/menu-docs/01-pengaturan/byok-api-keys.md` & `master-presets-doctor.md` (Standar V2 10 Bagian), dicatat Kasus #01 SQLite PRAGMA di `bug-cases.md`, 5/5 Vitest lulus, dan build `@clip/shared`, `@clip/api`, `@clip/web` lulus 100%.

---

### Milestone 5 (`M5`): Modul Campaign, Brief Parser (`.doc/.docx/.pdf`) & Raw Media Ingestion
**Skill Aktif**: `backend`, `frontend`, `herk-edit-kit`, `shadcn-ui`, `qa`

- [x] **5.1 Manajemen Campaign Content Rewards (`/campaigns`)**:
  - CRUD Campaign lengkap (`campaigns` + cascade file cleanup) dengan tampilan 3 Tema Switchable dan form pembuatan campaign multi-platform.
- [x] **5.2 Brief Uploader & AI Structured Parser**:
  - Upload `.pdf` (`unpdf`), `.docx` (`mammoth`), `.doc` (fallback extractor), `.txt`, atau paste teks manual + deteksi PDF scan kosong (`< 30` karakter).
  - Ekstraksi `BriefRulebookSchema` via BYOK LLM (`llm-json.adapter.ts`) dengan fallback heuristik lokal + UI **Editable Brief Rulebook** & konfirmasi status `ready`.
- [x] **5.3 Raw Video Ingestion, Supporting Assets & Media Intelligence**:
  - Chunked upload per `4 MB` (`useChunkedUploader` + `/media/chunk` + `/media/complete`) mendukung video mentah & supporting assets (`watermark`, `outro`, `broll`).
  - FFprobe metadata + 1-pass `volumedetect` & `silencedetect` menghasilkan **Audio Diagnostic Card** (saran mode audio *Original* / *Ducking 20%* / *Mute 0%*) + peta jeda hening.
  - Adapter **Auto-Chunked Whisper/Deepgram STT** (`stt.adapter.ts`) memecah audio per 10 menit (overlap 2s, ~4.8 MB/chunk) agar kebal batas 25 MB Whisper API.
- [x] **5.4 Dokumentasi V2 & Verifikasi M5**:
  - Dibuat `.agents/menu-docs/02-campaign/campaign-dan-brief.md` & `raw-media-ingestion.md` (Standar V2), 6/6 Vitest lulus, 5/5 Playwright E2E M5 lulus (3 tema + mobile 390px), dan 2 kasus teknis dicatat di `bug-cases.md`.

---

### Milestone 6 (`M6`): Target Audience Matrix & Multi-Variant AI Video Auto-Editor Engine
**Skill Aktif**: `herk-edit-kit`, `hyperframes`, `motionmaxxing`, `hypit`, `backend`, `frontend`, `qa`

- [x] **6.1 UI Target Audience & Viral Strategy Configurator (`TargetGeneratorPanel.vue`)**:
  - Seluruh parameter targeting dinamis dari `master_presets` (Platform, Country, Bahasa, Usia, Persona/Niche, Kontroversi, Hook 3 Detik, Pemicu Emosi, Primary KPI, Gaya Editing, 3 Mode Framing 16:9->9:16, Gaya Caption, Mode Audio Awal, Diversifikasi Batch, Watermark, Jumlah Variasi 1-10) + Simpan/Muat `TargetProfile` + Cek Estimasi Token & Waktu Render.
- [x] **6.2 AI Director -> Multi-Variant EDL Planner (`edl-director.service.ts`)**:
  - Merancang `N` variasi `EDL JSON v1.1` tervalidasi Zod via BYOK LLM (dengan fallback perencana heuristik lokal) + clamp durasi aktual FFprobe.
- [x] **6.3 Async Local Render Worker, SSE & FFmpeg Safe-Zone Engine**:
  - Persistent SQLite Job Queue (`MAX_RENDER_CONCURRENCY=1`) + Live SSE `/api/batches/:batchId/stream` + Cancel Batch + Partial Retry per klip + HTTP `206 Partial Content` Range Video Streaming.
  - FFmpeg 8.1.2 via `spawn(..., { cwd, shell: false })`: 3 mode framing (`center_crop`, `fit_blur_bg`, `split_screen`), Watermark Safe-Zone, Audio Pipeline (`anullsrc` AAC stereo valid untuk Mute `0%`, `loudnorm` + `volume` untuk Ducking `20%`, atau Normalized `-14 LUFS`), ASS Safe-Zone Captions/Hook Banner/CTA, `subtitles.srt`, dan `cover.jpg`.
- [x] **6.4 Dokumentasi V2 & Verifikasi M6**:
  - Dibuat `.agents/menu-docs/03-studio/ai-video-generator.md` (Standar V2), 7/7 Vitest lulus (verifikasi FFprobe `1080x1920`, `meanVolumeDb < -60 dB`, HTTP 206), dan 5/5 Playwright E2E M6 lulus (3 tema + mobile 390px).

---

### Milestone 7 (`M7`): Viral Score Engine, Upload Impact & Critique, dan Upload Playbook
**Skill Aktif**: `showtime`, `motionmaxxing`, `antislop-copywriting`, `frontend`, `untitled-ui`, `backend`, `qa`

- [x] **7.1 Viral Score Breakdown & Brief Compliance Engine**:
  - Penilaian terukur (0-100) dengan bobot transparan di 6 dimensi (*Hook Power*, *Retention & Pacing*, *Brief Compliance*, *Target Audience Fit*, *Engagement Trigger*, *Audio & Safe-Zone Health*) + checklist `PASS`/`WARN`/`FAIL` + ranking & filter variasi pada halaman batch.
- [x] **7.2 Upload Playbook Generator (Siap Eksekusi Upload)**:
  - Panduan backsound & audio tersinkron otomatis terhadap kondisi fisik audio video (`Original 100%` / `Ducking %` / `Mute 0%`), 3 opsi judul A/B, caption siap tempel, hashtag bertingkat (`Mandatory`/`Niche`/`Broad`), jadwal tayang optimal lintas zona waktu (`ID`/`US`/`UK`/`MY`/`SG`), pinned comments, 15-min checklist, dan 1-klik *Salin Semua Playbook*.
- [x] **7.3 Projected Upload Impact & Actionable Critique Panel**:
  - Narasi 4 kartu proyeksi dampak upload + daftar kritik spesifik berbasis timestamp (klik *Lompat ke 00:xx* langsung seek video) + tombol **1-Klik "Perbaiki dengan Prompt"** yang otomatis mengisi kotak Re-Editor M8.
- [x] **7.4 Video Preview Player dengan Safe-Zone Overlay**:
  - Komponen `SafeZoneOverlay.vue` (`Off` | `TikTok` | `YT Shorts`) di atas video player `/clips/:clipId`.
- [x] **7.5 Dokumentasi & Verifikasi M7**:
  - Dibuat `.agents/menu-docs/03-studio/viral-score-dan-playbook.md` (Standar V2) + terverifikasi lewat Vitest & Playwright E2E M78.

---

### Milestone 8 (`M8`): Iterative Prompt Re-Editor (Regenerate per Video) & Clip Versioning
**Skill Aktif**: `herk-edit-kit`, `hyperframes`, `frontend`, `backend`, `motion`, `qa`

- [x] **8.1 Prompt-Based Regenerate per Video (Targeted EDL Patching)**:
  - `edl-patcher.service.ts` menerjemahkan prompt bahasa alami + preset cepat menjadi `EdlPatchSchema` tervalidasi Zod lalu merender hanya 1 klip terpilih via `POST /api/clips/:clipId/regenerate`.
- [x] **8.2 Quick-Action Presets Lapangan (1-Klik & Kombinasi) & Inline Subtitle Editor**:
  - Terhubung dinamis ke 9 `prompt_preset` di tabel `master_presets` (Mute Audio 0%, Ducking 15%/30%, Normalize Vokal -14 LUFS, Potong 2 Detik Awal, Perketat Jeda Hening, Naikkan Subtitle Safe-Zone, Zoom-In 115%, CTA Brief) + **Editor Teks Subtitle Inline** (`subtitleOverrides`).
- [x] **8.3 Clip Versioning, Re-Scoring & Rollback**:
  - Penyimpanan non-destruktif per versi (`v1`, `v2`, `v3`), kalkulasi ulang Viral Score + delta skor (`+N vs v1`), sinkronisasi otomatis Upload Playbook, tombol **Jadikan Versi Aktif (Rollback)** (`PATCH /active-version`), dan **Tandai Final** (`PATCH /approve`).
- [x] **8.4 Dokumentasi & Verifikasi M8**:
  - Dibuat `.agents/menu-docs/03-studio/prompt-reeditor-versioning.md` (Standar V2) + terverifikasi 8/8 Vitest PASS (verifikasi fisik FFprobe `< -60 dB` Mute `v2` & Playbook sinkron) + 7/7 Playwright E2E M78 PASS (3 tema + mobile 390px).

---

### Milestone 9 (`M9`): Modul Export & Download (Satuan & Bulk Streaming ZIP)
**Skill Aktif**: `backend`, `frontend`, `antislop-layoutmobile`, `qa`

- [x] **9.1 Single Clip Export**:
  - Endpoint `GET /api/clips/:clipId/download?type=mp4|playbook|srt|cover&versionId=...` + panel **Paket Unduh Satuan** di `/clips/:clipId` & tombol cepat `MP4` + `Playbook` di halaman batch.
- [x] **9.2 Bulk Download Keseluruhan (Streaming ZIP)**:
  - Endpoint `POST /api/batches/:batchId/export-zip` berbasis `archiver` (`store: true` untuk `.mp4` & `.jpg` agar hemat CPU & anti-OOM) mendukung filter `all`, `high_score` (`>= 80`), `approved` (Final), dan `selected` (checklist manual per kartu) lengkap dengan `00-RINGKASAN-CAMPAIGN-DAN-JADWAL-UPLOAD.md` dan folder terurut berdasarkan skor viral.
- [x] **9.3 Storage Hygiene & Retention Policy**:
  - Endpoint `GET /api/system/storage` + `POST /api/system/cleanup-temp` (proteksi `409` saat render aktif) dan tampilan rincian kapasitas (`Uploads`, `Renders`, `Temp`) + tombol **Bersihkan File Sementara** di `DoctorPanel.vue`.
- [x] **9.4 Dokumentasi & Verifikasi M9**:
  - Dibuat `.agents/menu-docs/04-export/download-dan-bundle.md` (Standar V2) + terverifikasi 9/9 Vitest PASS (header `PK\x03\x04` & `tar -tf` isi ZIP) + 5/5 Playwright E2E M9 PASS (3 tema + mobile 390px).

---

### Milestone 10 (`M10`): End-to-End QA, Mandatory Delivery Gate, Docs Sync & Release v1.0
**Skill Aktif**: `qa`, `playwright`, `tech-critic`, `antislop`, `antislop-ui`, `antislop-human`, `antislop-layoutmobile`, `antislop-code`, `graphify`

- [x] **10.1 Automated Testing Suite (Full Regression M4-M9)**:
  - Seluruh 5 suite Vitest (`9/9` PASS) dan seluruh 5 suite Playwright E2E (`npm run test:e2e:all`: M4, M5, M6, M7/M8, M9) lulus 100% dengan `0 console errors` dan `0 HTTP 5xx`.
- [x] **10.2 Mandatory Delivery Gate (4-Blok PASS/FAIL)**:
  - **Block 1 (Hard Gate)**: zero em-dash (`EM_DASH_COUNT=0`), zero console error, zero mobile overflow `390x844`, kontras WCAG AA di 3 tema, navigasi keyboard + ARIA tab/toggle, zero broken links, zero plaintext secret leak (`UNIGNORED_SECRETS=0`).
  - **Block 2 (Purpose-Gate)**: seluruh kartu, badge semantik, overlay safe-zone, dan press physics memiliki tujuan fungsi & hierarki yang jelas.
  - **Block 3 (Liveliness)**: state empty, loading, live SSE progress, partial failure + retry, toast konfirmasi, dan rollback lengkap pada seluruh modul.
  - **Block 4 (Craftsmanship)**: zero dead code, higienitas komentar kode, bahasa UI Indonesia human-friendly bebas jargon teknis, panduan lengkap `README.md` (termasuk akses LAN HP).
- [x] **10.3 Sinkronisasi Dokumentasi, Case-Bank & Persiapan Release `v1.0.0`**:
  - Seluruh **8/8 Menu Docs Standar V2** + **5 Dokumen Fondasi Global** tersinkronkan ke portal `documentasi-projects`.
  - Pola terverifikasi dipromosikan ke `.agents/04-case-bank/cases/case-20261127-local-byok-video-auto-editor-studio.yaml`.
  - Siap commit final + tag `v1.0.0` di GitHub (`main` & `dev`).

---

## 5. Backlog Ekspansi Fase 2 (Post-MVP / V2)

Fitur lanjutan setelah `v1.0.0` stabil (memanfaatkan 19 Skill Tier 2):

1. **[SELESAI - M11] Reference Video Style & Pacing Cloner (`reelmimic`)**: Upload video viral referensi -> FFmpeg scene-cut & tempo BPM extractor (`pacing-analyzer.service.ts`) dengan guardrail *Style-Only* (video referensi langsung dihapus pasca-analisis) -> halaman `/pacing` 3 tema + visualisasi bar shot -> penerapan potongan *multi-cut* otomatis di `TargetGeneratorPanel` & sinkronisasi BPM di Upload Playbook.
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
