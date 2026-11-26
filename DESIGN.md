# DESIGN.md - Multi-Theme Studio Direction (`clip-content-rewards`)

> **Dokumen Arah Visual Resmi (R-37 `antislop` Gate)**
> Status: **Approved by Product Owner (3 Switchable Distinct Themes)**
> Mode `antislop`: **Mode 1 - DURING** (Diterapkan langsung saat membangun seluruh antarmuka sejak `M4`)

---

## 1. Filosofi Multi-Theme Studio

`clip-content-rewards` menyediakan **3 Tema Studio Penuh** yang dapat diganti instan melalui **Theme Switcher** tanpa reload halaman. Pergantian tema **tidak sekadar mengganti warna gelap/terang**, melainkan mengubah 5 dimensi sekaligus:
1. **Palet Warna & Permukaan** (seluruh kombinasi teks/aksi mematuhi rasio kontras WCAG 2.1 AA >= 4.5:1 / >= 3:1).
2. **Slicing Shell & Tata Letak** (posisi navigasi, kepadatan panel, ritme grid, dan batas kontainer).
3. **Tipografi & Hierarki** (padanan huruf display, body, dan angka telemetry).
4. **Geometri & Interaksi Fisik** (border, shadow, radius sudut, dan respons klik/hover).
5. **Persona Konten / Microcopy Studio** (bahasa header, sambutan, dan kartu status yang selaras dengan karakter tema).

---

## 2. Spesifikasi 3 Tema Studio

### Tema 1: `editing-room` - Dark Editing Room (Pro NLE Broadcast Console)
- **Identitas & Mood:** Ruang pasca-produksi profesional ala DaVinci Resolve / Broadcast Control Desk. Fokus mutlak pada preview video 9:16 dan angka skor/timestamp.
- **Liveliness Dials:** `ENERGY: 2` | `RHYTHM: 2` | `MOTION: 1` (snappy `120ms ease-out`, bebas animasi mengambang lambat).
- **Slicing Layout:**
  - **Left Compact Tool Rail (`68px` - `220px`)** + **Top Telemetry Bar** (menampilkan indikator status FFmpeg, DB WAL, dan API Key secara teknis tabular).
  - Permukaan panel datar bertingkat tipis dengan hairline border `1px` dan sudut tajam presisi (`radius: 4px - 6px`).
- **Palet Token (WCAG AA Verified):**
  - Canvas: `#0D0F12` | Surface: `#151921` | Elevated: `#1C222D` | Border: `#2A3241`
  - Text Primary: `#F1F5F9` (kontras >15:1) | Text Muted: `#94A3B8` (>6.2:1)
  - Accent Primary: `#10B981` (Studio Emerald, teks tombol `#052E1E` >7.8:1)
  - Semantic: Warn `#F59E0B`, Danger `#F43F5E`, Info `#38BDF8`
- **Tipografi:** `Inter` / `Plus Jakarta Sans` + `JetBrains Mono` (tabular-nums untuk skor, durasi, versi).
- **Nuansa Konten / Voice:** Singkat, tegas, teknis-humanis (*"Konsol Produksi"*, *"Brankas Kunci API"*, *"Telemetri Mesin Lokal"*).

---

### Tema 2: `daylight-editorial` - Crisp Daylight Editorial (Creator Magazine & Desk)
- **Identitas & Mood:** Meja redaksi kreatif yang lapang, tenang, dan terang seperti publikasi desain modern. Ideal saat membaca brief PDF panjang, menelaah kritik, dan menyusun Upload Playbook.
- **Liveliness Dials:** `ENERGY: 1` | `RHYTHM: 3` (komposisi asimetris editorial dengan ruang napas luas) | `MOTION: 2` (transisi tenang `200ms cubic-bezier(0.22, 1, 0.36, 1)`).
- **Slicing Layout:**
  - **Centered Clean Top Navigation Bar** dengan garis pemisah horizontal tipis (`1px solid #DDD6C8`) tanpa sidebar berat.
  - Ruang margin lebar (`max-w-6xl`), pembatas antar bagian berupa garis editorial (*editorial rules*) bukan kotak bertumpuk, dan area preview video tetap dikelilingi bingkai gelap netral agar warna video akurat.
- **Palet Token (WCAG AA Verified):**
  - Canvas: `#F6F3EC` (Warm Paper) | Surface: `#FFFFFF` | Elevated: `#EFEAE0` | Border: `#D6CEC0`
  - Text Primary: `#18181B` (>15:1) | Text Muted: `#57534E` (>6.8:1)
  - Accent Primary: `#C2410C` (Editorial Vermilion, teks `#FFFFFF` >5.1:1)
  - Semantic: Success `#15803D`, Warn `#B45309`, Danger `#BE123C`
- **Tipografi:** Display Serif (`Georgia` / `Newsreader`) untuk judul halaman + Sans bersih (`Plus Jakarta Sans`) untuk UI & form.
- **Nuansa Konten / Voice:** Kuratorial, hangat, tenang (*"Meja Redaksi Campaign"*, *"Koneksi Asisten AI"*, *"Ringkasan Kesiapan Studio"*).

---

### Tema 3: `creator-tactile` - Tactile Creator Workbench (Neo-Tactile Studio Desk)
- **Identitas & Mood:** Meja kerja kreator energik dengan umpan balik fisik nyata. Kartu berbingkai tegas, tombol terasa benar-benar "ditekan" ke bawah saat diklik, dan chip preset lapangan sangat cepat dipindai.
- **Liveliness Dials:** `ENERGY: 3` | `RHYTHM: 2` | `MOTION: 2` (spring/tactile press `translate(2px, 2px)` saat active, `140ms`).
- **Slicing Layout:**
  - **Floating Top Studio Dock** (pill-bar mengambang tegas dengan border `2px solid #0F172A` dan offset shadow padat `3px 3px 0 #0F172A`) + grid kartu modular berbingkai tegas (`radius: 12px`).
  - Setiap tombol aksi dan chip preset memiliki efek fisik *press-down* tanpa efek glow atau blur.
- **Palet Token (WCAG AA Verified):**
  - Canvas: `#EEF2F6` (Cool Studio Desk) | Surface: `#FFFFFF` | Elevated: `#E2E8F0` | Border: `#0F172A` (`2px`)
  - Text Primary: `#0F172A` (>14:1) | Text Muted: `#334155` (>9.2:1)
  - Accent Primary: `#1D4ED8` (Workbench Cobalt, teks `#FFFFFF` >6.7:1) + Secondary `#047857` (Mint Green)
  - Semantic: Warn `#B45309` (bg `#FEF3C7`), Danger `#B91C1C` (bg `#FEE2E2`)
- **Tipografi:** `Space Grotesk` / `Plus Jakarta Sans` Bold + `JetBrains Mono` untuk badge & kode preset.
- **Nuansa Konten / Voice:** Energik, langsung ke aksi, ramah kreator (*"Workbench Konten"*, *"Sambungkan Otak AI"*, *"Cek Mesin Render"*).

---

## 3. Aturan Anti-Slop Mutlak untuk Ketiga Tema
- Dilarang menggunakan gradien biru-ungu generik, neon glow menyeluruh, atau glassmorphism berlebihan di seluruh kartu.
- Setiap elemen visual wajib memenuhi Purpose-Gate (hierarki baca, status sistem, atau aksi kreator).
- Semua tombol interaktif di mobile (`390px`) wajib memiliki tinggi minimal `44px` dan zero horizontal overflow.
- Bebas karakter em-dash pada seluruh copywriting UI.
