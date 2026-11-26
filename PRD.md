# PRD: Clip Content Rewards - AI Auto-Editor, Viral Scorer & Upload Playbook Studio

**Product:** Clip Content Rewards (`clip-content-rewards`)
**Author:** Product Management & Architecture Team
**Owner:** AhmadArifff
**Date:** 2026-11-26
**Version:** v1.1
**Status:** Gap-Audited & Technically Blueprinted (M3 Complete -> Ready for M4 Scaffolding)
**Repository:** `https://github.com/AhmadArifff/clip-content-rewards.git`
**Technical Blueprint:** [technical-blueprint-m3.md](./.agents/knowledge/technical-blueprint-m3.md)

---

## 1. Executive Summary

**Clip Content Rewards** adalah aplikasi studio produksi konten video berbasis web yang berjalan secara **lokal (PC/Laptop)** dengan mesin render **FFmpeg lokal** dan kecerdasan buatan berbasis **BYOK (Bring Your Own Key) AI API**. Aplikasi ini membantu kreator dan clipper mengubah **brief campaign** (`.doc`, `.docx`, `.pdf`) dan **video mentah (raw footage)** dari pemilik campaign *Content Rewards* menjadi banyak variasi konten siap upload untuk **TikTok** dan **YouTube (Shorts & Long)**. Setiap video hasil generate dilengkapi **Skor Viral terukur**, **Prediksi Dampak & Kritik Spesifik**, **Upload Playbook lengkap** (strategi backsound/trending sound, judul, deskripsi, hashtag, jam tayang optimal sesuai target audiens), fitur **Edit Ulang / Regenerate per Video menggunakan Prompt** (misalnya mute atau mengecilkan suara asli untuk diganti sound musik TikTok/YouTube), serta **Download Satuan maupun Bulk ZIP**.

---

## 2. Problem Statement

### 2.1 Background

Program *Content Rewards* (seperti campaign clipping untuk brand, podcaster, streamer, atau produk digital) membayar kreator berdasarkan performa tayangan (views/CPM) pada video yang mematuhi brief campaign di TikTok dan YouTube. Pemilik campaign biasanya hanya memberikan dua bahan mentah: dokumen brief aturan (`.pdf` atau `.doc`/`.docx`) dan rekaman video mentah berdurasi panjang atau beberapa potongan klip mentah.

### 2.2 Problem

> **Problem:** Kreator dan clipper harus membaca brief secara manual, memilah momen terbaik dari video mentah, mengedit banyak variasi sudut pandang (hook, pacing, subtitle, audio), meriset metadata upload (jam tayang, tag, caption, musik), serta melakukan revisi berulang satu per satu ketika audio, subtitle, atau kepatuhan brief belum tepat.
>
> **Who is affected:** Clipper solo, kreator konten *Content Rewards*, dan tim mikro-agensi yang mengejar volume serta rasio viralitas tinggi di TikTok dan YouTube.
>
> **Impact:** Proses produksi manual memakan waktu lama per video, membatasi jumlah eksperimen variasi (A/B testing angle & target audiens), berisiko melanggar syarat brief sehingga klaim reward ditolak, dan menghasilkan metadata upload yang kurang selaras dengan target negara maupun demografi audiens.

### 2.3 Key Workflow Gaps Identified

| Area | Kondisi Manual Saat Ini | Solusi `clip-content-rewards` |
| :--- | :--- | :--- |
| **Kepatuhan Brief** | Syarat wajib (CTA, hashtag, durasi, larangan) sering terlewat saat terburu-buru mengedit. | AI Brief Parser mengekstrak aturan Do's/Don'ts terstruktur dan memeriksa kepatuhan otomatis per video. |
| **Variasi & Eksperimen** | Kreator hanya sempat membuat 1-2 editan karena keterbatasan waktu editing. | AI Director merancang banyak variasi EDL sekaligus (berbeda hook, angle kontroversi, target usia/negara) dan merendernya paralel secara lokal. |
| **Strategi Audio Lapangan** | Suara video mentah sering bertabrakan dengan musik trending TikTok/YouTube saat akan di-upload. | Mode audio awal & Preset Regenerate 1-klik (*Mute 0%*, *Ducking 15-30%*, *Normalize Vokal*) beserta panduan volume di Upload Playbook. |
| **Evaluasi & Iterasi** | Sulit menilai bagian mana dari video yang lemah sebelum benar-benar di-upload. | Viral Score 6 dimensi + Prediksi Dampak + Kritik berbasis timestamp yang bisa langsung dijadikan prompt perbaikan per video. |
| **Biaya Operasional** | SaaS auto-clipper berlangganan mahal, sering ada watermark, dan terkunci pada kuota kredit. | Berjalan 100% lokal (FFmpeg native gratis) dengan sistem BYOK API Key milik user sendiri. |

---

## 3. Target Users

### 3.1 Primary Persona: Solo Content Rewards Clipper

**Name:** Raka (Solo Clipper & Creator)
**Role:** Kreator konten short-form yang mengikuti banyak campaign *Content Rewards* (TikTok & YouTube Shorts).
**Demographics:** Usia 19-32 tahun, terbiasa mengoperasikan browser dan aplikasi TikTok/YouTube Studio, ingin hasil cepat tanpa harus ahli software editing kompleks setiap kali membuat variasi.

| Attribute | Detail |
| :--- | :--- |
| **Goals** | Menghasilkan 5-10 variasi clip berkualitas tinggi per campaign dengan cepat, mematuhi seluruh aturan brief, tahu persis kapan dan bagaimana cara upload agar peluang viral maksimal. |
| **Pain Points** | Capek memotong video mentah secara manual, bingung memilih hook yang cocok untuk audiens negara/usia tertentu, sering lupa mengecilkan/mute suara asli sebelum ditambah musik TikTok, dan ingin revisi 1 video saja tanpa mengulang semuanya. |
| **Current Workflow** | Baca PDF brief -> potong manual di CapCut/Premiere -> buat subtitle manual -> tebak jam tayang dan hashtag -> export satu per satu. |
| **Tech Proficiency** | Menengah (mampu menyalin API Key Gemini/OpenAI/Groq ke halaman pengaturan lokal). |

### 3.2 Secondary Persona: Micro Clipping Agency Operator

**Name:** Dinda (Campaign Operator)
**Role:** Pengelola beberapa akun TikTok & YouTube untuk berbagai target market (Indonesia, US, Global).

