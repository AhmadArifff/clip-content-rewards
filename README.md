# Clip Content Rewards

Tools studio web lokal berbasis **BYOK AI API** dan **FFmpeg lokal** untuk memproduksi konten video siap upload di **TikTok** dan **YouTube (Shorts & Long)** mengikuti brief campaign **Content Rewards**.

## Fitur Utama (Target MVP v1.0)

1. **Campaign & Brief Parser (`.doc` / `.docx` / `.pdf`)**: Ekstraksi otomatis aturan wajib (*Do's*), larangan (*Don'ts*), CTA, hashtag wajib, dan batas durasi dari dokumen brief pemilik campaign.
2. **Multi-Variant AI Auto-Editor**: Generate banyak variasi editan video sekaligus dari raw footage berdasarkan parameter target (**Country/Region, Usia, Bahasa, Persona/Niche, Tingkat Kontroversi, Tipe Hook 3 Detik, Emosi, Gaya Editing, Mode Audio Awal**).
3. **Viral Score, Upload Impact & Actionable Critique**: Penilaian 6 dimensi (0-100), cek kepatuhan brief, prediksi dampak saat di-upload, serta kritik berbasis timestamp yang dapat langsung dijadikan prompt perbaikan.
4. **Upload Playbook Lengkap**: Rekomendasi strategi backsound/musik trending TikTok & YouTube, 3 opsi judul A/B, caption/deskripsi, kombinasi hashtag, jam tayang optimal lintas zona waktu target, *pinned comment*, dan cover frame.
5. **Iterative Prompt Re-Editor & Versioning**: Edit ulang **1 video spesifik saja** lewat prompt natural atau *Quick-Action Presets* lapangan (mute audio asli 0%, ducking 15-30% untuk sound TikTok/YT, potong hook/silence, geser safe-zone subtitle, edit typo subtitle inline) lengkap dengan versi `v1..vN` & rollback.
6. **Single & Bulk Streaming ZIP Export**: Unduh video satuan beserta playbook, atau unduh semua video final sekaligus dalam 1 file ZIP terstruktur.

## Tech Stack Terkunci

- **Frontend:** Nuxt 3 / Vue 3 (TypeScript, Pinia, TanStack Vue Query, Tailwind CSS, Shadcn Vue)
- **Backend & Queue:** Express.js (TypeScript), SQLite + Prisma ORM (zero-config lokal, siap migrasi PostgreSQL), Local Persistent Job Queue
- **Media Engine:** Local FFmpeg & FFprobe (gratis biaya render, berjalan di PC/Laptop lokal)
- **AI Integration:** BYOK Multi-Provider (Google Gemini, OpenAI, Anthropic Claude, OpenRouter, Groq Whisper) dengan enkripsi `AES-256-GCM`

## Dokumen Perencanaan & Tracking

- [MILESTONE.md](./MILESTONE.md) : Peta eksekusi bertahap (`M0` - `M10`), audit 62 skill global (25 Core Skills), dan backlog Fase V2.
- [PRD.md](./PRD.md) : Product Requirements Document lengkap (`v1.0`).

## Status Pengembangan

Saat ini berada pada penyelesaian **Milestone 1 (`M1`)**: `PRD.md` baseline dan backup version control ke GitHub telah disiapkan. Tahap berikutnya adalah **Milestone 2 (`M2`)**: inisialisasi tata kelola `.agents/` & sistem dokumentasi Standar V2.
