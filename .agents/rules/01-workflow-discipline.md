# 01 - Workflow Discipline & Clean Code Standards

## 1. Siklus Kerja OODA + Separation of Duty
Setiap tugas mengikuti siklus **Observe -> Orient -> Decide -> Act**:
1. **Observe:** Baca [active-session.json](../02-session-state/active-session.json) dan dokumentasi modul terkait di `.agents/menu-docs/` sebelum mencari kode (*Docs-First Retrieval*).
2. **Orient:** Cek keselarasan dengan `PRD.md`, `MILESTONE.md`, dan `established_constraints`. Deteksi potensi *scope creep* atau celah lapangan (*field edge cases*).
3. **Decide:** Sajikan **Review Task (8 Pilar)** termasuk Analogi Nyata, Impact Before vs After, dan Matriks Target Perubahan. Tunggu persetujuan pengguna sebelum menulis kode.
4. **Act & Verify:** Implementasi modular, jalankan pengujian independen (QA + Tech Critic), lalu perbarui dokumentasi V2 dan session state.

## 2. Circuit Breaker Revisi
Jika sebuah sub-tugas gagal verifikasi atau mengalami revisi >= 3 kali berturut-turut, hentikan pengulangan otomatis, catat akar masalahnya, dan eskalasikan opsi solusi ke pengguna.

## 3. Standar Komentar Kode (Zero-Outflow Hygiene)
- Komentar kode wajib ringkas (1-2 baris), menjelaskan *alasan teknis/invariant* (bukan mengulang nama fungsi yang sudah jelas).
- Dilarang menyematkan rujukan tata kelola internal AI (seperti `Rule #4`, `.agents`, `Pilar 2`), banner ASCII berlebihan, atau nama proyek lain ke dalam komentar kode sumber (`.ts`, `.vue`, `.js`, `.css`).

## 4. Eliminasi Dead Code
Setiap kali ada revisi arsitektur atau refaktor komponen, seluruh file, fungsi, route, atau komponen UI lama yang tidak terpakai wajib langsung dihapus agar codebase tetap ramping.

## 5. Protokol Self-Enrichment Dokumentasi
Setiap penambahan endpoint, kolom Prisma, komponen UI, atau perbaikan bug wajib langsung diperkaya ke berkas `.agents/menu-docs/` terkait dan `.agents/knowledge/bug-cases.md` sebelum task dinyatakan selesai.