| Attribute | Detail |
| :--- | :--- |
| **Goals** | Memproduksi batch konten terstandar per campaign, membandingkan skor viral tiap variasi, menyaring clip terbaik, dan mengunduh paket ZIP lengkap (video + playbook + cover + subtitle) untuk dibagikan ke uploader. |
| **Pain Points** | Konsistensi kualitas antar video tidak seragam, pencatatan caption/tag/jam tayang terpisah-pisah di catatan manual. |
| **Tech Proficiency** | Menengah sampai mahir. |

### 3.3 Anti-Personas (NOT Building For in v1.0)

- **Studio Film / VFX Profesional:** Aplikasi ini tidak menggantikan NLE sinematik berbasis keyframe 3D kompleks (After Effects / DaVinci Resolve Fusion).
- **SaaS Multi-Tenant Publik Berbayar (Cloud Hosting):** Versi v1.0 difokuskan untuk eksekusi **lokal di PC/Laptop user** (gratis biaya server render), bukan platform SaaS multi-tenant skala ribuan pengguna bersamaan.

---

## 4. Proposed Solution & Locked Technical Architecture

### 4.1 Solution Overview

Sistem terdiri dari dua lapisan ringan yang berjalan di mesin lokal user:
1. **Frontend Studio (`Nuxt 3 / Vue 3`)**: Antarmuka studio responsif (desktop untuk produksi & mobile-friendly untuk preview/download) untuk mengelola API Key BYOK, Campaign, Brief, Raw Video, Parameter Targeting, Monitoring Render Live, Review Viral Score + Playbook + Safe-Zone Player, Prompt Re-Editor per Video, dan Export.
2. **Backend API & Local Render Worker (`Express.js + TypeScript + Local FFmpeg`)**: Mengelola autentikasi lokal, enkripsi AES-256-GCM untuk API Key BYOK, parsing `.doc/.docx/.pdf`, manajemen file media lokal, integrasi BYOK LLM & Speech-to-Text, persistent job queue lokal, rendering deterministik via **FFmpeg** (terverifikasi `v8.1.2-full_build` lokal), serta streaming download ZIP.

### 4.2 Core Feature Matrix (MoSCoW Prioritization)

| # | Feature Module | Priority | Description |
| :-: | :--- | :---: | :--- |
| 1 | **Local Auth & Workspace Guard** | `P0 (Must)` | Login aman + JWT/Session lokal untuk melindungi halaman studio dan brankas API Key. |
| 2 | **BYOK AI API Key Manager & System Doctor** | `P0 (Must)` | Input & enkripsi API Key (Gemini, OpenAI, Claude, OpenRouter, Groq Whisper), tombol Test Connection, estimasi token, dan cek kesiapan FFmpeg/FFprobe lokal. |
| 3 | **Campaign & Brief Document Parser** | `P0 (Must)` | CRUD Campaign, upload brief `.pdf`/`.docx`/`.doc`/teks, ekstraksi AI ke aturan terstruktur (Do's, Don'ts, CTA, Tag wajib, Durasi) yang dapat disunting user. |
| 4 | **Raw Video, Supporting Assets & Chunked Transcript** | `P0 (Must)` | Chunked upload video mentah + supporting assets (logo/watermark PNG, outro, B-roll), FFprobe + Audio Diagnostic, auto-chunking audio (<=20MB/chunk) untuk video panjang >1 jam ke STT, dan silence detection. |
| 5 | **Target Audience Matrix, Framing & Saved Profiles** | `P0 (Must)` | Parameter target lengkap + 3 Mode Framing 16:9->9:16 (*Center Crop*, *Fit-Width Blurred BG*, *Split-Screen*), Mode Batch (*Distinct Moments <=30% overlap* vs *A/B Hook Test*), dan simpan/muat Profil Target Audiens reusable. |
| 6 | **Multi-Variant AI Auto-Editor (EDL + FFmpeg + Bundled Fonts)** | `P0 (Must)` | AI Director menyusun banyak EDL JSON berbeda; Worker lokal merender batch MP4 9:16/16:9 dengan progress live (SSE), bundled local fonts Windows, safe-zone caption, watermark/outro overlay, hook banner, dan audio control. |
| 7 | **Viral Score, Impact Prediction & Critique** | `P0 (Must)` | Skor 0-100 dalam 6 dimensi + Brief Compliance Checklist + Narasi dampak upload + Kritik spesifik ber-timestamp dengan tombol 1-klik kirim ke prompt regenerate. |
| 8 | **Upload Playbook Generator** | `P0 (Must)` | Panduan siap pakai per video: strategi backsound/trending sound TikTok & YT, 3 judul A/B, caption/deskripsi, hashtag tiered, jam tayang optimal lintas country/timezone/usia, pinned comment, cover frame. |
| 9 | **Iterative Prompt Re-Editor & Versioning** | `P0 (Must)` | Edit ulang 1 video spesifik lewat prompt natural atau Quick-Action Presets lapangan (mute 0%, ducking 15-30%, normalize, cut hook, tighten silence, geser safe-zone, edit typo subtitle) + riwayat `v1..vN` & rollback. |
| 10 | **Single & Bulk Streaming ZIP Export** | `P0 (Must)` | Unduh satuan (`.mp4` + playbook + `.srt` + `cover.jpg`) atau unduh keseluruhan sekaligus dalam arsip ZIP terstruktur anti-OOM. |
| 11 | **Safe-Zone Preview Overlay** | `P0 (Must)` | Toggle simulasi tata letak tombol & caption TikTok / YouTube Shorts langsung di atas video player. |
| 12 | **Dynamic Master Data Management** | `P1 (Should)` | CRUD data master (Country presets, Age groups, Editing styles, Quick prompt presets) di database agar bebas hardcode. |
| 13 | **Reference Video Style Cloner (`reelmimic`)** | `P2 (Could / V2)` | Kloning pacing & ritme cut dari video referensi kompetitor viral. |
| 14 | **Visual Timeline Editor (`openmotion`)** | `P2 (Could / V2)` | Editor multi-track manual di browser sebagai pelengkap prompt re-editor. |

### 4.3 Locked Architecture & Tech Stack (Confirmed by Owner)

