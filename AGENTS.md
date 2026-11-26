# clip-content-rewards - Project Governance & AI Agent Rules

> [!CAUTION]
> **FILE INI AUTO-LOAD DI SETIAP SESI BARU.** AI Agent WAJIB membaca dan mematuhi seluruh aturan di bawah ini sebelum melakukan perencanaan, koding, pengujian, maupun pembaruan dokumentasi.

---

## 1. System Identity Card

| Aspek | Detail |
| :--- | :--- |
| **Nama Proyek** | `clip-content-rewards` (AI Auto-Editor, Viral Scorer & Upload Playbook Studio untuk Content Rewards) |
| **Frontend Stack** | Nuxt 3 / Vue 3 (TypeScript, SPA Studio Mode), Pinia, TanStack Vue Query, Tailwind CSS, Shadcn Vue |
| **Backend Stack** | Express.js (Node.js `v24.18.0`, TypeScript), Prisma ORM, Zod Boundary Validation |
| **Database & Queue** | SQLite (WAL Mode, zero-config lokal, siap migrasi PostgreSQL) + Local Persistent Job Queue |
| **Media Engine** | Local FFmpeg `8.1.2-full_build` & FFprobe + ASS/HyperFrames Safe-Zone Caption Renderer |
| **AI Gateway** | BYOK (Bring Your Own Key) Multi-Provider: Gemini, OpenAI, Claude, OpenRouter (Brain/EDL/Scorer) + Groq Whisper / OpenAI Whisper / Deepgram (Word-Level STT) |
| **Arsitektur Ketat** | Route -> Controller -> Zod Validator -> Service (`ServiceResult`) -> Repository / AI Adapter / Media Worker |
| **Mode Operasional** | 100% Lokal PC/Laptop (gratis biaya render, dapat diakses via LAN HP untuk preview & unduh) |
| **Repository** | `https://github.com/AhmadArifff/clip-content-rewards.git` (`main` stabil, `dev` integrasi) |
| **Dokumen Induk** | [PRD.md](./PRD.md) & [MILESTONE.md](./MILESTONE.md) |

---

## 2. Larangan Mutlak (Zero Exception Guardrails)

1. **DILARANG Membocorkan Secret / API Key BYOK**: API Key user WAJIB dienkripsi `AES-256-GCM` sebelum disimpan ke DB, hanya tampil ter-masking (`sk-...xxxx`) di UI/API, dan tidak pernah ditulis ke log, error stack, maupun commit Git.
2. **DILARANG Shell Injection pada FFmpeg/FFprobe**: Seluruh eksekusi `ffmpeg`/`ffprobe` WAJIB memakai `child_process.spawn(bin, argsArray)` dengan validasi path di dalam direktori `storage/` proyek. Dilarang keras memakai `exec()` dengan string concatenation.
3. **DILARANG Langsung Koding Tanpa Review Gate**: Sebelum membangun modul baru atau mengubah logika inti, AI Agent WAJIB menyajikan **Review Task** (beserta Analogi Nyata, Impact Before vs After, Matriks Target Perubahan, dan Audit Celah Lapangan) lalu menunggu persetujuan pengguna.
4. **DILARANG Mem-bypass Layer Arsitektur atau Auth Guard**: Route/Controller tidak boleh mengakses Prisma/FFmpeg/AI SDK secara langsung tanpa melewati layer Service dan validasi Zod. Seluruh route studio & `/api/*` wajib dilindungi auth guard.
5. **DILARANG Meng-hardcode Master Data**: Daftar Country, Age Group, Editing Style, Hook Type, dan Quick-Action Prompt Presets WAJIB disimpan di tabel `master_presets` agar dapat dikelola secara dinamis.
6. **DILARANG Mengirim JSON Tak Tervalidasi dari AI ke FFmpeg/DB**: Seluruh keluaran LLM (Brief Rulebook, EDL JSON, Viral Score/Critique, Upload Playbook, EDL Patch) WAJIB lolos validasi **Zod** + batas durasi aktual dari `ffprobe`.
7. **DILARANG Overloading CPU Lokal**: Concurrency worker render FFmpeg dibatasi default `1` (maksimal `2` via konfigurasi) agar laptop/PC tidak hang saat batch generate 5-10 variasi.
8. **DILARANG Menulis Komentar Kode Berkualitas Rendah (Zero-Outflow Standard)**: Komentar kode ringkas 1-2 baris fungsional, fokus 100% pada logika internal proyek tanpa meta-jargon AI, banner ASCII dekoratif, atau rujukan proyek eksternal.
9. **DILARANG Meninggalkan Dead Code & Istilah Teknis di UI**: Hapus tuntas kode/komponen usang sisa iterasi. Label UI, modal, dan pesan error WAJIB berbahasa Indonesia yang human-friendly (bebas jargon seperti `query`, `SQLite`, `record`, `EDL schema error`), sementara nilai storage/ENUM di DB WAJIB berbahasa Inggris baku.
10. **DILARANG Men-skip Dokumentasi Menu Standar V2 & Session State**: Sebuah milestone/modul belum berstatus `DONE` sebelum `.agents/menu-docs/` (10 Bagian Standar V2) dibuat/diperbarui secara *additive*, `.agents/02-session-state/active-session.json` diperbarui, dan lulus verifikasi QA.
11. **WAJIB Protokol Docs-First Retrieval**: Sebelum mengedit atau mengaudit modul yang sudah ada, baca `.agents/menu-docs/<kategori>/<modul>.md` terlebih dahulu sebelum melakukan pencarian luas di codebase.
12. **DILARANG Menjalankan Playwright Otomatis atau `git push` Tanpa Izin Eksplisit**: Pengujian browser Playwright dan push Git ke remote hanya dieksekusi setelah disetujui/diminta pengguna.

