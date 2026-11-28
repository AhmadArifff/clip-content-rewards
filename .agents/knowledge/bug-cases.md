# Daftar Kasus Bug & Solusi Terverifikasi (`bug-cases.md`)

Log historis kendala teknis, akar masalah, dan solusi terverifikasi untuk `clip-content-rewards`.

> **Status Saat Ini:** 8 kasus teknis lokal terverifikasi & diselesaikan sejak `M4`-`M20`.

---

### Kasus #08: Subtitle Muncul Prematur Sejak 0:00 (`. I'M NOT`), Drift `speed`/`xfade`, & Double Subtitle di Video Bawaan
- **Tanggal & Milestone:** `2026-11-28` (`M20`)
- **Konteks & Gejala (Symptom):** Pada hasil Cinema Remix 3 video (`M19`), cue pertama `". I'M NOT"` muncul sejak `0:00` padahal dialog baru diucapkan di detik `0:06`, cue akhir terbalik (`0:36.32 -> 0:35.85`), dan subtitle kuning menimpa subtitle putih bawaan dari Video 1.
- **Akar Masalah (Root Cause):** (1) Whisper menghasilkan token tanda baca tunggal `"."` di awal video musik (Video 2); (2) `buildTimedCuesFromEdl()` menggabungkan 3 kata lintas batas segmen dan jeda hening panjang sehingga menarik `"I'M NOT"` mundur ke `0:00.00`; (3) cursor subtitle tidak membagi durasi dengan `seg.speed` dan tidak mengurangi overlap transisi `xfade`; (4) belum ada deteksi subtitle tertanam per video sumber.
- **Solusi yang Diterapkan (Fix Applied):** Menambahkan `isSpokenWordToken()`, `computeEdlSegmentTimeline()` (dibagi bersama antara `ass-subtitle.builder.ts` & `edl-renderer.service.ts`), isolasi cue per `segIndex` & jeda `>= 0.65s`, deteksi 3 lapis subtitle bawaan (`ffprobe` soft stream + `embedded-caption-detector.service.ts` Gemini Vision cached + manual toggle Studio), serta `skipCaptionMediaIds` per segmen di renderer & `clip.service.ts`.
- **Pelajaran Pencegahan (Key Takeaway):** Seluruh kalkulasi waktu subtitle HARUS memakai fungsi timeline yang identik dengan filtergraph FFmpeg dan selalu memecah cue di batas transisi segmen maupun jeda hening.

### Kasus #07: Konflik Manifest `.nuxt` Saat Menjalankan `nuxt build` Bersamaan dengan `nuxt dev` Aktif
- **Tanggal & Milestone:** `2026-11-28` (`M13`)
- **Konteks & Gejala (Symptom):** Pengujian E2E produksi (`apps/web/.output/server/index.mjs`) gagal memuat halaman `/login` dengan dua error 404 resource dan `#auth-email` tidak pernah muncul.
- **Akar Masalah (Root Cause):** Saat `npm run dev` (`nuxt dev`) masih berjalan di latar belakang, proses `nuxt build` berbagi direktori `.nuxt/` sehingga `nuxt dev` menimpa `.nuxt/dist/client/manifest.json` dengan entry mode dev (`@vite/client` & `entry.js`) sebelum Nitro membundel `client.precomputed.mjs`.
- **Solusi yang Diterapkan (Fix Applied):** Hentikan proses `npm run dev` terlebih dahulu sebelum menjalankan `npm run build -w @clip/web` (lalu nyalakan kembali `npm run dev` setelah build/E2E selesai).
- **Pelajaran Pencegahan (Key Takeaway):** Jangan pernah menjalankan `nuxt build` dan `nuxt dev` secara bersamaan pada direktori `apps/web` yang sama.

### Kasus #06: Layar Hitam Kosong Saat Pertama Membuka `http://localhost:3000` di Mode `nuxt dev`
- **Tanggal & Milestone:** `2026-11-28` (`M11`)
- **Konteks & Gejala (Symptom):** Saat pertama membuka `http://localhost:3000` pada `npm run dev` (mode SPA `ssr: false`), browser sempat menampilkan layar gelap kosong `#0d0f12` dengan judul tab sudah muncul sementara log Vite menampilkan `new dependencies optimized: lucide-vue-next -> reloading`.
- **Akar Masalah (Root Cause):** (1) `lucide-vue-next` belum didaftarkan di `vite.optimizeDeps.include` sehingga memicu optimasi & reload mendadak saat kunjungan pertama; (2) belum tersedia `spa-loading-template.html` sehingga masa inisialisasi SPA terlihat kosong; (3) `authStore.hydrate()` belum menangkap error jaringan bila user membuka browser sebelum API selesai boot.
- **Solusi yang Diterapkan (Fix Applied):** Menambahkan `vite.optimizeDeps.include: ['lucide-vue-next', 'zod']` di `apps/web/nuxt.config.ts`, menambahkan `apps/web/app/spa-loading-template.html`, dan menambahkan blok `catch` aman pada `hydrate()` di `apps/web/stores/auth.ts`.
- **Pelajaran Pencegahan (Key Takeaway):** Selalu pre-optimize pustaka ikon besar di Vite dev config dan sediakan SPA loading template pada proyek Nuxt `ssr: false`.