| Component | Technology Choice | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | `Nuxt 3 / Vue 3` (TypeScript, SPA Studio Mode) | Ringan, startup cepat di lokal, reaktif untuk player video, SSE progress, dan formulir kompleks. |
| **State Management** | `Pinia` (Client State) + `TanStack Vue Query` (Server State) | Pemisahan bersih antara state editor/UI lokal dengan cache API & sinkronisasi status render. |
| **UI Component System** | `Tailwind CSS` + `Shadcn Vue` (Radix Vue / Reka UI) | Aksesibilitas WCAG AA bawaan, ringan, mudah dikustomisasi mengikuti Design DNA studio. |
| **Motion & Micro-UI** | `Vue Transition` + `@vueuse/motion` / `motion` | Transisi halus pada panel editor, gauge skor viral, dan status batch tanpa membebani CPU lokal. |
| **Backend Server** | `Express.js` (Node.js v24 + TypeScript) | Modular, ringan, kontrol penuh atas file streaming, chunked upload, SSE, dan proses child FFmpeg. |
| **Database & ORM** | `SQLite` (Default Lokal Zero-Config) + `Prisma ORM` | Tanpa perlu install server DB terpisah di lokal; mudah dimigrasi ke PostgreSQL jika suatu saat pindah ke VPS. |
| **Job Queue & Concurrency** | `Persistent Local Job Queue` (berbasis tabel SQLite + Worker Pool konfirmasi concurrency 1-2 job) | Bebas ketergantungan Docker/Redis di PC lokal, tahan restart, dan melindungi CPU/RAM dari overload saat render paralel. |
| **Video & Audio Engine** | `Local FFmpeg 8.1.2` + `FFprobe` + `ASS/HyperFrames Subtitle Engine` | 100% gratis tanpa biaya token render per detik, deterministik, presisi milidetik untuk cut, crop, caption, dan audio ducking/mute. |
| **Document Parsing** | `pdf-parse` (`.pdf`), `mammoth` (`.docx`), extractor fallback (`.doc`), plus AI vision fallback opsional untuk PDF scan | Menangani seluruh format dokumen brief yang umum dikirim owner Content Rewards. |
| **AI Gateway (BYOK)** | Modular Provider Adapters: **Google Gemini**, **OpenAI**, **Anthropic Claude**, **OpenRouter** (Brain/EDL/Scorer) + **Groq Whisper / OpenAI Whisper / Deepgram** (Word-Level STT) | Fleksibel memakai API key apa pun yang dimiliki user; validasi respons ketat memakai **Zod**. |
| **Authentication & Crypto** | Local Auth (`Argon2`/`bcryptjs` + `HttpOnly JWT Cookie` + RBAC) + `Node crypto AES-256-GCM` | Mematuhi Mandatory Auth Policy dan memastikan API Key BYOK tersimpan terenkripsi di disk lokal. |
| **Bulk Archive Engine** | `archiver` (Node.js Streaming ZIP) | Membungkus banyak video + playbook langsung ke HTTP response stream tanpa memakan RAM besar. |

### 4.4 End-to-End User Flow

```text
[1. Setup Awal]
Login Lokal -> Cek System Doctor (FFmpeg OK) -> Tempel BYOK API Key -> Test Connection OK
      |
      v
[2. Buat Campaign & Input Bahan]
Create Campaign -> Upload Brief (.pdf/.docx/.doc/teks) -> AI Ekstrak Rulebook (Do's/Don'ts/CTA) -> User Review & Confirm
                -> Upload Raw Video (Chunked) -> FFprobe + Word-Level Transcript + Silence Map
      |
      v
[3. Konfigurasi Target & Generate Multi-Varian]
Set Parameter (Platform, Country, Usia, Persona, Kontroversi, Hook, Emosi, Gaya Edit, Audio Mode, Jumlah Variasi)
-> Cek Estimasi Token -> Klik "Generate Batch"
-> Worker Lokal (SSE Live Progress): Plan N EDL JSON -> Render N Video MP4 -> Hitung Viral Score + Playbook + Kritik
      |
      v
[4. Review Hasil, Impact & Prompt Re-Editor]
Bandingkan Variasi (Urut Skor Tertinggi) -> Putar Video dengan Toggle Safe-Zone TikTok/YT Shorts
-> Baca Upload Playbook (Musik/Sound, Judul, Caption, Tag, Jam Tayang, Pinned Comment)
-> Baca Projected Impact & Kritik Spesifik
-> (Opsional) Pilih 1 Video -> Ketik Prompt / Klik Preset ("Mute/Kecilkan Audio Asli 15% untuk Sound TikTok") / Klik "Terapkan Kritik"
   -> AI Patch EDL JSON -> Render Versi v2 -> Bandingkan v1 vs v2 (Skor & Video) -> Pilih Versi Final
      |
      v
[5. Export & Download]
Download Satuan (.mp4 + playbook + .srt + cover)  ATAU  Download Keseluruhan (Streaming Bulk ZIP Terstruktur)
```

### 4.5 High-Level Screen Overview (Detail ASCII Wireframe di M3)

1. **Screen 1 - Login & Workspace Setup (`/login`, `/settings/api-keys`)**: Form login bersih, kartu status *System Doctor* (FFmpeg/FFprobe/Storage), formulir BYOK API Key per peran (AI Director vs Speech-to-Text), tombol *Test Connection*, dan pengelola *Master Presets*.
2. **Screen 2 - Campaign Dashboard (`/campaigns`)**: Ringkasan campaign aktif, batas waktu, jumlah batch/clip ter-generate, status kepatuhan brief, dan tombol buat campaign baru.
3. **Screen 3 - Campaign Studio: Brief, Media & Target Configurator (`/campaigns/:id/studio`)**: 3 langkah berurutan dalam satu workspace terpadu: (A) Upload & Review Brief Rulebook, (B) Upload Raw Video & Inspeksi Transkrip, (C) Panel Target Audience & Viral Matrix + Estimasi Token + Tombol Generate Batch.
4. **Screen 4 - Multi-Variant Results & Comparison Board (`/campaigns/:id/batches/:batchId`)**: Progress bar live per clip saat rendering, grid kartu hasil terurut dari Viral Score tertinggi, badge *Brief Compliance* (`PASS`/`WARN`/`FAIL`), dan tombol aksi cepat *Inspeksi*, *Download*, atau *Bulk ZIP*.
5. **Screen 5 - Clip Inspector, Upload Playbook & Prompt Re-Editor (`/clips/:clipId`)**: Tata letak 2 kolom presisi:
   - **Kolom Kiri:** Video Preview Player (dengan toggle *Safe-Zone Overlay TikTok / YouTube Shorts*), pemilih versi (`v1`, `v2`, `v3`), perbandingan skor sebelum/sesudah, dan tombol Download Satuan.
   - **Kolom Kanan (Tab Terstruktur):**
     - Tab 1: **Skor Viral, Dampak & Kritik** (6 dimensi skor, checklist brief, proyeksi dampak audiens, daftar kritik ber-timestamp + tombol *"Kirim ke Prompt"*).
     - Tab 2: **Upload Playbook** (instruksi audio/musik trending, 3 opsi judul, caption, hashtag tiered, jam tayang optimal + alasan, pinned comment, cover frame, tombol *Copy All*).
     - Tab 3: **Edit Ulang / Regenerate Prompt** (kotak prompt bebas, chip *Quick-Action Presets Lapangan*, editor typo subtitle inline, preview diff EDL, dan tombol *Regenerate Versi Baru*).

