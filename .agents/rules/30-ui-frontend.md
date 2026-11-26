# 30 - Frontend Studio UI/UX, Safe-Zone & Anti-Slop Standards

## 1. Visual-First Engineering Gate
- Dilarang melakukan *blind coding* antarmuka. Setiap halaman utama wajib melalui persetujuan **ASCII Wireframe** & **Design DNA** pada Milestone 3 (M3) sebelum diimplementasikan.
- Gunakan komponen accessible berbasis **Shadcn Vue** + **Tailwind CSS** dengan token warna studio yang konsisten (kontras WCAG 2.1 AA >= 4.5:1 untuk teks dan >= 3:1 untuk komponen interaktif).

## 2. Prinsip Desain Studio Video
- **Hierarki Konten Utama:** Video preview, Viral Score, Upload Playbook, dan Prompt Re-Editor adalah fokus utama. Hindari bento grid dekoratif, efek glow berlebihan, atau kartu statistik hiasan tanpa aksi.
- **Toggle Safe-Zone Overlay Wajib:** Pada Video Player di *Clip Inspector*, wajib tersedia sakelar overlay transparan untuk simulasi antarmuka **TikTok (9:16)** dan **YouTube Shorts (9:16)** agar kreator dapat melihat langsung apakah teks subtitle atau wajah tertutup tombol kanan/caption bawah.
- **State Lengkap:** Setiap layar wajib menangani 5 kondisi secara bersih: `loading` (skeleton/progress SSE), `empty` (panduan langkah awal jelas), `error` (pesan human-friendly + tombol retry), `partial_success` (batch sebagian berhasil), dan `success`.

## 3. Komponen Portabel & Reusable (DRY)
- Komponen yang dipakai lintas halaman (seperti `SafeZoneVideoPlayer.vue`, `ViralScoreBadge.vue`, `CopyPlaybookButton.vue`, `ConfirmActionModal.vue`) wajib diletakkan di `client/components/shared/` tanpa duplikasi.

## 4. Bahasa UI Human-Friendly (Anti-Jargon)
- Gunakan istilah kreator yang jelas: *"Aturan Brief"*, *"Suara Asli Video"*, *"Kecilkan untuk Musik TikTok"*, *"Skor Potensi Viral"*, *"Panduan Upload"*.
- Dilarang menampilkan istilah internal seperti `EDL JSON error`, `SQLite locked`, `Zod validation failed at path`, atau `exit code 1` mentah ke pengguna akhir; tampilkan pesan solusi yang dapat ditindaklanjuti dengan detail teknis tersembunyi di panel *Detail Teknis* opsional.

## 5. Mobile-Friendly Preview & Download (LAN Access)
- Halaman *Batch Results* dan *Clip Inspector* wajib responsif di layar ponsel (375px-430px, zero horizontal overflow, tap target >= 44px) agar pengguna dapat membuka studio lokal dari HP via Wi-Fi yang sama untuk preview dan langsung mengunduh `.mp4` ke galeri HP.
