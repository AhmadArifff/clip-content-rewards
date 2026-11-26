# SOP Pembuatan Modul Baru (`new-module`)

Ikuti urutan ini setiap kali membangun modul baru dari `MILESTONE.md`:

1. **Review Gate:** Jalankan [task-review-protocol.md](./task-review-protocol.md) dan dapatkan konfirmasi pengguna.
2. **Skema & Kontrak Data:**
   - Perbarui `prisma/schema.prisma` (jika ada tabel/kolom baru) dan jalankan migrasi lokal terstruktur.
   - Definisikan skema validasi **Zod** di `server/schemas/`.
3. **Backend Express Modular:**
   - Buat/perbarui `Repository` (akses Prisma) -> `Service` (mengembalikan `ServiceResult<T>`) -> `Controller` (HTTP mapping) -> `Route` modular di `server/routes/`.
   - Lindungi endpoint dengan middleware Auth + Zod validator.
4. **Frontend Nuxt 3 / Vue 3:**
   - Tambahkan typed API client di `client/services/` (relative path `/api/...`).
   - Bangun state Pinia / composable Vue Query dan komponen Shadcn Vue yang menangani 5 state (`loading`, `empty`, `error`, `partial_success`, `success`).
5. **Verifikasi QA:** Jalankan unit/integration test dan [post-dev-qa.md](./post-dev-qa.md).
6. **Dokumentasi Standar V2 & Tracking:**
   - Buat berkas dokumentasi modul di `.agents/menu-docs/<kategori>/<slug>.md` memakai [TEMPLATE-MENU-DOC.md](../menu-docs/TEMPLATE-MENU-DOC.md).
   - Daftarkan modul di `.agents/menu-docs/README.md`, perbarui `.agents/knowledge/cross-menu-disambiguation.md` bila ada komponen lintas-halaman, dan perbarui `.agents/02-session-state/active-session.json`.
   - Uji `node .agents/scripts/sync-docs.js --dry-run` (atau jalankan sync penuh jika diminta pengguna).