---

## 5. Scope Definition

### 5.1 In Scope (MVP v1.0)

- Autentikasi lokal & enkripsi brankas BYOK API Key (AES-256-GCM).
- Manajemen Campaign + parser dokumen brief `.pdf`, `.docx`, `.doc`, dan teks mentah.
- Chunked upload video mentah lokal + metadata FFprobe + word-level transcription (via BYOK STT) + silence detection.
- Konfigurasi lengkap Target Audience & Viral Matrix (Country, Usia, Bahasa, Gender, Persona/Niche, Kontroversi, Hook, Emosi, KPI, Platform, Editing Style, Caption Style, Mode Audio Awal, Batch Count).
- Multi-variant EDL generation & rendering video lokal via FFmpeg (cut, concat, smart 9:16 crop, audio normalize/duck/mute, animated safe-zone subtitles, hook banner, cover extraction).
- Viral Score Breakdown (6 dimensi) + Brief Compliance Check + Projected Upload Impact + Actionable Critique.
- Upload Playbook lengkap (strategi backsound/trending sound TikTok & YT, judul, caption, tag, jam tayang optimal per country/timezone/usia, pinned comment).
- Iterative Prompt Re-Editor spesifik per video + Quick-Action Presets lapangan + Inline Subtitle Editor + Clip Versioning (`v1..vN`) & Rollback.
- Video Preview Player dengan Safe-Zone Overlay TikTok & YouTube Shorts.
- Export satuan dan Bulk Streaming ZIP terstruktur.
- Master data dinamis (Country, Age Group, Editing Style, Prompt Presets) tanpa hardcode.

### 5.2 Out of Scope (Not in v1.0)

- Auto-publish langsung ke API TikTok/YouTube (memerlukan verifikasi aplikasi berbayar & pembatasan OAuth ketat; v1.0 berfokus pada hasil video + Playbook siap upload manual agar aman dari pembatasan akun).
- Cloud multi-tenant SaaS hosting, payment gateway berlangganan, atau GPU AI video generation berat (Sora/Veo/Wan2.1 character swap).
- Timeline NLE multi-track manual penuh di browser (direncanakan untuk V2 via `openmotion`).

### 5.3 Future Considerations (Phase 2 / V2 Backlog)

- Kloning ritme cut & struktur pacing dari video kompetitor viral (`reelmimic`).
- Visual Timeline Editor multi-track di browser (`openmotion`).
- Auto face-tracking & active-speaker crop berbasis Computer Vision lokal (`ml-vision`).
- Anotasi langsung di atas frame video & Brand Asset Kit reusable (`motlab` + `motlab-assets`).
- Ekspor kalender konten & laporan performa campaign ke `.xlsx` (`excel-export`).
- Migrasi opsional ke PostgreSQL + Redis untuk mode VPS tim multi-user.

---

## 6. User Stories & Acceptance Criteria

### Epic 1: Local Auth, System Preflight & BYOK API Key Manager

#### Story 1.1: Manajemen API Key BYOK Terenkripsi
**As a** kreator konten,
**I want to** menempelkan API Key AI milik saya sendiri (LLM & Transcriber) dan menguji koneksinya,
**So that** saya dapat menjalankan seluruh proses analisis brief, scoring, dan auto-editing tanpa berlangganan SaaS tambahan dan key saya tetap aman.

**Priority:** `P0` | **Milestone:** `M4`

**Acceptance Criteria:**
- [ ] **Given** user sudah login dan membuka `/settings/api-keys`, **When** user memilih provider (misal Google Gemini / OpenAI / Groq), menempelkan API Key, dan menekan *Simpan*, **Then** API Key dienkripsi dengan `AES-256-GCM` sebelum disimpan ke SQLite dan antarmuka hanya menampilkan versi ter-masking (`AIza...9x2k`).
- [ ] **Given** API Key telah tersimpan, **When** user menekan *Test Connection*, **Then** sistem melakukan panggilan ping ringan ke provider terkait dan menampilkan status *Terhubung* (beserta daftar model aktif) atau pesan error human-friendly bila key tidak valid/kuota habis.
- [ ] **Given** user mengakses halaman Studio, **When** sistem memeriksa environment lokal, **Then** indikator *System Doctor* menampilkan status `FFmpeg`, `FFprobe`, dan sisa ruang penyimpanan lokal secara jelas.

**Edge Cases:**
- [ ] Apa yang terjadi jika user belum memasang API Key STT (Whisper) tetapi sudah memasang Gemini? Sistem memberi pilihan fallback (misal Gemini native audio understanding untuk video pendek atau panduan cepat mendaftar Groq Whisper gratis).
- [ ] API Key tidak pernah dikirim ulang dalam bentuk plaintext pada response JSON API maupun ditulis ke file log server.

---

### Epic 2: Campaign, Brief Document Parser & Raw Media Ingestion

#### Story 2.1: Upload & Ekstraksi Terstruktur Dokumen Brief (`.doc/.docx/.pdf`)
**As a** clipper Content Rewards,
**I want to** mengunggah file brief campaign dalam format `.pdf`, `.docx`, atau `.doc` dari pemilik campaign,
**So that** sistem otomatis mengekstrak seluruh aturan wajib dan larangan campaign tanpa saya catat manual.

**Priority:** `P0` | **Milestone:** `M5`

