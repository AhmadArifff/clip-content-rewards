# Basis Pengetahuan & Riwayat Kasus (`.agents/knowledge/`)

Direktori ini adalah memori jangka panjang proyek `clip-content-rewards` untuk mencatat referensi domain, batas fitur lintas-menu, dan riwayat kasus bug beserta akar masalah dan solusinya.

## Indeks Knowledge Base

- **[domain-reference/01-content-rewards-and-edl.md](./domain-reference/01-content-rewards-and-edl.md)**: Referensi domain *Content Rewards*, rubrik Viral Score 6 dimensi, koordinat Safe-Zone TikTok vs YouTube Shorts, dan standar EDL JSON.
- **[cross-menu-disambiguation.md](./cross-menu-disambiguation.md)**: Kamus disambiguasi fitur kembar lintas-halaman agar agen tidak salah sasaran saat mengedit kode atau menjelaskan alur.
- **[bug-cases.md](./bug-cases.md)**: Catatan kronologis kendala teknis (FFmpeg, SQLite WAL, AI JSON parsing, audio sync, upload chunking) dan solusi terverifikasi.

## Format Penambahan Kasus Bug Baru

Setiap kali bug selesai diperbaiki, tambahkan entri baru ke `bug-cases.md` dengan 5 bagian wajib:
1. **Kasus #N**: Judul deskriptif bug.
2. **Konteks & Gejala (Symptom)**: Apa yang gagal di UI/API/FFmpeg.
3. **Akar Masalah (Root Cause)**: Penyebab teknis yang terverifikasi.
4. **Solusi yang Diterapkan (Fix Applied)**: File dan logika perbaikan.
5. **Pelajaran Pencegahan (Key Takeaway)**: Guardrail atau test yang ditambahkan agar tidak terulang.
