# Daftar Kasus Bug & Solusi Terverifikasi (`bug-cases.md`)

Log historis kendala teknis, akar masalah, dan solusi terverifikasi untuk `clip-content-rewards`.

> **Status Saat Ini:** 3 kasus teknis lokal terverifikasi & diselesaikan sejak `M4`-`M5`.

---

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
