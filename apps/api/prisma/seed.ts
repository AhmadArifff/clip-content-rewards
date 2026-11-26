import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

const DEFAULT_PRESETS = [
  // Countries + Timezones
  { category: 'country', code: 'ID', labelId: 'Indonesia (WIB / Asia Jakarta)', sortOrder: 10, config: { timezone: 'Asia/Jakarta', peakHours: ['12:00-13:30', '18:30-21:00'], languageDefault: 'Bahasa Indonesia Santai' } },
  { category: 'country', code: 'US', labelId: 'Amerika Serikat (EST / New York)', sortOrder: 20, config: { timezone: 'America/New_York', peakHours: ['11:30-13:00', '19:00-22:00'], languageDefault: 'English US Casual' } },
  { category: 'country', code: 'UK', labelId: 'Inggris (GMT / London)', sortOrder: 30, config: { timezone: 'Europe/London', peakHours: ['12:00-13:30', '18:00-21:00'], languageDefault: 'English UK Natural' } },
  { category: 'country', code: 'MY', labelId: 'Malaysia (MYT / Kuala Lumpur)', sortOrder: 40, config: { timezone: 'Asia/Kuala_Lumpur', peakHours: ['12:30-14:00', '19:30-22:00'], languageDefault: 'Bahasa Melayu / Manglish' } },
  { category: 'country', code: 'SG', labelId: 'Singapura (SGT / Singapore)', sortOrder: 50, config: { timezone: 'Asia/Singapore', peakHours: ['12:00-13:30', '19:00-21:30'], languageDefault: 'English SG / Bilingual' } },
  { category: 'country', code: 'GLOBAL', labelId: 'Global English (Multi-Zona)', sortOrder: 60, config: { timezone: 'UTC', peakHours: ['14:00-17:00 UTC', '22:00-01:00 UTC'], languageDefault: 'English Universal' } },

  // Age Groups
  { category: 'age_group', code: '13-17', labelId: 'Gen Alpha / Remaja (13-17 tahun)', sortOrder: 10, config: { pacingHint: 'ultra_fast', slangLevel: 'high' } },
  { category: 'age_group', code: '18-24', labelId: 'Gen Z Dewasa Muda (18-24 tahun)', sortOrder: 20, config: { pacingHint: 'fast', slangLevel: 'medium_high' } },
  { category: 'age_group', code: '25-34', labelId: 'Milenial Produktif (25-34 tahun)', sortOrder: 30, config: { pacingHint: 'balanced', slangLevel: 'low_medium' } },
  { category: 'age_group', code: '35-44', labelId: 'Dewasa Mapang (35-44 tahun)', sortOrder: 40, config: { pacingHint: 'clear_story', slangLevel: 'low' } },
  { category: 'age_group', code: '45+', labelId: 'Dewasa Senior (45+ tahun)', sortOrder: 50, config: { pacingHint: 'calm_readable', slangLevel: 'none' } },

  // Editing Styles
  { category: 'editing_style', code: 'fast_cut_retention', labelId: 'Fast-Cut Retention (Potongan Cepat & Dinamis)', sortOrder: 10, config: { maxSilenceSec: 0.25, zoomPunch: true } },
  { category: 'editing_style', code: 'clean_talking_head', labelId: 'Clean Talking-Head (Rapi & Fokus Pembicara)', sortOrder: 20, config: { maxSilenceSec: 0.45, zoomPunch: false } },
  { category: 'editing_style', code: 'cinematic_story', labelId: 'Storytelling Narasi (Alur Emosional & Klimaks)', sortOrder: 30, config: { maxSilenceSec: 0.6, zoomPunch: false } },
  { category: 'editing_style', code: 'podcast_highlight', labelId: 'Podcast Highlight (Klip Momen Punchline)', sortOrder: 40, config: { maxSilenceSec: 0.35, zoomPunch: true } },

  // Hook Types (3 Detik Pertama)
  { category: 'hook_type', code: 'curiosity_gap', labelId: 'Curiosity Gap (Memancing Rasa Penasaran)', sortOrder: 10, config: {} },
  { category: 'hook_type', code: 'bold_claim', labelId: 'Bold Claim (Pernyataan Tegas di Awal)', sortOrder: 20, config: {} },
  { category: 'hook_type', code: 'pattern_interrupt', labelId: 'Pattern Interrupt (Pecah Pola Visual/Kalimat)', sortOrder: 30, config: {} },
  { category: 'hook_type', code: 'pain_point', labelId: 'Pain Point (Sentuh Masalah Nyata Audiens)', sortOrder: 40, config: {} },
  { category: 'hook_type', code: 'myth_busting', labelId: 'Myth-Busting (Bongkar Mitos Umum)', sortOrder: 50, config: {} },
  { category: 'hook_type', code: 'listicle_countdown', labelId: 'Listicle / 3 Poin Cepat', sortOrder: 60, config: {} },

  // Controversy / Polarization Levels
  { category: 'controversy_level', code: 'safe_edu', labelId: 'Aman & Edukatif (Low Risk)', sortOrder: 10, config: { riskTier: 'low' } },
  { category: 'controversy_level', code: 'bold_opinion', labelId: 'Opini Tegas & Berani (Medium)', sortOrder: 20, config: { riskTier: 'medium' } },
  { category: 'controversy_level', code: 'hot_take', labelId: 'Hot Take / Sudut Pandang Kontras (Policy-Safe)', sortOrder: 30, config: { riskTier: 'medium_high' } },
  { category: 'controversy_level', code: 'controlled_debate', labelId: 'Pemancing Diskusi / Debat Sehat di Komentar', sortOrder: 40, config: { riskTier: 'high_safe' } },

  // Framing Modes 16:9 -> 9:16
  { category: 'framing_mode', code: 'center_crop', labelId: 'Center Crop 9:16 (Potong Penuh ke Tengah)', sortOrder: 10, config: {} },
  { category: 'framing_mode', code: 'fit_blur_bg', labelId: 'Fit-Width + Latar Blur (Jaga Teks Pinggir Utuh)', sortOrder: 20, config: {} },
  { category: 'framing_mode', code: 'split_screen', labelId: 'Split-Screen Atas-Bawah (Multi-Fokus)', sortOrder: 30, config: {} },

  // Quick-Action Prompt Presets Lapangan (M8 Re-Editor)
  { category: 'prompt_preset', code: 'mute_original_audio', labelId: 'Mute Audio Asli (0%) - Ganti Sound TikTok/YT', sortOrder: 10, config: { group: 'audio', promptText: 'Mute total suara audio asli video (0%) karena akan diganti penuh dengan sound musik trending di TikTok/YouTube, dan perbarui panduan musik di Upload Playbook.' } },
  { category: 'prompt_preset', code: 'duck_original_15', labelId: 'Kecilkan Audio Asli ke 15% (Background Musik)', sortOrder: 20, config: { group: 'audio', promptText: 'Kecilkan volume suara asli video menjadi 15% agar masuk mulus di bawah sound musik trending TikTok/YouTube.' } },
  { category: 'prompt_preset', code: 'duck_original_30', labelId: 'Kecilkan Audio Asli ke 30% (Vokal Samar)', sortOrder: 30, config: { group: 'audio', promptText: 'Turunkan volume suara asli video ke 30% setelah normalisasi agar seimbang saat ditambah musik latar.' } },
  { category: 'prompt_preset', code: 'normalize_clean_vocal', labelId: 'Perjelas & Normalize Vokal Asli (-14 LUFS)', sortOrder: 40, config: { group: 'audio', promptText: 'Pertahankan suara asli 100% dan normalisasi loudness ke -14 LUFS agar vokal pembicara jernih dan lantang.' } },
  { category: 'prompt_preset', code: 'cut_slow_intro_2s', labelId: 'Potong 2 Detik Awal / Langsung ke Punchline', sortOrder: 50, config: { group: 'pacing', promptText: 'Buang 2 detik pembukaan yang lambat dan mulai video tepat pada kalimat hook terkuat.' } },
  { category: 'prompt_preset', code: 'tighten_silences', labelId: 'Perketat Semua Jeda Hening (Fast Jump-Cut)', sortOrder: 60, config: { group: 'pacing', promptText: 'Potong seluruh jeda napas dan dead-air di atas 0.25 detik agar ritme video lebih cepat dan menjaga retensi.' } },
  { category: 'prompt_preset', code: 'raise_subtitle_safezone', labelId: 'Naikkan Subtitle ke Safe-Zone Tengah', sortOrder: 70, config: { group: 'caption', promptText: 'Naikkan posisi subtitle ke area aman tengah (verticalOffsetPct 66%) agar tidak tertutup teks deskripsi TikTok/Shorts.' } },
  { category: 'prompt_preset', code: 'zoom_in_115', labelId: 'Zoom-In 115% & Fokus Wajah', sortOrder: 80, config: { group: 'visual', promptText: 'Tambahkan zoom-in 1.15x pada segmen utama agar ekspresi pembicara lebih dekat dan kuat.' } },
  { category: 'prompt_preset', code: 'inject_brief_cta', labelId: 'Tambahkan CTA / Disclaimer Wajib Brief', sortOrder: 90, config: { group: 'brief', promptText: 'Tambahkan teks CTA dan disclaimer wajib sesuai aturan Brief di 4 detik terakhir dalam area aman layar.' } }
];

async function main() {
  let upserted = 0;
  for (const item of DEFAULT_PRESETS) {
    await prisma.masterPreset.upsert({
      where: {
        category_code: {
          category: item.category,
          code: item.code
        }
      },
      update: {
        labelId: item.labelId,
        configJson: JSON.stringify(item.config),
        sortOrder: item.sortOrder
      },
      create: {
        category: item.category,
        code: item.code,
        labelId: item.labelId,
        configJson: JSON.stringify(item.config),
        sortOrder: item.sortOrder,
        isActive: true
      }
    });
    upserted += 1;
  }
  console.log(`[Seed] Selesai menyinkronkan ${upserted} master presets dinamis.`);
}

main()
  .catch((err) => {
    console.error('[Seed] Gagal menjalankan seed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