### Kasus #05: Breaking Change ESM pada `archiver@8.0.0` (`default` Export Dihapus, Diganti `ZipArchive`)
- **Tanggal & Milestone:** `2026-11-27` (`M9`)
- **Konteks & Gejala (Symptom):** Pengujian integrasi Bulk Streaming ZIP (`m9.export-zip-storage.test.ts`) menerima HTTP `500` dengan error `(0 , __vite_ssr_import_0__.default) is not a function`.
- **Akar Masalah (Root Cause):** Pada `archiver@8.0.0` (pure ESM), factory default `archiver('zip', opts)` sudah tidak diekspor; paket mengekspor class bernama `ZipArchive`, `TarArchive`, dan `JsonArchive`.
- **Solusi yang Diterapkan (Fix Applied):** Memperbarui `apps/api/src/types/archiver.d.ts` dan `apps/api/src/controllers/export.controller.ts` agar menggunakan `import { ZipArchive } from 'archiver'` dan `new ZipArchive({ zlib: { level: 6 } })`.
- **Pelajaran Pencegahan (Key Takeaway):** Selalu verifikasi `index.js` / `exports` paket ESM mayor (`v8+`) sebelum mengasumsikan pola default export versi lama.

### Kasus #04: Teks Hook Banner 9:16 Terpotong Kiri-Kanan Akibat ASS `WrapStyle: 2`
- **Tanggal & Milestone:** `2026-11-26` (`M6`)
- **Konteks & Gejala (Symptom):** Pada inspeksi visual screenshot video `1080x1920` hasil render M6, teks Hook Banner sepanjang >35 karakter terpotong di tepi kiri dan kanan frame.
- **Akar Masalah (Root Cause):** Header file `subtitles.ass` memakai `WrapStyle: 2` (menonaktifkan auto-wrap) dengan `Fontsize: 58` pada teks satu baris panjang.
- **Solusi yang Diterapkan (Fix Applied):** Mengubah `WrapStyle: 0`, menurunkan font `HookBanner` ke `44px`, dan menambahkan helper `wrapAssLines()` (`22` karakter/baris untuk 9:16) di `apps/api/src/services/media/ass-subtitle.builder.ts`.
- **Pelajaran Pencegahan (Key Takeaway):** Selalu lakukan inspeksi visual frame hasil render FFmpeg dan paksa explicit line wrapping untuk overlay teks vertikal 9:16.

### Kasus #03: Race Condition Test Paralel Vitest pada 1 File SQLite Lokal (`409 SETUP_ALREADY_COMPLETED`)
- **Tanggal & Milestone:** `2026-11-26` (`M5`)
- **Konteks & Gejala (Symptom):** Saat suite `m4.security-and-contracts.test.ts` dan `m5.campaign-brief-media.test.ts` dijalankan paralel oleh Vitest, `m4` membaca `needsSetup: true` tepat sebelum `m5` menyisipkan user QA sehingga `POST /api/auth/setup` mengembalikan `409`.
- **Akar Masalah (Root Cause):** Pengujian integrasi berbagi satu file SQLite lokal secara paralel antar file test.
- **Solusi yang Diterapkan (Fix Applied):** Menambahkan `apps/api/vitest.config.ts` dengan `fileParallelism: false` sehingga suite integrasi DB berjalan sekuensial dengan bersih.
- **Pelajaran Pencegahan (Key Takeaway):** Selalu jalankan file test integrasi SQLite secara sekuensial dan bersihkan seluruh data QA di `afterAll`.

### Kasus #02: Regex Mention Brief Parser Menangkap Titik Akhir Kalimat (`@branddemo.`)
- **Tanggal & Milestone:** `2026-11-26` (`M5`)
- **Konteks & Gejala (Symptom):** Saat teks brief diakhiri mention `"mention @branddemo."`, ekstraktor heuristik menyimpan `"@branddemo."` dengan tanda titik di ujung.
- **Akar Masalah (Root Cause):** Pola regex `/@[A-Za-z0-9_.]+/g` mengizinkan titik untuk username seperti `@brand.id`, namun ikut menyerap tanda baca akhir kalimat.
- **Solusi yang Diterapkan (Fix Applied):** Menambahkan `.map((m) => m.replace(/\.+$/, ''))` di `apps/api/src/services/brief-parser.service.ts`.
- **Pelajaran Pencegahan (Key Takeaway):** Selalu strip tanda baca trailing pada ekstraksi entitas sosial (`@mention`, `#hashtag`).

### Kasus #01: Prisma SQLite Menolak `PRAGMA busy_timeout = 5000` pada `$executeRawUnsafe`
- **Tanggal & Milestone:** `2026-11-26` (`M4`)
- **Konteks & Gejala (Symptom):** Saat `initDatabaseAndRecoverJobs()` dipanggil pada pengujian Vitest, Prisma melempar `PrismaClientKnownRequestError: Execute returned results, which is not allowed in SQLite`.
- **Akar Masalah (Root Cause):** Di SQLite, pernyataan `PRAGMA busy_timeout = 5000;` mengembalikan 1 baris hasil (`timeout`), sedangkan metode Prisma `$executeRawUnsafe()` hanya mengizinkan statement tanpa baris hasil.
- **Solusi yang Diterapkan (Fix Applied):** Mengganti pemanggilan `PRAGMA busy_timeout = 5000;` dan `PRAGMA foreign_keys = ON;` di `apps/api/src/config/prisma.ts` dari `$executeRawUnsafe()` menjadi `$queryRawUnsafe()`.
- **Pelajaran Pencegahan (Key Takeaway):** Selalu gunakan `$queryRawUnsafe()` untuk seluruh konfigurasi `PRAGMA` SQLite di Prisma.

---

## Template Entri Kasus

### Kasus #00 (Contoh Format)
- **Tanggal & Milestone:** `YYYY-MM-DD` (`M[X]`)
- **Konteks & Gejala (Symptom):** [Deskripsi gejala nyata]
- **Akar Masalah (Root Cause):** [Analisis penyebab teknis]
- **Solusi yang Diterapkan (Fix Applied):** [File terdampak & perbaikan]
- **Pelajaran Pencegahan (Key Takeaway):** [Test / guardrail yang ditambahkan]