**Acceptance Criteria:**
- [ ] **Given** user berada di dalam sebuah campaign, **When** user mengunggah file `.pdf`, `.docx`, atau `.doc` (atau menempelkan teks brief), **Then** backend mengekstrak teks mentah dan memanggil BYOK LLM (tervalidasi Zod) untuk menghasilkan **Brief Rulebook** berisi: tujuan campaign, platform target, rentang durasi wajib, elemen wajib (CTA, hashtag wajib, mention, disclosure), larangan keras (*Don'ts*), dan tone brand.
- [ ] **Given** Brief Rulebook telah diekstrak, **When** user menemukan 1 poin syarat yang kurang tepat, **Then** user dapat menyunting, menambah, atau menghapus poin aturan tersebut sebelum menyimpannya sebagai brief aktif.

**Edge Cases:**
- [ ] Jika file `.pdf` berupa hasil scan gambar (teks kosong saat diekstrak `pdf-parse`), sistem mendeteksi teks kosong dan menawarkan fallback: ekstraksi via multimodal vision LLM (jika provider mendukung) atau input paste teks manual.
- [ ] File korup atau ekstensi di luar whitelist ditolak dengan pesan validasi yang jelas.

#### Story 2.2: Upload Video Mentah, Supporting Assets, Audio Diagnostic & Auto-Chunked Transcription
**As a** clipper,
**I want to** mengunggah video mentah (termasuk rekaman panjang >1 jam) beserta asset tambahan campaign (logo/watermark PNG, outro, B-roll) dan mendapatkan transkrip ber-timestamp plus diagnosa audio otomatis,
**So that** AI tidak pernah gagal karena batas ukuran API Whisper dan dapat menempelkan logo/watermark wajib brief sekaligus memberi saran mode audio terbaik.

**Priority:** `P0` | **Milestone:** `M5`

**Acceptance Criteria:**
- [ ] **Given** user mengunggah video mentah (`.mp4`/`.mov`/`.mkv`/`.webm`), **When** upload selesai via chunked upload, **Then** sistem menjalankan `ffprobe` (durasi, resolusi, FPS, codec audio, loudness LUFS, ada/tidaknya track audio), menampilkan **Audio Diagnostic Card** (rekomendasi otomatis *Original*, *Ducking 15-30%*, atau *Mute 0%*), dan mendeteksi *silence intervals*.
- [ ] **Given** video mentah berdurasi panjang sehingga ekstrak audio melebihi `20 MB` (batas aman API Groq/OpenAI Whisper 25 MB), **When** proses transkripsi berjalan, **Then** sistem otomatis memecah audio menjadi segmen <=10 menit (overlap 2 detik), mentranskrip berurutan, lalu menggabungkan kembali *word-level timestamps* secara mulus tanpa duplikasi kata.
- [ ] **Given** pemilik campaign memberikan logo/watermark PNG transparan, bumper outro, atau video B-roll terpisah, **When** user mengunggahnya sebagai *Supporting Asset* (`asset_type: watermark | outro | broll`), **Then** asset tersebut terdaftar di campaign dan dapat dipilih untuk dirender otomatis melalui EDL.
- [ ] **Given** video mentah tidak memiliki dialog (murni visual/B-roll), **When** transkripsi menghasilkan teks kosong, **Then** sistem tidak gagal, melainkan menandai mode *Visual-Only / B-Roll* dan menggunakan deteksi perubahan adegan (*scene detection*) sebagai dasar pemotongan.

---

### Epic 3: Target Audience Matrix & Multi-Variant AI Auto-Editor

#### Story 3.1: Konfigurasi Strategi Viral & Generate Batch Multi-Varian
**As a** kreator,
**I want to** mengatur target audiens dan strategi viral secara rinci lalu meminta AI membuat beberapa variasi editan sekaligus,
**So that** saya bisa membandingkan pendekatan mana yang paling berpeluang viral sesuai brief.

**Priority:** `P0` | **Milestone:** `M6`

**Acceptance Criteria:**
- [ ] **Given** Brief Rulebook dan Video Mentah sudah siap, **When** user membuka panel konfigurasi generate, **Then** user dapat memilih seluruh parameter berikut (diambil dari master data dinamis + opsi kustom):
  1. **Platform & Rasio:** TikTok (9:16), YouTube Shorts (9:16), YouTube Long (16:9).
  2. **Demografi & Wilayah:** Country/Region (ID, US, UK, MY, SG, Global, dll.), Bahasa & Gaya Bahasa, Rentang Usia (13-17, 18-24, 25-34, 35-44, 45+), Gender Focus.
  3. **Personalisasi & Psikologi Viral:** Persona/Niche audiens, Tingkat Kontroversi/Polarisasi (*Aman/Edukasi*, *Opini Tegas*, *Hot Take*, *Debat Terkendali - Policy Safe*), Tipe Hook 3 Detik Pertama (*Curiosity Gap*, *Bold Claim*, *Pattern Interrupt*, *Pain Point*, *Storytelling*, *Myth-Busting*, *Listicle*), Pemicu Emosi Utama, dan Primary KPI Goal (*Watch-Time/Loop*, *Comments/Debate*, *Shares/Saves*, *Conversion/Click*).
  4. **Gaya Produksi, Framing & Audio Awal:** Editing Style/Pacing (*Fast-Cut Retention*, *Clean Talking-Head*, *Cinematic Story*, *Podcast Highlight*), **Mode Framing 16:9 -> 9:16** (*Center Crop*, *Fit-Width + Blurred Background* agar teks/presentasi pinggir tidak terpotong, *Split-Screen Atas-Bawah*), Gaya Caption/Subtitle (*Hormozi Bold*, *Clean Minimal*, *Bilingual*, *Off* menggunakan *bundled local fonts* di `server/assets/fonts/`), Mode Audio Awal (*Original 100% Normalized*, *Original Ducking 20% untuk Sound Platform*, *Mute Total 0% untuk Full Trending Sound*), **Mode Diversifikasi Batch** (*Distinct Moments* dengan batas overlap antar clip <= 30% vs *A/B Hook Test* pada momen inti sama), serta **Jumlah Variasi** (1-10 clip).
  5. **Profil Preset Target Audiens Reusable:** User dapat menyimpan kombinasi parameter target di atas sebagai *Target Profile* (misal `"Akun ID Gen-Z Santai"`, `"Akun US Finance Hot-Take"`) dan memuat ulang dalam 1 klik untuk campaign berikutnya.
- [ ] **Given** parameter lengkap dipilih, **When** user menekan *Generate Batch*, **Then** sistem menampilkan estimasi token API terlebih dahulu, lalu menjalankan queue worker lokal yang memancarkan progress real-time via SSE untuk setiap clip (*Planning EDL -> Cutting -> Audio Mixing -> Subtitles -> Scoring -> Done*).
- [ ] **Given** 1 dari 5 clip gagal karena timeout/rate-limit API, **When** batch selesai diproses, **Then** 4 clip yang berhasil tetap tersimpan utuh dan clip yang gagal memiliki tombol *Retry Clip Ini* tanpa mengulang keseluruhan batch.

---

### Epic 4: Viral Score, Impact Analysis, Critique & Upload Playbook

#### Story 4.1: Evaluasi Skor Viral, Prediksi Dampak, Kritik & Petunjuk Cara Upload
**As a** kreator,
**I want to** melihat skor viral, penjelasan dampak upload, kritik spesifik, dan petunjuk lengkap cara upload untuk setiap video hasil generate,
**So that** saya tahu apakah video sudah layak tayang atau bagian spesifik mana yang perlu diperbaiki dulu sebelum di-upload.

**Priority:** `P0` | **Milestone:** `M7`

**Acceptance Criteria:**
- [ ] **Given** sebuah clip selesai dirender, **When** user membuka *Clip Inspector*, **Then** sistem menampilkan **Viral Score Total (0-100)** beserta rincian 6 sub-skor: *Hook Strength (0-3s)*, *Retention & Pacing*, *Brief Compliance* (daftar syarat Pass/Warn/Fail), *Target Audience Fit*, *Engagement/Share Trigger*, dan *Audio & Safe-Zone Health*.
- [ ] **Given** user membuka tab **Upload Playbook**, **Then** sistem menampilkan panduan siap eksekusi yang 100% selaras dengan Country, Usia, Platform, dan Mode Audio clip tersebut:
  - **Strategi Backsound/Musik:** Rekomendasi vibe/genre/BPM + instruksi volume eksak saat upload di aplikasi (misal: *"Video ini ber-audio asli 15%; di TikTok pilih Trending Sound kategori [X] dan atur Original Sound 15% + Added Sound 85%"* atau *"Audio asli di-mute 0%; tambahkan Trending Sound 100%"*).
  - **Judul / Cover Text:** 3 opsi A/B.
  - **Caption / Deskripsi:** Mengikuti gaya bahasa target + otomatis memuat mention/CTA/disclosure wajib brief.
  - **Hashtag / Tag:** Dikelompokkan menjadi *Mandatory Campaign Tags*, *Niche Tags*, dan *Broad Discovery Tags*.
  - **Jam Tayang Optimal:** Rentang jam & hari terbaik dalam zona waktu target Country + penjelasan berbasis kebiasaan kelompok usia.
  - **Engagement Booster:** 2 ide *Pinned Comment* pemicu interaksi + frame cover rekomendasi.
- [ ] **Given** user membuka panel **Dampak & Kritik**, **Then** sistem menyajikan narasi *Projected Upload Impact* dan daftar *Actionable Critique* berbasis timestamp di mana setiap item kritik memiliki tombol **1-Klik "Perbaiki dengan Prompt"**.
- [ ] **Given** user memutar preview video, **When** user mengaktifkan toggle **Safe-Zone Overlay (TikTok / YouTube Shorts)**, **Then** overlay transparan area tombol kanan, header atas, dan area caption bawah tampil di atas player untuk inspeksi visual.

---

### Epic 5: Iterative Prompt Re-Editor (Regenerate per Video) & Clip Versioning

#### Story 5.1: Edit Ulang & Regenerate 1 Video Spesifik dengan Prompt Penyesuaian
**As a** kreator,
**I want to** mengedit ulang hanya 1 video tertentu menggunakan prompt bahasa alami atau tombol cepat lapangan (seperti mute/mengecilkan audio asli untuk diganti musik TikTok/YouTube),
**So that** saya bisa memperbaiki kekurangan dari hasil review/kritik secara presisi tanpa membuang hasil editan lain yang sudah bagus.

**Priority:** `P0` | **Milestone:** `M8`

**Acceptance Criteria:**
- [ ] **Given** user membuka clip versi `v1`, **When** user mengetik prompt penyesuaian (contoh: *"suara audio asli belum sesuai brief, tolong mute total atau kecilkan ke 15% karena akan diganti sound musik di TikTok, dan naikkan subtitle supaya tidak ketutup caption"*), **Then** AI menerjemahkan prompt menjadi **EDL Patch JSON** yang hanya memodifikasi properti terkait, me-render versi baru (`v2`), dan menjalankan ulang scoring + update instruksi audio di Upload Playbook secara otomatis!
- [ ] **Given** user ingin revisi cepat tanpa mengetik panjang, **Then** tersedia **Quick-Action Presets Lapangan** yang dapat diklik (tunggal maupun kombinasi):
  - *Mute Audio Asli (0%)* (siap ganti sound TikTok/YT),
  - *Kecilkan Audio Asli ke 15% / 30%* (ducking untuk latar sound trending),
  - *Normalize & Clean Vokal Asli*,
  - *Potong 2 Detik Awal / Langsung ke Punchline*,
  - *Perketat Semua Jeda Hening (Fast Jump-Cut)*,
  - *Naikkan Posisi Subtitle ke Safe-Zone*,
  - *Perbesar / Ubah Gaya Subtitle*,
  - *Zoom-in 115% / Re-frame 9:16*,
  - *Sisipkan CTA / Watermark / Disclaimer Wajib Brief*.
- [ ] **Given** terdapat typo kata pada subtitle, **When** user membuka **Inline Subtitle Editor**, **Then** user dapat menyunting teks kata per kata secara langsung dan merender ulang tanpa perlu menebak lewat prompt.
- [ ] **Given** clip memiliki beberapa versi (`v1`, `v2`, `v3`), **When** user membandingkan versi, **Then** user dapat melihat perbandingan video & delta skor viral (*Before vs After*) serta memilih versi mana pun sebagai *Final Version* atau melakukan *Rollback*.

---

### Epic 6: Export & Download (Single & Bulk Streaming ZIP)

#### Story 6.1: Download Satuan & Download Keseluruhan Sekaligus
**As a** kreator,
**I want to** mengunduh video satu per satu beserta playbook-nya, atau mengunduh semua video final sekaligus dalam satu file ZIP rapi,
**So that** saya bisa langsung memindahkan file ke HP atau membagikannya ke tim uploader dengan cepat.

**Priority:** `P0` | **Milestone:** `M9`

**Acceptance Criteria:**
- [ ] **Given** user memilih 1 clip yang sudah final, **When** user menekan *Download Video*, **Then** browser mengunduh `.mp4` (H.264 + AAC yuv420p, kompatibel penuh di iOS/Android/TikTok/YouTube) dan user juga dapat mengunduh `upload-playbook.txt`, `subtitles.srt`, `cover.jpg`, atau menekan *Copy All Playbook*.
- [ ] **Given** user berada di halaman hasil batch, **When** user menekan *Download Semua (ZIP)* (atau memilih filter seperti *Hanya Final* / *Score >= 80* / pilihan manual), **Then** backend men-stream file ZIP terstruktur (`00-RINGKASAN-CAMPAIGN-DAN-JADWAL-UPLOAD.md` + folder per clip berisi video, playbook, `.srt`, dan `cover.jpg`) tanpa menyebabkan lonjakan RAM (*streaming archiver*).

---

## 7. Core Data Contracts (Overview)

### 7.1 Entity Overview (SQLite WAL + Prisma - Detail Skema di `technical-blueprint-m3.md`)

Tabel inti yang dikunci di M3 dan diimplementasikan sejak M4 (11 model):
- `users` (autentikasi lokal, role RBAC)
- `api_keys` (provider, role `brain`/`stt`/`tts`, ciphertext AES-256-GCM, iv, auth_tag, masked_preview, model_default, is_active)
- `master_presets` (category: `country`/`age_group`/`editing_style`/`hook_type`/`framing_mode`/`prompt_preset`, code, label_id, config_json, sort_order, is_active - **Zero Hardcoded Policy**)
- `target_profiles` (user_id, profile_name, description, target_config_json, is_default - profil target audiens reusable multi-akun)
- `campaigns` (user_id, title, brand_owner, platform_targets_json, reward_notes, deadline_at, status)
- `campaign_briefs` (campaign_id, source_type, original_filename, raw_text, parsed_rulebook_json, confirmed_by_user)
- `media_assets` (campaign_id, asset_type `raw_video`/`watermark`/`outro`/`broll`, file_path, duration_sec, width, height, fps, has_audio, loudness_lufs, audio_diagnostic_json, transcript_json, silences_json)
- `generation_batches` (campaign_id, target_profile_id, target_config_json, batch_diversity_mode, requested_count, status, estimated_tokens, actual_tokens)
- `clips` (batch_id, angle_title, active_version_id, is_approved, status)
- `clip_versions` (clip_id, version_number, user_prompt, edl_json, output_video_path, output_srt_path, cover_image_path, viral_score_total, score_breakdown_json, impact_critique_json, upload_playbook_json, render_duration_ms)
- `render_jobs` (entity_type, entity_id, status `queued`/`processing`/`completed`/`failed`, progress_pct, stage_label, error_message, retry_count)

### 7.2 Kontrak Deterministik `EDL JSON v1.1` (Edit Decision List)

Setiap video dihasilkan dan diedit ulang melalui satu kontrak JSON yang divalidasi Zod agar hasil render deterministik dan perubahan lewat prompt di M8 bersifat terarah (*targeted patch*):

```json
{
  "schemaVersion": "1.1",
  "aspectRatio": "9:16",
  "framingMode": "fit_blur_bg",
  "resolution": { "width": 1080, "height": 1920, "fps": 30 },
  "segments": [
    { "mediaAssetId": "asset_01", "startSec": 12.4, "endSec": 18.9, "zoom": 1.05, "cropX": "center" },
    { "mediaAssetId": "asset_01", "startSec": 34.1, "endSec": 58.2, "zoom": 1.0, "cropX": "center" }
  ],
  "audio": {
    "originalVolume": 0.15,
    "muteOriginal": false,
    "normalizeLufs": -14,
    "intendedPlatformSound": "tiktok_trending_overlay"
  },
  "hookBanner": {
    "enabled": true,
    "text": "Banyak clipper rugi karena salah setting ini",
    "startSec": 0.0,
    "endSec": 3.0,
    "position": "top_safe_zone"
  },
  "captions": {
    "enabled": true,
    "style": "hormozi_bold",
    "fontFamily": "Montserrat-ExtraBold",
    "safeZonePreset": "tiktok_9_16",
    "verticalOffsetPct": 72,
    "overrides": []
  },
  "supportingOverlays": {
    "watermarkAssetId": null,
    "watermarkPosition": "top_left_safe",
    "watermarkOpacity": 0.85,
    "outroAssetId": null
  },
  "complianceOverlays": {
    "ctaText": "Cek link di bio",
    "ctaStartSec": 26.0,
    "disclosureText": ""
  }
}
```

---

## 8. Non-Functional Requirements

### 8.1 Performance & Resource Safety (Local PC)

| Metric | Target | Safeguard |
| :--- | :--- | :--- |
| UI Page Load (Lokal) | < 1.5s | Nuxt 3 SPA ringan + lazy-loaded media thumbnails |
| API CRUD Response (p95) | < 150ms | SQLite WAL mode + indeks query terstruktur |
| Max Concurrent FFmpeg Renders | 1-2 worker (configurable di Settings) | Melindungi CPU & RAM laptop agar tidak freeze saat batch 5-10 clip |
| Chunked Video Upload | Mendukung file hingga 2 GB lokal | Streaming disk write per chunk, bebas buffering penuh di RAM |
| Bulk ZIP Export | Streaming langsung ke client | Memakai `archiver` stream, stabil meski total bundle > 1 GB |

### 8.2 Security & Authentication Policy

- **Mandatory Auth & RBAC:** Seluruh halaman studio dan endpoint `/api/*` dilindungi autentikasi login lokal & role guard.
- **BYOK Secret Protection:** API Key dienkripsi `AES-256-GCM` memakai `APP_ENCRYPTION_KEY` di `.env` (wajib masuk `.gitignore`). Tidak pernah terekspos plaintext pada response API, DOM, ataupun console/file log.
- **Anti Shell-Injection FFmpeg:** Eksekusi `ffmpeg` / `ffprobe` **WAJIB** menggunakan `child_process.spawn(bin, argsArray)` (bukan string concatenation via `exec`), dengan sanitasi path absolut terbatas di dalam direktori `storage/` proyek (*path traversal protection*).
- **File Upload Validation:** Validasi MIME type + magic bytes + ekstensi whitelist untuk `.pdf`, `.docx`, `.doc`, dan format video standar.
- **Strict Boundary Validation:** Seluruh payload HTTP dan seluruh keluaran JSON dari AI API divalidasi dengan **Zod** sebelum menyentuh DB atau FFmpeg.

### 8.3 Accessibility & Responsiveness

- Kepatuhan **WCAG 2.1 AA** (rasio kontras teks >= 4.5:1, kontrol UI >= 3:1).
- Navigasi keyboard penuh untuk reviewer clip (Play/Pause `Space`, navigasi antar tab, konfirmasi modal `Escape`).
- Layout desktop-first untuk produksi studio, namun **mobile-responsive** pada halaman *Results* dan *Clip Inspector* agar user bisa membuka via jaringan Wi-Fi lokal (LAN) dari HP untuk langsung preview & unduh `.mp4` ke galeri HP lalu upload ke TikTok/YouTube!

---

## 9. Success Metrics & Launch Criteria (v1.0)

### 9.1 Operational Goals

| Metric | Measurement Method |
| :--- | :--- |
| **End-to-End Batch Completion** | 1 campaign dengan brief PDF/DOCX + raw video berhasil menghasilkan minimal 3 variasi MP4 siap putar + skor + playbook tanpa error manual. |
| **Brief Compliance Detection** | Seluruh syarat wajib (durasi, hashtag, CTA, larangan) dari brief uji terdeteksi akurat dan tampil pada checklist setiap clip. |
| **Targeted Prompt Regenerate Accuracy** | Prompt lapangan (contoh: *"mute audio asli"* atau *"kecilkan volume ke 15%"*) mengubah parameter audio pada `v2` secara terukur (diverifikasi via `ffprobe` / waveform) serta memperbarui instruksi audio di Upload Playbook. |
| **Safe-Zone Visual Integrity** | 0 subtitle terpotong atau bertumpuk dengan area tombol TikTok/YouTube Shorts pada preset safe-zone default. |
| **Download Integrity** | Unduhan satuan dan bulk ZIP 100% dapat diekstrak dan diputar normal di VLC, browser, serta perangkat Android/iOS. |

### 9.2 Launch Readiness Gate (M10)

- [ ] Seluruh unit test, integration test, dan Playwright E2E flow lulus tanpa error.
- [ ] Mandatory Delivery Gate 4-Blok (`antislop`) berstatus `PASS`.
- [ ] Seluruh modul terdokumentasi di `.agents/menu-docs/` (Standar V2) dan tersinkron ke `documentasi-projects` via `sync-docs.js`.
- [ ] Repositori GitHub `main` dan `dev` tersinkron bersih bebas file rahasia/media mentah.

---

## 10. Dependencies, Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
| :--- | :---: | :---: | :--- |
| **AI API Rate Limit / Quota Habis saat Batch** | Sedang | Tinggi | Implementasi exponential backoff, retry parsial per clip, dan estimator token sebelum klik Generate. |
| **CPU/RAM Laptop Penuh saat Render Banyak Variasi** | Tinggi | Tinggi | Batasi concurrency FFmpeg default = 1 (maks 2 di settings), gunakan preset encoding efisien (`-preset fast`/`veryfast`), dan tampilkan tombol *Pause/Cancel Batch*. |
| **PDF Brief Berupa Scan Gambar (Bukan Teks)** | Sedang | Sedang | Deteksi panjang teks hasil `pdf-parse`; jika kosong, tawarkan ekstraksi via multimodal vision LLM atau paste teks manual. |
| **Audio Video Mentah Berisi Musik Berhak Cipta** | Tinggi | Tinggi | Sediakan pilihan *Mute Audio Asli (0%)* & *Ducking (15-30%)* sejak awal generate maupun lewat 1-klik preset regenerate, plus peringatan di Upload Playbook. |
| **Storage Lokal Penuh oleh Render Versi Lama** | Sedang | Sedang | Sediakan indikator pemakaian disk di dashboard dan tombol *Bersihkan Versi Usang / Cache Temp* yang aman. |
| **AI Menghasilkan Timestamp di Luar Durasi Video** | Sedang | Tinggi | Validator Zod + clamp durasi berbasis hasil `ffprobe` aktual sebelum dikirim ke worker FFmpeg; auto-repair prompt jika invalid. |

---

## 11. Timeline, Governance & References

- **Master Milestone & Skill Matrix:** Lihat [MILESTONE.md](./MILESTONE.md) (`M0` sampai `M10` + `V2 Backlog`).
- **Governance & Dokumentasi Proyek (dibangun di M2):** Mengikuti arsitektur `.agents/` Standar V2 (`AGENTS.md`, `rules/`, `workflows/`, `menu-docs/`, `knowledge/`, `02-session-state/`, `04-case-bank/`, dan mirroring `sync-docs.js` ke portal `documentasi-projects`).

### Glossary

| Term | Definition |
| :--- | :--- |
| **Content Rewards** | Model campaign creator/clipper di mana pemilik brand/kreator memberikan imbalan (biasanya berbasis views/CPM) untuk video yang dibuat sesuai brief campaign. |
| **BYOK (Bring Your Own Key)** | Pola arsitektur di mana pengguna memakai API Key AI miliknya sendiri (Gemini, OpenAI, Claude, Groq, dll.) secara langsung tanpa markup kredit platform. |
| **EDL (Edit Decision List)** | Representasi JSON deterministik berisi daftar potongan timestamp, crop, level audio, hook banner, dan konfigurasi subtitle yang menjadi jembatan antara AI dan mesin render FFmpeg. |
| **Safe-Zone** | Area aman pada frame vertikal 9:16 di TikTok dan YouTube Shorts yang bebas dari tutupan tombol interaksi kanan, tab atas, dan teks caption bawah. |
| **Audio Ducking** | Teknik mengecilkan volume suara asli video (misalnya ke 15%-30%) agar tetap terdengar samar atau memberi ruang bersih bagi musik latar/trending sound platform. |

### Changelog

| Version | Date | Author | Changes |
| :--- | :--- | :--- | :--- |
| `v1.0` | 2026-11-26 | AhmadArifff & AI PM | Initial baseline PRD (M1): Locked Nuxt 3/Vue 3 + Express + SQLite/Prisma + Local FFmpeg + BYOK architecture, full 3-stage flow, targeting matrix, upload playbook, prompt re-editor, & bulk ZIP export. |
| `v1.1` | 2026-11-26 | AhmadArifff & AI Architect/Critic | M3 Gap Audit upgrade: Menambahkan Whisper audio chunking (<=20MB/chunk) untuk video >1 jam, supporting assets (watermark/logo/outro/B-roll), 3 mode framing 16:9->9:16, reusable `target_profiles`, anti-duplicate batch diversity mode, bundled local Windows fonts, audio diagnostic pre-generate, serta tautan ke `technical-blueprint-m3.md`. |
