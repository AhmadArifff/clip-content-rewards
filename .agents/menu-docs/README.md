# Indeks Dokumentasi Menu & Modul - `clip-content-rewards` (Standar V2)

> **Single Source of Truth (SSOT) Dokumentasi Operasional**: Direktori ini menyimpan dokumentasi setiap halaman dan modul aplikasi mengikuti **Standar V2 (10 Bagian: 8 Bagian Fondasi + Bagian 9 Peta Alur & Flow Testing Per-Konten UI + Bagian 10 Disambiguasi Fitur Kembar Lintas-Menu)**. Seluruh dokumen siap dicerminkan otomatis ke portal SaaS `documentasi-projects` melalui `node .agents/scripts/sync-docs.js`.

---

## Peta Modul Terencana (M4 - M9)

| No | Kategori | Nama Menu / Modul | Route | Milestone | Status | Berkas Dokumen |
| :-: | :--- | :--- | :--- | :---: | :---: | :--- |
| **01** | **01-pengaturan** | Autentikasi Lokal & Brankas BYOK API Keys | `/settings/api-keys` | `M4` | `Done` | [`01-pengaturan/byok-api-keys.md`](./01-pengaturan/byok-api-keys.md) |
| **02** | **01-pengaturan** | Master Presets Dinamis & System Doctor | `/settings/presets` | `M4` | `Done` | [`01-pengaturan/master-presets-doctor.md`](./01-pengaturan/master-presets-doctor.md) |
| **03** | **02-campaign** | Manajemen Campaign & Parser Brief (`.doc/.docx/.pdf`) | `/campaigns` | `M5` | `Done` | [`02-campaign/campaign-dan-brief.md`](./02-campaign/campaign-dan-brief.md) |
| **04** | **02-campaign** | Raw Video Ingestion, Transkrip & Silence Map | `/campaigns/:id/studio` | `M5` | `Done` | [`02-campaign/raw-media-ingestion.md`](./02-campaign/raw-media-ingestion.md) |
| **05** | **03-studio** | Target Audience Matrix & Multi-Variant Auto-Editor | `/campaigns/:id/batches/:batchId` | `M6` | `Done` | [`03-studio/ai-video-generator.md`](./03-studio/ai-video-generator.md) |
| **06** | **03-studio** | Viral Score, Projected Impact, Critique & Upload Playbook | `/clips/:clipId` | `M7` | `Done` | [`03-studio/viral-score-dan-playbook.md`](./03-studio/viral-score-dan-playbook.md) |
| **07** | **03-studio** | Iterative Prompt Re-Editor, Inline Subtitle & Versioning | `/clips/:clipId` | `M8` | `Done` | [`03-studio/prompt-reeditor-versioning.md`](./03-studio/prompt-reeditor-versioning.md) |
| **08** | **04-export** | Single Download & Bulk Streaming ZIP Bundle | `/campaigns/:id/export` | `M9` | `Planned` | `04-export/download-dan-bundle.md` |

---

## 4 Dokumen Fondasi Global (Otomatis Dicerminkan via `sync-docs.js`)

1. [../rules/10-architecture.md](../rules/10-architecture.md) -> `system-architecture.md`
2. [../rules/50-video-ai-pipeline.md](../rules/50-video-ai-pipeline.md) -> `video-ai-pipeline.md`
3. [../knowledge/bug-cases.md](../knowledge/bug-cases.md) -> `production-bug-cases.md`
4. [../knowledge/cross-menu-disambiguation.md](../knowledge/cross-menu-disambiguation.md) -> `cross-menu-disambiguation.md`

---

## Template & Sinkronisasi

- Template wajib setiap modul baru: [TEMPLATE-MENU-DOC.md](./TEMPLATE-MENU-DOC.md)
- Simulasi sinkronisasi aman (tanpa menulis keluar workspace): `node .agents/scripts/sync-docs.js --dry-run`
- Sinkronisasi ke portal `documentasi-projects`: `node .agents/scripts/sync-docs.js`
