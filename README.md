# Clip Content Rewards

Tools studio web lokal berbasis **Monorepo (Nuxt 3 / Vue 3 + Express.js)**, **BYOK AI API**, **SQLite lokal (zero-config)**, dan **FFmpeg lokal** untuk memproduksi konten video siap upload di **TikTok** dan **YouTube (Shorts & Long)** mengikuti brief campaign **Content Rewards**.

## Fitur Utama

1. **Multi-Theme Studio (3 Tema Switchable dengan Slicing & Konten Berbeda)**:
   - **Editing Room**: Dark Pro Broadcast Console (left tool rail + telemetry strip monospace + aksen Emerald).
   - **Daylight Editorial**: Warm Paper Magazine Desk (masthead topbar lega + serif display + aksen Vermilion).
   - **Tactile Workbench**: High-Craft Neo-Tactile Desk (floating pill dock + border tegas `2px` + tombol fisik press-down + aksen Cobalt).
2. **Keamanan Lokal & Brankas BYOK API Key (`M4`)**: Login lokal, System Doctor (cek FFmpeg/FFprobe/Fonts/SQLite WAL), enkripsi `AES-256-GCM`, masking preview, dan *Test Connection* 6 penyedia AI (Gemini, OpenAI, Claude, OpenRouter, Groq Whisper, Deepgram).
3. **Master Presets Dinamis (`M4`)**: Zero-hardcode daftar Negara/Timezone, Usia, Gaya Editing, Hook 3 Detik, Level Kontroversi, Mode Framing 9:16, dan 9 Preset Prompt Lapangan (*Mute Audio Asli 0%*, *Ducking 15%/30%*, dll.).
4. **Campaign, Brief Parser & Raw Media (`M5`)**, **Multi-Variant Auto-Editor (`M6`)**, **Viral Score + Upload Playbook (`M7`)**, **Iterative Prompt Re-Editor (`M8`)**, serta **Single & Bulk ZIP Export (`M9`)**.

## Struktur Monorepo (`npm Workspaces`)

```text
clip-content-rewards/
├── packages/shared/   # 6 Kontrak Zod & TypeScript types bersama (EDL v1.1, ViralScore, Playbook)
├── apps/api/          # Express.js (TS) + Prisma SQLite WAL + Local FFmpeg Engine
├── apps/web/          # Nuxt 3 / Vue 3 SPA Studio + 3-Theme Engine
└── storage/           # Media & SQLite DB lokal (git-ignored)
```

## Cara Menjalankan Secara Lokal

```bash
# 1. Install seluruh workspace
npm install

# 2. Build shared contracts, siapkan SQLite lokal & seed preset bawaan
npm run build -w @clip/shared
npm run db:generate
npm run db:push
npm run db:seed

# 3. Jalankan Backend API (port 4000) & Frontend Studio (port 3000) bersamaan
npm run dev
```

Akses studio di `http://localhost:3000` (atau melalui IP Wi-Fi LAN lokal dari HP untuk preview & unduh video).

## Dokumen Perencanaan & Governance

- [DESIGN.md](./DESIGN.md) : Arah visual 3 tema switchable & standar kontras WCAG AA.
- [MILESTONE.md](./MILESTONE.md) : Peta eksekusi bertahap (`M0` - `M10`) & audit 62 skill global.
- [PRD.md](./PRD.md) : Product Requirements Document (`v1.1`).
- [AGENTS.md](./AGENTS.md) & [.agents/README.md](./.agents/README.md) : Tata kelola, aturan teknis, dokumentasi menu Standar V2, dan session state tracker.
