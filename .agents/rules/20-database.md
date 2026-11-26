# 20 - Database, Prisma Schema & Dynamic Master Data

## 1. Engine & Konfigurasi Lokal
- **Default Engine:** SQLite dengan mode **WAL (`PRAGMA journal_mode = WAL;`)** dan `busy_timeout = 5000` agar proses read API dan write worker render tidak saling mengunci (`SQLITE_BUSY`).
- **Portabilitas PostgreSQL:** Hindari fungsi SQLite mentah yang tidak standar di layer Repository agar jika suatu saat proyek dipindahkan ke VPS PostgreSQL, cukup mengganti datasource Prisma tanpa menulis ulang logika bisnis.

## 2. Standar Penamaan & Bahasa Data
- **Nama Tabel & Kolom:** `snake_case` Bahasa Inggris (`campaign_briefs`, `clip_versions`, `viral_score_total`).
- **Nilai Status / Enum / Kategori:** Wajib Bahasa Inggris baku (`draft`, `queued`, `processing`, `completed`, `failed`, `approved`, `archived`).
- **Tampilan UI:** Diterjemahkan ke label Bahasa Indonesia yang humanis pada lapisan frontend (`completed` -> `Siap Upload`, `processing` -> `Sedang Diproses`).
- **Timestamp:** Disimpan dalam ISO-8601 UTC di database, dan diformat dinamis sesuai zona waktu target Country pada Upload Playbook maupun zona waktu lokal browser user.

## 3. Zero Hardcoded Master Data Policy
- Data referensi seperti daftar **Country & Timezone**, **Rentang Usia**, **Gaya Editing**, **Tipe Hook 3 Detik**, **Level Kontroversi**, dan **Quick-Action Prompt Presets Lapangan** wajib disimpan pada tabel `master_presets` dan di-seed awal melalui `prisma/seed.ts`.
- Tersedia antarmuka CRUD ringan di menu Pengaturan agar user bisa menambah negara target baru atau menyimpan prompt lapangan favoritnya sendiri tanpa mengubah kode.

## 4. Manajemen Versi & Relasi Integritas
- Setiap `Clip` memiliki relasi `1-to-N` ke `ClipVersion` (`v1`, `v2`, `v3`) serta pointer `active_version_id`.
- Penghapusan campaign atau versi usang wajib membersihkan berkas fisik terkait di `storage/` melalui service transaksi terkoordinasi agar tidak meninggalkan file yatim (*orphan media files*).
