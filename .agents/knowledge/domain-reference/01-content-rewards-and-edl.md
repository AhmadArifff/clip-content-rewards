# Domain Reference 01: Content Rewards, Viral Score Rubric & EDL Contract

## 1. Realitas Lapangan Campaign Content Rewards
Pada platform Content Rewards (seperti Whop Content Rewards, TikTok Creator Rewards, dan program clipping brand):
- **Pemilik Campaign** mengunggah dokumen brief (`.pdf`/`.docx`/`.doc`) berisi syarat payout: platform wajib, durasi min-max, mention/tag wajib, watermark/CTA wajib, dan larangan klaim.
- **Kegagalan Payout Paling Sering:** Video melanggar durasi brief, lupa menyertakan hashtag/mention wajib, suara asli bertabrakan dengan musik trending saat upload, atau teks subtitle tertutup tombol UI TikTok/Shorts.

## 2. Rubrik Viral Score 6 Dimensi (Total 0-100)

| Dimensi | Bobot | Apa yang Dievaluasi |
| :--- | :---: | :--- |
| **1. Hook Strength (0-3 Detik)** | `25%` | Apakah 3 detik pertama langsung memutus pola (*pattern interrupt* / *curiosity gap*) tanpa jeda napas/intro lambat? |
| **2. Retention & Pacing Flow** | `20%` | Kepadatan cut, eliminasi *dead air*, eskalasi cerita, dan potensi loop/rewatch di akhir video. |
| **3. Brief Compliance** | `20%` | Pemenuhan 100% *Do's* (durasi, CTA, tag, mention) dan 0 pelanggaran *Don'ts*. Pelanggaran berat menurunkan skor & memunculkan badge `FAIL`. |
| **4. Target Audience Fit** | `15%` | Kesesuaian gaya bahasa, referensi budaya Country, rentang Usia, Persona/Niche, serta level Kontroversi yang dipilih user. |
| **5. Engagement & Shareability** | `10%` | Pemicu komentar, debat sehat, *save*, atau *share* (selaras Primary KPI Goal). |
| **6. Audio & Safe-Zone Health** | `10%` | Kebersihan loudness (`-14 LUFS`), kesesuaian mode audio dengan rencana sound platform, dan 0 tabrakan subtitle dengan area UI TikTok/YT Shorts. |

## 3. Koordinat Safe-Zone Referensi (Frame Vertikal `1080x1920`)

- **TikTok 9:16 Safe-Zone:**
  - Zona terlarang Atas: `0 - 280 px` (tab Following/For You & Search)
  - Zona terlarang Kanan: `880 - 1080 px` (profil, like, comment, bookmark, share, disc audio)
  - Zona terlarang Bawah: `1420 - 1920 px` (username, caption, ticker musik, progress bar)
  - **Area Aman Subtitle & Hook:** `x: 70..860 px`, Hook Banner `y: 300..460 px`, Subtitle utama `y: 1180..1390 px`.
- **YouTube Shorts 9:16 Safe-Zone:**
  - Zona terlarang Atas: `0 - 220 px`
  - Zona terlarang Kanan: `890 - 1080 px`
  - Zona terlarang Bawah: `1480 - 1920 px`
  - **Area Aman Subtitle & Hook:** `x: 70..870 px`, Hook Banner `y: 260..420 px`, Subtitle utama `y: 1220..1440 px`.

## 4. Sinkronisasi Mode Audio <-> Upload Playbook
Setiap perubahan mode audio pada `EDL JSON` (baik saat generate awal di M6 maupun saat regenerate prompt di M8) wajib memperbarui bagian **Strategi Backsound/Musik** pada Upload Playbook secara otomatis:
- `muteOriginal: true` (`0%`) -> Playbook menginstruksikan: *"Suara asli video sudah di-mute penuh. Saat upload di TikTok/YouTube, pilih Trending Sound rekomendasi dan biarkan volume Added Sound 100%."*
- `originalVolume: 0.10 - 0.35` -> Playbook menginstruksikan: *"Suara asli sudah dikecilkan ke [X]%. Saat upload, tambahkan Trending Sound di aplikasi dan atur keseimbangan Original vs Added Sound."*
- `originalVolume: 1.0` (`normalizeLufs: -14`) -> Playbook menginstruksikan: *"Suara vokal asli dinormalisasi ke -14 LUFS. Jika menambah musik latar di aplikasi, jaga volume Added Sound di kisaran 5%-12% agar vokal tetap jernih."*
