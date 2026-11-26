# Peta Tata Kelola & Dokumentasi Proyek (`clip-content-rewards`)

Direktori `.agents/` adalah pusat kendali arsitektur, aturan kerja, katalog skill teradopsi, basis pengetahuan kasus, dokumentasi menu Standar V2, dan pelacak status sesi untuk proyek **Clip Content Rewards**.

> [!NOTE]
> File auto-load utama di setiap sesi baru adalah [`AGENTS.md`](../AGENTS.md) di root proyek. Dokumen ini mengarahkan agen ke berkas aturan spesifik secara *on-demand* agar konteks tetap presisi dan hemat token.

---

## 1. Aturan Inti (Selalu Aktif)

- **[rules/00-core-guardrails.md](./rules/00-core-guardrails.md)**: Larangan mutlak keamanan BYOK, anti shell-injection FFmpeg, isolasi storage, auth guard, dan batas eksekusi lokal.
- **[rules/01-workflow-discipline.md](./rules/01-workflow-discipline.md)**: Siklus OODA, Review Gate, Docs-First Retrieval, higienitas komentar kode (*Zero-Outflow*), dan penghapusan dead code.

## 2. Peta Aturan Berdasarkan Area Kerja (*Task-Based Rules*)

| Area Pengerjaan | Buka & Patuhi Berkas | Cakupan Utama |
| :--- | :--- | :--- |
| **Backend & Arsitektur (`server/**`)** | [rules/10-architecture.md](./rules/10-architecture.md) | Modular layers, `ServiceResult`, Zod boundary validation, AI Adapter Pattern, Local Job Queue & SSE. |
| **Database & Master Data (`prisma/**`)** | [rules/20-database.md](./rules/20-database.md) | SQLite WAL + Prisma ORM, siap migrasi PostgreSQL, nilai DB English vs UI Indonesia, `master_presets`. |
| **Frontend Studio (`client/**`)** | [rules/30-ui-frontend.md](./rules/30-ui-frontend.md) | Nuxt 3/Vue 3, Pinia + Vue Query, Shadcn Vue, Safe-Zone Player Overlay, Anti-Slop Gate, Mobile Preview. |
| **Keamanan & BYOK (`auth`, `vault`)** | [rules/40-security-byok.md](./rules/40-security-byok.md) | Auth guard, AES-256-GCM API key vault, masking, zero-log secret, validasi upload brief & video. |
| **Video Engine & AI (`ffmpeg`, `edl`)** | [rules/50-video-ai-pipeline.md](./rules/50-video-ai-pipeline.md) | Kontrak EDL JSON, FFmpeg `spawn` recipes, audio ducking/mute, safe-zone captions, retry parsial, cleanup. |

## 3. Prosedur Kerja Baku (*Workflows*)

- **[workflows/task-review-protocol.md](./workflows/task-review-protocol.md)**: Protokol Review Task 8 Pilar wajib sebelum menulis kode.
- **[workflows/new-module.md](./workflows/new-module.md)**: SOP penambahan modul baru end-to-end (Prisma -> Express -> Nuxt 3 -> Menu Doc V2).
- **[workflows/post-dev-qa.md](./workflows/post-dev-qa.md)**: SOP QA pasca-development (Unit/Integration + FFmpeg Output Probe + Delivery Gate).
- **[workflows/playwright-testing.md](./workflows/playwright-testing.md)**: SOP pengujian E2E browser Playwright (hanya atas persetujuan/permintaan user).

## 4. Dokumentasi Menu Standar V2 & Knowledge Base

- **[menu-docs/README.md](./menu-docs/README.md)**: Indeks seluruh modul aplikasi beserta template baku 10 Bagian ([`TEMPLATE-MENU-DOC.md`](./menu-docs/TEMPLATE-MENU-DOC.md)).
- **[knowledge/README.md](./knowledge/README.md)**: Pusat basis pengetahuan domain, [bug-cases.md](./knowledge/bug-cases.md), dan [cross-menu-disambiguation.md](./knowledge/cross-menu-disambiguation.md).
- **[04-case-bank/cases/](./04-case-bank/cases/)**: Pola solusi terverifikasi berformat YAML (dual-approval QA + Tech Critic).

## 5. Adopsi Skill, Session State & Mirroring Portal

- **[skills/README.md](./skills/README.md)**: Manifest pemetaan **25 Core Skills** (dari 62 skill global unik) beserta referensi lokal pipeline video & playbook.
- **[02-session-state/active-session.json](./02-session-state/active-session.json)**: Single Source of Truth status milestone, active goal, dan locked constraints.
  - Verifikasi CLI: `node .agents/02-session-state/session-manager.js`
- **[scripts/sync-docs.js](./scripts/sync-docs.js)**: Skrip mirroring dokumentasi menu & 4 dokumen fondasi ke portal `documentasi-projects`.
  - Uji simulasi aman: `node .agents/scripts/sync-docs.js --dry-run`
  - Sinkronisasi nyata: `node .agents/scripts/sync-docs.js`
