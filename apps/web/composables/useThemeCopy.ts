import { computed } from 'vue';
import type { ThemeId } from '@clip/shared';
import { useThemeStore } from '~/stores/theme';

export interface ThemeCopyDeck {
  badgeName: string;
  shortTag: string;
  brandSubtitle: string;
  navCampaigns: string;
  navPacing: string;
  navCalendar: string;
  navBrandKits: string;
  navMaintenance: string;
  navApiKeys: string;
  navPresets: string;
  pacingTitle: string;
  pacingSubtitle: string;
  calendarTitle: string;
  calendarSubtitle: string;
  brandKitsTitle: string;
  brandKitsSubtitle: string;
  maintenanceTitle: string;
  maintenanceSubtitle: string;
  apiKeysTitle: string;
  apiKeysSubtitle: string;
  doctorTitle: string;
  doctorSubtitle: string;
  addKeyCta: string;
  presetsTitle: string;
  presetsSubtitle: string;
  campaignsTitle: string;
  campaignsSubtitle: string;
  campaignsEmptyTitle: string;
  campaignsEmptyDesc: string;
  loginHeadline: string;
  loginSubheadline: string;
  setupHeadline: string;
  setupSubheadline: string;
}

const COPY_MAP: Record<ThemeId, ThemeCopyDeck> = {
  'editing-room': {
    badgeName: 'Editing Room',
    shortTag: 'PRO CONSOLE',
    brandSubtitle: 'Konsol Pasca-Produksi Lokal',
    navCampaigns: 'Antrean Campaign',
    navPacing: 'Ritme Referensi',
    navCalendar: 'Kalender & Excel',
    navBrandKits: 'Brand Kit',
    navMaintenance: 'Maintenance Disk',
    navApiKeys: 'Brankas API & Mesin',
    navPresets: 'Preset Parameter',
    pacingTitle: 'Telemetri & Kloning Ritme Referensi',
    pacingSubtitle: 'Ekstrak pola panjang shot, frekuensi cut per menit, dan tempo BPM dari video viral referensi tanpa menyalin cuplikan aslinya.',
    calendarTitle: 'Kalender Publikasi & Laporan Excel',
    calendarSubtitle: 'Atur jadwal tayang anti-bentrok lintas campaign berdasarkan jam optimal Playbook dan ekspor buku kerja Excel 3-sheet siap presentasi.',
    brandKitsTitle: 'Pustaka Brand Asset Kit',
    brandKitsSubtitle: 'Kunci logo transparan, palet warna Hook/Subtitle ASS, font, posisi watermark, dan CTA sekali saja agar seluruh video campaign seragam.',
    maintenanceTitle: 'Manajemen Storage, Retensi & Kebersihan Disk',
    maintenanceSubtitle: 'Pantau kapasitas lokal, tangani klip menganggur >= 30 hari, arsipkan MP4 pasca-tayang tanpa kehilangan Playbook, dan bersihkan versi revisi lama.',
    apiKeysTitle: 'Brankas Kunci AI & Telemetri Mesin',
    apiKeysSubtitle: 'Konfigurasikan penyedia analisis brief, transkripsi kata, serta pantau status FFmpeg lokal.',
    doctorTitle: 'Telemetri Mesin Lokal',
    doctorSubtitle: 'Verifikasi binary render, mode penyimpanan, dan batas beban CPU.',
    addKeyCta: 'Simpan Kunci Terenkripsi',
    presetsTitle: 'Master Preset & Profil Audiens',
    presetsSubtitle: 'Kelola daftar negara, rentang usia, gaya potong, dan perintah cepat lapangan secara dinamis.',
    campaignsTitle: 'Konsol Campaign Content Rewards',
    campaignsSubtitle: 'Pusat eksekusi brief PDF/DOCX dan bahan video mentah ke variasi siap tayang.',
    campaignsEmptyTitle: 'Belum Ada Sesi Produksi Campaign',
    campaignsEmptyDesc: 'Pastikan kunci AI dan telemetri FFmpeg hijau di menu Brankas API. Modul unggah brief & video aktif pada Milestone 5.',
    loginHeadline: 'Masuk ke Konsol Studio',
    loginSubheadline: 'Akses brankas kunci AI lokal dan jalankan pipeline render tanpa batas.',
    setupHeadline: 'Inisialisasi Pemilik Konsol',
    setupSubheadline: 'Buat akun lokal pertama untuk melindungi kunci API BYOK Anda di perangkat ini.'
  },
  'daylight-editorial': {
    badgeName: 'Daylight Editorial',
    shortTag: 'EDITORIAL DESK',
    brandSubtitle: 'Meja Redaksi Konten',
    navCampaigns: 'Daftar Campaign',
    navPacing: 'Pola Ritme',
    navCalendar: 'Jadwal & Laporan',
    navBrandKits: 'Kit Identitas',
    navMaintenance: 'Arsip & Retensi',
    navApiKeys: 'Koneksi AI & Studio',
    navPresets: 'Pustaka Preset',
    pacingTitle: 'Arsip Pola Ritme & Tempo Video Referensi',
    pacingSubtitle: 'Pelajari struktur potongan dan kurva energi tayangan referensi untuk diterapkan ulang secara etis pada materi campaign Anda.',
    calendarTitle: 'Kalender Redaksi & Rekap Laporan Excel',
    calendarSubtitle: 'Susun jadwal publikasi harian TikTok dan YouTube dengan rapi, pantau status tayang, dan unduh laporan spreadsheet lengkap.',
    brandKitsTitle: 'Kit Identitas Visual & Aset Merek',
    brandKitsSubtitle: 'Himpun logo resmi, warna utama dan aksen, tipografi subtitle, serta kalimat penutup CTA yang konsisten di setiap tayangan.',
    maintenanceTitle: 'Arsip Media, Retensi & Kesehatan Penyimpanan',
    maintenanceSubtitle: 'Tinjau konten yang belum dijadwalkan, rapikan berkas MP4 yang telah tayang sambil menjaga catatan Playbook, dan kendalikan ruang penyimpanan lokal.',
    apiKeysTitle: 'Koneksi Kecerdasan Buatan & Kesiapan Studio',
    apiKeysSubtitle: 'Tautkan layanan AI pilihan Anda dan pastikan perangkat lokal siap memproduksi tayangan sesuai brief.',
    doctorTitle: 'Ringkasan Kesiapan Perangkat',
    doctorSubtitle: 'Pemeriksaan otomatis mesin video, font subtitle, dan kapasitas penyimpanan.',
    addKeyCta: 'Tambahkan Koneksi AI',
    presetsTitle: 'Pustaka Parameter & Profil Pembaca',
    presetsSubtitle: 'Susun ulang preferensi wilayah, demografi audiens, serta kalimat perbaikan cepat untuk setiap campaign.',
    campaignsTitle: 'Meja Redaksi Campaign',
    campaignsSubtitle: 'Kelola naskah brief, materi video mentah, dan panduan jadwal publikasi TikTok serta YouTube.',
    campaignsEmptyTitle: 'Meja Redaksi Masih Kosong',
    campaignsEmptyDesc: 'Lengkapi koneksi AI di halaman Koneksi AI & Studio terlebih dahulu. Pengolahan dokumen brief dan video mentah akan hadir pada Milestone 5.',
    loginHeadline: 'Selamat Datang Kembali',
    loginSubheadline: 'Masuk untuk melanjutkan penyusunan brief dan peninjauan tayangan Anda.',
    setupHeadline: 'Mulai Meja Redaksi Lokal Anda',
    setupSubheadline: 'Daftarkan akun utama sekali saja untuk menjaga keamanan kunci API di komputer ini.'
  },
  'creator-tactile': {
    badgeName: 'Tactile Workbench',
    shortTag: 'CREATOR DESK',
    brandSubtitle: 'Workbench Konten Cepat',
    navCampaigns: 'Campaign Aktif',
    navPacing: 'Kloning Ritme',
    navCalendar: 'Kalender Upload',
    navBrandKits: 'Kit Brand',
    navMaintenance: 'Bersih-Bersih Disk',
    navApiKeys: 'Otak AI & Mesin',
    navPresets: 'Chip Preset Cepat',
    pacingTitle: 'Kloning Ritme Video Viral (Style-Only)',
    pacingSubtitle: 'Unggah 1 video viral referensi, ekstrak ketukan cut & BPM-nya dalam hitungan detik, lalu tempelkan ke video campaign kamu!',
    calendarTitle: 'Kalender Upload & Ekspor Excel 1-Klik',
    calendarSubtitle: 'Jadwalkan otomatis semua variasi skor tertinggi biar gak bentrok, centang yang sudah tayang, dan cetak laporan .xlsx kapan saja!',
    brandKitsTitle: 'Kit Aset Brand Reusable (1-Klik Pasang)',
    brandKitsSubtitle: 'Simpan logo, warna Hook/Subtitle, font, dan CTA andalan biar video ke-10 tampil sekece video pertama tanpa setting ulang!',
    maintenanceTitle: 'Pusat Bersih-Bersih Disk & Alert Retensi 30 Hari',
    maintenanceSubtitle: 'Cek klip nganggur yang lupa dijadwalkan, bersihkan versi lama atau MP4 sudah tayang tanpa hilangkan data Excel, bikin SSD laptop tetap ngebut!',
    apiKeysTitle: 'Sambungkan Otak AI & Cek Mesin Render',
    apiKeysSubtitle: 'Tempel kunci API milikmu sekali dengan aman, uji koneksi 1 klik, lalu gas produksi banyak variasi!',
    doctorTitle: 'Cek Kesehatan Mesin Render',
    doctorSubtitle: 'Pastikan FFmpeg, font caption, dan penyimpanan lokal siap kerja berat.',
    addKeyCta: 'Pasang Kunci API',
    presetsTitle: 'Chip Preset Lapangan & Profil Akun',
    presetsSubtitle: 'Atur tombol cepat mute/ducking audio, gaya hook, dan profil target multi-akun tanpa ketik ulang.',
    campaignsTitle: 'Workbench Campaign Content Rewards',
    campaignsSubtitle: 'Ubah brief dan video mentah jadi deretan klip skor viral tinggi lengkap dengan panduan upload.',
    campaignsEmptyTitle: 'Workbench Siap Dipakai!',
    campaignsEmptyDesc: 'Pasang kunci AI favoritmu dan cek status FFmpeg dulu di menu Otak AI & Mesin. Upload brief & raw video langsung aktif di Milestone 5.',
    loginHeadline: 'Buka Workbench Kreator',
    loginSubheadline: 'Masuk untuk mulai mencetak variasi klip siap upload TikTok & YouTube.',
    setupHeadline: 'Buat Akun Workbench Pertama',
    setupSubheadline: 'Amankan kunci API BYOK kamu di mesin lokal sebelum mulai bikin konten.'
  }
};

export function useThemeCopy() {
  const themeStore = useThemeStore();
  return computed(() => COPY_MAP[themeStore.current]);
}
