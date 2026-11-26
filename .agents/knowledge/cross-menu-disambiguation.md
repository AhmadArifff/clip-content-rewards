# Kamus Disambiguasi Fitur Kembar & Batas Konteks Lintas-Menu

Dokumen ini mencegah salah sasaran koding dan kebingungan konteks antara fitur yang memiliki nama atau tampilan mirip di berbagai halaman `clip-content-rewards`.

| Keluarga Fitur | Halaman / Modul A | Halaman / Modul B | Perbedaan Kunci & Batas Konteks |
| :--- | :--- | :--- | :--- |
| **1. Pengaturan Audio (Mute / Ducking)** | **Batch Generator** (`/campaigns/:id/studio`) | **Prompt Re-Editor** (`/clips/:clipId`) | Di *Studio*, mode audio adalah **setting awal untuk seluruh batch** (`generation_batches.target_config_json`). Di *Re-Editor*, mute/ducking hanya mem-patch **1 clip spesifik** dan menghasilkan versi baru (`clip_versions` `v2`, `v3`) serta memperbarui Upload Playbook clip tersebut saja. |
| **2. Penyuntingan Teks** | **Editable Brief Rulebook** (`/campaigns/:id/studio`) | **Inline Subtitle Editor** (`/clips/:clipId`) | *Brief Rulebook* menyunting aturan campaign dari `.doc/.pdf` (`campaign_briefs.parsed_rulebook_json`). *Inline Subtitle Editor* hanya mengoreksi kata/typo transkrip subtitle pada 1 versi clip (`edl_json.captions.overrides`) tanpa mengubah brief campaign. |
| **3. Pemutar Video (Player)** | **Kartu Hasil Batch** (`/campaigns/:id/batches/:batchId`) | **Clip Inspector Player** (`/clips/:clipId`) | Kartu Batch hanya preview ringan cepat untuk membandingkan banyak variasi. *Clip Inspector* memiliki **Safe-Zone Overlay Toggle** (TikTok vs YT Shorts), switcher versi `v1..vN`, dan sinkronisasi timestamp kritik. |
| **4. Unduh / Export** | **Single Clip Export** (`/clips/:clipId`) | **Bulk ZIP Streaming Export** (`/campaigns/:id/batches/:batchId`) | *Single Export* mengunduh 1 `.mp4` (plus opsional `.txt`/`.srt`/`.jpg`). *Bulk Export* men-stream arsip `.zip` multi-folder menggunakan `archiver` + `00-RINGKASAN-CAMPAIGN-DAN-JADWAL-UPLOAD.md`. |
| **5. Preset & Master Data** | **Kelola Master Presets** (`/settings/presets`) | **Pilihan Preset di Studio / Re-Editor** | Halaman `/settings/presets` melakukan CRUD ke tabel `master_presets`. Halaman Studio & Re-Editor hanya mengonsumsi data aktif (`is_active = true`) secara read-only (plus input kustom sekali pakai). |
