# 10 - System Architecture (Nuxt 3 + Express TS + Local Worker)

Dokumen fondasi arsitektur sistem `clip-content-rewards` untuk pengembangan lokal berkinerja tinggi.

## 1. Topologi Monorepo (`npm Workspaces`)

```text
clip-content-rewards/
├── package.json             # Root npm Workspaces (`apps/*`, `packages/*`) - 1 perintah `npm run dev`
├── DESIGN.md                # Arah visual resmi 3 Tema Switchable (editing-room, daylight-editorial, creator-tactile)
├── packages/
│   └── shared/              # @clip/shared: 6 Kontrak Zod, TypeScript Types, Theme IDs & API Contracts BERSAMA
├── apps/
│   ├── web/                 # Nuxt 3 / Vue 3 SPA Studio (TypeScript, Pinia, Vue Query, Tailwind, 3-Theme Engine)
│   │   ├── assets/css/      # Token CSS & slicing 3 tema (themes.css)
│   │   ├── components/      # Shell & komponen reusable lintas tema (ThemeSwitcher, DoctorCard, Modals)
│   │   ├── composables/     # useApi, useThemeCopy, SSE progress, chunked uploader
│   │   ├── pages/           # /login, /setup, /campaigns, /campaigns/[id]/studio, /clips/[id], /settings/*
│   │   └── stores/          # Pinia stores (auth, theme, studio)
│   └── api/                 # Express.js + TypeScript Backend, Prisma ORM & Local FFmpeg Worker
│       ├── prisma/          # schema.prisma (11 model SQLite WAL, Postgres-portable) & seed.ts
│       ├── assets/fonts/    # Bundled local fonts untuk FFmpeg ASS subtitle Windows
│       └── src/
│           ├── config/      # Env loader (Zod), storage path guard, Prisma client (WAL)
│           ├── controllers/ # HTTP request/response mapping ONLY
│           ├── middlewares/ # Auth guard, RBAC, Zod validator, error handler
│           ├── repositories/# Prisma DB access layer
│           ├── routes/      # Modular routes per resource (/auth, /system, /api-keys, /presets, /target-profiles, ...)
│           ├── services/    # Core business logic mengembalikan ServiceResult<T> + AI Adapters + FFmpeg Engine
│           ├── utils/       # AES-256-GCM crypto, key masking, log sanitizer
│           └── workers/     # Persistent SQLite Job Queue + startup zombie-job recovery + SSE Event Bus
└── storage/                 # Git-ignored local media (uploads, renders, transcripts, exports, temp, SQLite .db)
```

## 2. Kontrak Layer & `ServiceResult<T>` Pattern
- **Route -> Middleware (Auth + Zod) -> Controller -> Service -> Repository / Adapter**.
- Controller dilarang memanggil Prisma, AI SDK, atau `spawn('ffmpeg')` secara langsung.
- Seluruh metode Service mengembalikan objek terstruktur:
  ```ts
  type ServiceResult<T> =
    | { ok: true; data: T; meta?: Record<string, unknown> }
    | { ok: false; code: string; message: string; statusCode: number; details?: unknown };
  ```
- Seluruh response JSON API wajib murni data (tanpa raw HTML), konsisten format `{ success, data, error, meta }`.

## 3. Strategi Komunikasi Real-Time (SSE)
- Proses asinkron (transkripsi video panjang, batch render multi-varian, regenerate clip) berjalan pada **Local Persistent Job Queue** di dalam proses Express (atau child worker terpisah).
- Frontend berlangganan pembaruan live via **Server-Sent Events (`GET /api/jobs/:batchId/stream`)** dengan fallback polling `TanStack Vue Query` apabila koneksi terputus sementara.

## 4. Relative-Path API Standard
- Frontend Nuxt 3 memanggil backend via proxy relative path (`/api/...`) sehingga tidak ada hardcoded `http://localhost:PORT` di komponen Vue dan tetap mulus ketika diakses dari HP melalui IP LAN lokal.
