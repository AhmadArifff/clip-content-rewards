# SOP Protokol Review Task (8 Pilar Wajib Sebelum Koding)

Setiap kali menerima instruksi pembangunan fitur baru, perubahan logika inti, atau perbaikan bug signifikan, AI Agent **WAJIB** menyajikan laporan Review Task 8 Pilar ini dan menunggu konfirmasi `"Setuju"` sebelum menyentuh kode.

## 8 Pilar Review Task

1. **Docs-First Retrieval & Cek Konteks Sesi**
   - Baca `.agents/02-session-state/active-session.json` dan `.agents/menu-docs/` terkait. Pastikan task selaras dengan `PRD.md`, `MILESTONE.md`, dan `established_constraints`.
2. **Pemetaan Dampak Database & Storage Lokal**
   - Rinci tabel Prisma/SQLite yang terdampak operasi `INSERT`/`UPDATE`/`DELETE` beserta kolom kunci, relasi, dan folder `storage/` yang terlibat.
3. **Deklarasi Mesin Data & Integrasi (Data Engine Strategy)**
   - Jelaskan apakah fitur bekerja secara **Pure Local DB + FFmpeg**, **BYOK AI API Call**, atau **Hybrid (AI Plan -> Local FFmpeg Queue)**, beserta dampak pemakaian token & CPU lokal.
4. **Matriks Target Perubahan Eksplisit**
   - Sajikan tabel 4 kolom: `(1) Route/Halaman`, `(2) Path File Kode`, `(3) Bagian Spesifik yang Diubah`, `(4) Aksi (Tambah/Ubah/Hapus)`. Dilarang menyentuh file di luar matriks tanpa izin.
5. **Analogi Dunia Nyata & Impact Before vs After**
   - Jelaskan perubahan alur dengan analogi dunia nyata sederhana dan tabel komparasi *Before vs After* dalam bahasa human-friendly.
6. **Audit Skenario Celah Lapangan (*Field Edge-Case & Gap Audit*)**
   - Klasifikasikan potensi celah ke dalam `[CORE FLOW]` (wajib ditangani sekarang) vs `[OPSIONAL PELENGKAP]` (dicatat untuk iterasi berikutnya) beserta simulasi dampaknya.
7. **Visual-First Gate (Khusus Tugas UI)**
   - Lampirkan **ASCII Wireframe** atau perubahan tata letak komponen serta verifikasi dampaknya di desktop & mobile preview.
8. **STOP & Persetujuan -> Eksekusi -> Penutupan Dokumentasi V2**
   - Tunggu `"Setuju"`. Setelah selesai koding & QA, wajib perbarui `.agents/menu-docs/` (Standar V2 10 Bagian), `.agents/02-session-state/active-session.json`, dan `.agents/knowledge/bug-cases.md` (jika ada temuan bug).