---

## 3. Alur Kerja Wajib Setiap Task Baru

```text
Permintaan Fitur / Fix
  -> [1] Baca active-session.json + menu-docs terkait (Docs-First)
  -> [2] Sajikan Review Task (8 Pilar + Before vs After + Gap Audit) -> STOP & Tunggu "Setuju"
  -> [3] Implementasi Modular (Backend + Frontend + Worker)
  -> [4] Verifikasi QA (Unit/Integration/FFmpeg Probe + Anti-Slop Delivery Gate)
  -> [5] Update menu-docs V2 + active-session.json + bug-cases.md + sync-docs.js
```

---

## 4. Peta Navigasi Tata Kelola (`.agents/`)

| Bidang | Berkas Acuan |
| :--- | :--- |
| **Peta Induk `.agents/`** | [.agents/README.md](./.agents/README.md) |
| **Guardrails Mutlak** | [.agents/rules/00-core-guardrails.md](./.agents/rules/00-core-guardrails.md) |
| **Disiplin Alur Kerja & Clean Code** | [.agents/rules/01-workflow-discipline.md](./.agents/rules/01-workflow-discipline.md) |
| **Arsitektur Nuxt 3 + Express + Queue** | [.agents/rules/10-architecture.md](./.agents/rules/10-architecture.md) |
| **Database SQLite/Prisma & Master Data** | [.agents/rules/20-database.md](./.agents/rules/20-database.md) |
| **UI/UX Studio, Safe-Zone & Anti-Slop** | [.agents/rules/30-ui-frontend.md](./.agents/rules/30-ui-frontend.md) |
| **Keamanan Auth, BYOK Vault & Upload** | [.agents/rules/40-security-byok.md](./.agents/rules/40-security-byok.md) |
| **Pipeline Video FFmpeg, EDL & AI** | [.agents/rules/50-video-ai-pipeline.md](./.agents/rules/50-video-ai-pipeline.md) |

### Prosedur Kerja Baku (*Workflows*)
- [Protokol Review Task (8 Pilar)](./.agents/workflows/task-review-protocol.md)
- [SOP Pembuatan Modul Baru](./.agents/workflows/new-module.md)
- [SOP Post-Development QA](./.agents/workflows/post-dev-qa.md)
- [SOP Pengujian Browser Playwright](./.agents/workflows/playwright-testing.md)

### Pengetahuan, Skill & pelacak Sesi
- **Indeks Dokumentasi Menu V2:** [.agents/menu-docs/README.md](./.agents/menu-docs/README.md)
- **Knowledge Base & Bug Cases:** [.agents/knowledge/README.md](./.agents/knowledge/README.md)
- **Kamus Disambiguasi Lintas-Menu:** [.agents/knowledge/cross-menu-disambiguation.md](./.agents/knowledge/cross-menu-disambiguation.md)
- **Manifest 25 Core Skills:** [.agents/skills/README.md](./.agents/skills/README.md)
- **Session State Tracker:** [.agents/02-session-state/active-session.json](./.agents/02-session-state/active-session.json) (`node .agents/02-session-state/session-manager.js`)
- **Mirroring Docs ke Portal SaaS:** `node .agents/scripts/sync-docs.js` (gunakan `--dry-run` untuk simulasi aman)
