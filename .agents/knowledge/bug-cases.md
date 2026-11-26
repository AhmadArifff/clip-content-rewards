# Daftar Kasus Bug & Solusi Terverifikasi (`bug-cases.md`)

Log historis kendala teknis, akar masalah, dan solusi terverifikasi untuk `clip-content-rewards`.

> **Status Saat Ini:** 1 kasus teknis lokal terverifikasi & diselesaikan sejak Milestone 4 (`M4`).

---

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
