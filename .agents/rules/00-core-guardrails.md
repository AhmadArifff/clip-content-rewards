# 00 - Core Guardrails (`clip-content-rewards`)

Aturan keselamatan dasar yang berlaku di seluruh tahap pengembangan, debugging, dan pengujian.

## 1. Keamanan Kredensial & BYOK API Keys
- Dilarang keras menyimpan API Key provider AI (Gemini, OpenAI, Claude, OpenRouter, Groq, Deepgram) dalam bentuk plaintext di database, kode sumber, file JSON sementara, atau log terminal.
- Seluruh kunci rahasia (`APP_ENCRYPTION_KEY`, `JWT_SECRET`) wajib dibaca dari `.env` yang terdaftar di `.gitignore`.
- Setiap error dari AI SDK harus disanitasi sebelum dikirim ke frontend atau dicatat ke log agar header `Authorization` / `x-api-key` tidak pernah bocor.

## 2. Keamanan Media & Eksekusi FFmpeg Lokal
- Eksekusi binary eksternal (`ffmpeg`, `ffprobe`) **WAJIB** menggunakan `spawn(binaryPath, argsArray, { shell: false })`. Dilarang keras membangun string perintah shell menggunakan `exec()`.
- Seluruh path input/output media wajib dinormalisasi dengan `path.resolve()` dan diverifikasi berada di dalam direktori `storage/` proyek (anti *path traversal*).
- Validasi file upload (`.pdf`, `.docx`, `.doc`, `.mp4`, `.mov`, `.mkv`, `.webm`) wajib memeriksa ekstensi whitelist, ukuran maksimum, dan magic bytes/FFprobe.

## 3. Proteksi Sumber Daya PC Lokal
- Mesin berjalan di laptop/PC lokal user. Worker render FFmpeg wajib memiliki batas concurrency ketat (default `1`, maksimal `2`) dan timeout per job agar tidak menghabiskan seluruh CPU/RAM.
- File media besar wajib diunggah secara *chunked* dan diunduh secara *streaming* (termasuk Bulk ZIP via `archiver` stream) untuk mencegah Out-of-Memory (OOM).

## 4. Integritas Basis Data & Kepatuhan Skema
- Setiap perubahan skema database wajib melalui `prisma/schema.prisma` dan migrasi terstruktur yang dicatat di dokumentasi modul.
- Nilai status/enum/kategori yang disimpan ke database wajib berbahasa Inggris (`queued`, `processing`, `completed`, `failed`, `approved`), sedangkan tampilan antarmuka pengguna wajib berbahasa Indonesia yang ramah dan bebas jargon teknis.

## 5. Batas Aksi Destruktif & Git
- Dilarang menghapus folder `storage/uploads` milik user atau mereset database lokal secara otomatis tanpa konfirmasi eksplisit.
- Operasi `git push` ke remote GitHub hanya dilakukan atas instruksi atau persetujuan pengguna.
