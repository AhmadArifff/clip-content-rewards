# 40 - Security, Local Auth & BYOK Vault Standards

## 1. Autentikasi Lokal & Otorisasi (Mandatory Auth Policy)
- Seluruh halaman aplikasi (kecuali `/login` & `/setup`) serta seluruh endpoint `/api/*` (kecuali `/api/auth/login`, `/api/auth/setup`, `/api/health`) wajib dilindungi middleware autentikasi.
- Password disimpan menggunakan hash kuat (`bcryptjs` cost >= 12 atau `argon2id`), token sesi dikirim via cookie `HttpOnly`, `SameSite=Lax`, dan memiliki mekanisme logout/revokasi bersih.
- Pada akses pertama kali (jika belum ada akun admin lokal), sistem menampilkan layar `/setup` satu kali untuk membuat akun pemilik studio lokal.

## 2. Brankas BYOK API Key (AES-256-GCM)
- Setiap API Key eksternal (Gemini, OpenAI, Claude, OpenRouter, Groq, Deepgram, ElevenLabs) wajib dienkripsi sebelum masuk ke tabel `api_keys`:
  - Algoritma: `aes-256-gcm` dengan `iv` acak 12-byte unik per record + `auth_tag` 16-byte.
  - Kunci master: `APP_ENCRYPTION_KEY` (32-byte hex/base64 dari `.env`).
- API `GET /api/api-keys` hanya mengembalikan `masked_preview` (misal `AIza...7fK9`), **dilarang keras** mengembalikan ciphertext atau plaintext.
- Dekripsi key hanya terjadi di dalam RAM tepat sebelum memanggil AI Adapter, dan objek error dari provider wajib disaring dari header/query parameter yang mengandung key sebelum dicatat ke log.

## 3. Validasi Upload Brief & Media
- **Dokumen Brief:** Whitelist ekstensi `.pdf`, `.docx`, `.doc`, `.txt`, batas ukuran default 20 MB, sanitasi nama file dengan UUID (jangan pakai nama file mentah dari user sebagai path disk).
- **Video Mentah:** Whitelist `.mp4`, `.mov`, `.mkv`, `.webm`, batas ukuran default 2 GB via chunked upload, wajib terverifikasi valid oleh `ffprobe` sebelum ditandai siap pakai.
- **Path Traversal Guard:** Setiap operasi baca/tulis/hapus file wajib melewati fungsi helper `resolveSafeStoragePath(relativePath)` yang menolak segala path di luar root `storage/`.
