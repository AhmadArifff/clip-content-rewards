# SOP Pengujian Browser Playwright Hemat Token (`playwright-testing`)

> [!IMPORTANT]
> Pengujian browser Playwright hanya dijalankan atas permintaan atau persetujuan pengguna setelah *Planning Flow Testing* disepakati.

## 1. Strategi Hemat Token (1-Shot Headless Script vs Klik Manual MCP)
- **Wajib gunakan Skrip Headless Deterministik (`playwright-core` + Chrome/Edge lokal)** dalam 1 perintah `npm run test:e2e` yang langsung menyalakan server build (`apps/api/dist` + `apps/web/.output`), menjalankan seluruh assertion visual & fungsional, menangkap screenshot kunci, lalu melakukan cleanup database otomatis.
- Hindari interaksi klik-per-klik via MCP berulang yang mengirim ulang seluruh DOM snapshot puluhan kali. Dengan pola 1-shot script, pengujian penuh hanya memakan 1 eksekusi terminal + 1 batch inspeksi screenshot.

## 2. Planning Flow Testing M4 (`tests/e2e/m4-studio.e2e.mjs`)

| Flow ID | Fokus Pengujian | Langkah & Assertion Wajib | Bukti Output |
| :--- | :--- | :--- | :--- |
| **Flow 1** | **Auth Guard & First Setup** | Buka `/settings/api-keys` tanpa sesi -> wajib redirect `/login` -> daftar akun pemilik lokal -> masuk `/settings/api-keys` & cek badge `Siap Produksi` | Redirect + Session cookie valid |
| **Flow 2** | **3 Tema Visual, Slicing & Konten** | Switch berurutan `Editing Room` -> `Editorial` -> `Tactile`: verifikasi `data-theme`, computed canvas color, perubahan slicing (`<aside>` rail vs masthead vs floating dock), perubahan heading copywriting, & 0 desktop overflow | 3 screenshot desktop (`theme-1..3.png`) |
| **Flow 3** | **BYOK Vault Security & Masking** | Simpan kunci uji `sk-e2e-...9999` -> pastikan DOM hanya menampilkan `sk-e...9999` & 0 kemunculan plaintext -> hapus kunci | Zero plaintext leak |
| **Flow 4** | **Master Presets Dinamis CRUD** | Buka `/settings/presets` -> cek preset lapangan (*Mute Audio Asli 0%*) -> tambah preset uji -> toggle Aktif/Nonaktif -> hapus | 37 preset + CRUD bersih |
| **Flow 5** | **Mobile Viewport `390x844`** | Resize ke `390x844` pada tema `Tactile` -> cek `scrollWidth <= clientWidth` & tinggi tombol primer >= `44px` | 1 screenshot mobile (`mobile-390-tactile.png`) |
| **Flow 6** | **Campaign Gate & Zero Errors** | Navigasi ke `/campaigns` -> cek 0 `console.error`, 0 HTTP `5xx`, dan cleanup akun QA sementara di SQLite | Exit code `0` & DB lokal bersih |

## 3. Cara Menjalankan Ulang Secara Lokal

```bash
npm run build
npm run test:e2e
```
Screenshot tersimpan di `scratch/e2e-m4/` (git-ignored).
