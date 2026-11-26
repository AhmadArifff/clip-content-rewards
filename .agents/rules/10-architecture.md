# 10 - System Architecture (Nuxt 3 + Express TS + Local Worker)

Dokumen fondasi arsitektur sistem `clip-content-rewards` untuk pengembangan lokal berkinerja tinggi.

## 1. Topologi Monorepo Ringan

```text
clip-content-rewards/
├── client/                  # Nuxt 3 / Vue 3 SPA Studio (TypeScript, Pinia, Vue Query, Tailwind, Shadcn Vue)
│   ├── components/          # Komponen reusable (player, safe-zone, playbook, re-editor, modals)
│   ├── composables/         # Hooks SSE progress, chunked uploader, clipboard playbook
│   ├── pages/               # Route halaman (/login, /campaigns, /campaigns/[id]/studio, /clips/[id], /settings/api-keys)
│   ├── services/            # Typed API client (relative /api/... via Nuxt proxy)
│   └── stores/              # Pinia client state (auth, active studio session, player overlay)
├── server/                  # Express.js + TypeScript Backend & Local Render Worker
│   ├── config/              # Env loader (Zod validated), storage paths, FFmpeg binary resolver
│   ├── controllers/         # HTTP request/response mapping ONLY (zero business logic)
│   ├── middlewares/         # Auth guard, RBAC, error handler, upload validator, rate limiter
│   ├── repositories/        # Prisma DB access layer (isolated queries)
│   ├── routes/              # Modular routes per resource (/auth, /api-keys, /campaigns, /media, /batches, /clips, /exports, /presets)
│   ├── schemas/             # Zod contracts (BriefRulebook, EDL, ViralScore, Playbook, EdlPatch)
│   ├── services/            # Core business logic mengembalikan ServiceResult<T>
│   │   ├── ai/              # Provider Adapters (Gemini, OpenAI, Claude, OpenRouter, Groq Whisper)
│   │   ├── media/           # FFprobe, Audio Extractor, FFmpeg EDL Renderer, ASS Caption Builder
│   │   └── export/          # Single & Streaming ZIP Archiver
│   └── workers/             # Persistent SQLite Job Queue runner + SSE Event Bus
├── prisma/                  # schema.prisma & migrations (SQLite WAL default, PostgreSQL compatible)
└── storage/                 # Git-ignored local media (uploads, renders, transcripts, temp)
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
