import fs from 'node:fs';
import {
  CRITIC_ROLE_CATALOG,
  CriticReviewResultSchema,
  type BriefRulebook,
  type CriticReviewResult,
  type CriticRoleId,
  type EdlDocument,
  type TargetConfig
} from '@clip/shared';
import { resolveSafeStoragePath } from '../../config/storage.js';
import { computeEdlSegmentTimeline, type CaptionCue } from '../media/ass-subtitle.builder.js';
import { extractVideoStoryboards } from '../media/vision-storyboard.service.js';
import { resolveContentLanguage } from './content-language.helper.js';
import { generateStructuredJsonWithByok, getActiveKeyForRole, type MultimodalImagePart } from './llm-json.adapter.js';

export interface CriticClipContext {
  userId: string;
  clipId: string;
  angleTitle: string;
  hookSummary: string;
  edl: EdlDocument;
  actualDurationSec: number;
  outputVideoRelPath: string | null;
  cues: CaptionCue[];
  targetConfig: TargetConfig;
  rulebook: BriefRulebook | null;
  sourceFilenamesById: Record<string, string>;
  viralScoreTotal: number | null;
  roleIds: CriticRoleId[];
  focusNote?: string;
}

const ROLE_PERSONA_INSTRUCTIONS: Record<CriticRoleId, string> = {
  general_audience:
    'Perspektif Umum (Penonton Awam): Bertindaklah sebagai penonton biasa yang sedang scrolling cepat. Uji apakah dalam 2-3 detik pertama langsung jelas ini video tentang apa, apakah ada bagian membosankan yang bikin langsung swipe, dan apakah teks/audio nyaman diikuti tanpa konteks tambahan.',
  target_matrix:
    'Audit Matriks Target Audiens & Brief: Evaluasi secara klinis kecocokan video dengan seluruh parameter aktif targetConfig (Platform, Country, Usia, Bahasa, Niche, Tingkat Kontroversi, Tipe Hook, KPI, Gaya Editing, Color Grade, Mode Audio) dan BriefRulebook (durasi min/max, Do/Dont, CTA/hashtag wajib).',
  roger_ebert:
    'Roger Ebert (Humanis, Empatik & Konstruktif): Jangan menghakimi berdasarkan selera sempit; tanyakan "seberapa berhasil klip ini mencapai niat & tujuan emosionalnya sendiri?" Soroti jiwa cerita, motivasi tokoh, momen yang sudah menyentuh/berfungsi untuk DIPERTAHANKAN, lalu tunjukkan bagian yang menghalangi resonansi penonton.',
  cinema_poetica:
    'Eric Sasono / Adrian Jonathan Pasaribu - Cinema Poetica (Analitis-Kritis): Bedah lapisan makna/subteks, struktur naratif (pembuka-eskalasi-penutup), estetika sinema, pilihan warna/transisi sebagai pembawa makna, dan kepekaan terhadap konteks budaya audiens.',
  pauline_kael:
    'Pauline Kael (Berani, Tajam & Anti-Bosan): Bicaralah blak-blakan tanpa basa-basi. Deteksi bagian yang terasa pretensius, "sok dalam", lesu, atau kehilangan daya hidup. Tuntut potongan lebih berani, hook lebih menggigit, dan energi yang benar-benar terasa.',
  shandy_gasella:
    'Shandy Gasella (Blak-blakan, Lugas & Fokus Pacing/Pasar): Evaluasi efektivitas premis/hook, soliditas ritme pacing antar potongan, apakah durasi sudah padat tanpa basa-basi, dan apakah hasil akhirnya bekerja sebagai tontonan yang memuaskan pasar.',
  cine_crib:
    'Cine Crib - Rasyid & Aria (Penonton Modern & Tajam pada Logika): Tangkap cepat lompatan cerita/plot hole, teks hook atau transisi yang terasa kaku/canggung, inkonsistensi antar shot, namun tetap adil menghargai nilai hiburan dan momen serunya.',
  tony_zhou:
    'Tony Zhou - Every Frame a Painting (Visual Storytelling & Teknis Editing): Fokus murni pada bahasa visual: blocking/framing 9:16, gerak kamera (zoom/push_in/pull_out), ritme cut & transisi xfade, serta bagaimana gambar bercerita kuat tanpa bergantung penuh pada teks.',
  mark_kermode:
    'Mark Kermode (Atmosfer, Genre & Eskalasi Tensi): Periksa konsistensi atmosfer, pilihan colorGrade, bangunan tensi menuju klimaks/payoff, dan kesesuaian dinamika audio/musik dengan nuansa genre yang ingin dibangun.'
};

const ENGINE_CAPABILITY_MANIFEST = [
  'KEMAMPUAN MESIN EDIT LOKAL (FFmpeg EDL v1.1 - HANYA SARANKAN SOLUSI YANG BISA DIEKSEKUSI DI BAWAH INI):',
  '1. Potong/ubah segmen: pangkas detik awal/akhir (misal potong 1.5s intro lambat), hapus/ubah urutan segmen dari mediaAssetId yang sudah ada, atur speed (0.6x-1.6x), zoom (1.0x-2.5x), cropX (left/center/right), motion kamera (none/push_in/pull_out), dan transisi (cut/fade/dissolve/smoothleft/smoothright/wipeleft/fadeblack/circleopen).',
  '2. Color Grading 5 preset: natural, viral_high_contrast, warm_holiday_film, cinematic_teal_orange, moody_cinema.',
  '3. Framing 9:16: fit_blur_bg, center_crop, split_screen, auto_face_track.',
  '4. Audio: Mute 0% (siap ganti sound trending platform), Ducking 15%/20%/30%, atau Normalize 100% (-14 LUFS).',
  '5. Hook Banner (0-3 detik pertama): tulis ulang lebih tajam, ubah durasi tampil, atau matikan bila mengganggu visual.',
  '6. Subtitle Safe-Zone: ubah gaya (hormozi_bold/clean_minimal/bilingual/off) atau naikkan/turunkan posisi verticalOffsetPct (45%-82%).',
  '7. CTA / Disclosure akhir: sisipkan teks CTA & hashtag wajib brief.',
  'DILARANG KERAS menyarankan hal mustahil bagi mesin lokal (seperti rekam ulang kamera, tambah aktor/CGI, buat sulih suara AI baru, atau pasang lagu berhak cipta eksternal).'
].join('\n');

function sanitizeAntiSlopText(raw: string): string {
  return String(raw ?? '')
    .replace(/\u2014/g, ' - ')
    .replace(/\u2013/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRoleMeta(id: CriticRoleId) {
  return CRITIC_ROLE_CATALOG.find((r) => r.id === id) ?? CRITIC_ROLE_CATALOG[0];
}

export function buildDeterministicCriticReview(ctx: CriticClipContext): CriticReviewResult {
  const { edl, actualDurationSec, targetConfig, rulebook, roleIds, cues, focusNote } = ctx;
  const timeline = computeEdlSegmentTimeline(edl.segments);
  const firstSlot = timeline.slots[0];
  const hasTransitions = edl.segments.some((s, idx) => idx > 0 && s.transition && s.transition !== 'cut');
  const hasMotion = edl.segments.some((s) => s.motion && s.motion !== 'none');
  const uniqueSources = new Set(edl.segments.map((s) => s.mediaAssetId)).size;
  const contentLang = resolveContentLanguage(targetConfig);
  const minDur = rulebook?.durationRules.minSec ?? 15;
  const maxDur = rulebook?.durationRules.maxSec ?? 60;
  const isTooLong = actualDurationSec > maxDur;
  const isTooShort = actualDurationSec < minDur;
  const isLoudTiktok =
    (targetConfig.platform === 'tiktok' || targetConfig.platform === 'youtube_shorts') &&
    !edl.audio.muteOriginal &&
    edl.audio.originalVolume >= 0.9;
  const isSlowFirstShot = (firstSlot?.effDurSec ?? 0) > 4.2;
  const isFlatGrade = !edl.colorGrade || edl.colorGrade === 'natural';
  const lowSubtitlePos = edl.captions.enabled && edl.captions.verticalOffsetPct > 72;

  const presets = new Set<string>();
  const actionFixes: string[] = [];

  if (isSlowFirstShot) {
    presets.add('cut_slow_intro_2s');
    actionFixes.push(`Potong 1.5 detik awal Segmen #1 (saat ini ${firstSlot.effDurSec.toFixed(1)}s) dan percepat 1.12x agar hook langsung menyala.`);
  }
  if (isLoudTiktok) {
    presets.add('duck_original_15');
    actionFixes.push('Kecilkan audio asli ke Ducking 15% atau Mute 0% agar siap ditumpuk Trending Sound platform tanpa tabrakan.');
  }
  if (isFlatGrade) {
    actionFixes.push('Ubah colorGrade ke warm_holiday_film atau viral_high_contrast agar kontras warna lebih tajam di layar HP.');
  }
  if (!hasMotion) {
    actionFixes.push('Tambahkan gerak kamera push_in halus dan zoom 1.12x pada shot pembuka & penutup agar frame terasa hidup.');
  }
  if (!hasTransitions && edl.segments.length >= 2) {
    actionFixes.push('Pasang transisi smoothleft dan dissolve (0.3s) antar segmen agar perpindahan shot lebih sinematik.');
  }
  if (lowSubtitlePos) {
    presets.add('raise_subtitle_safezone');
    actionFixes.push(`Naikkan posisi subtitle dari ${edl.captions.verticalOffsetPct}% ke 66% agar aman dari area caption bawah.`);
  }
  if (!edl.complianceOverlays.ctaText.trim()) {
    presets.add('inject_brief_cta');
    actionFixes.push('Sisipkan overlay CTA akhir sesuai brief di 3.5 detik terakhir video.');
  }
  if (actionFixes.length === 0) {
    actionFixes.push('Percepat ritme segmen pembuka ke 1.1x dengan motion push_in dan pertegas teks Hook Banner 2.5 detik pertama.');
  }

  const perspectives = roleIds.map((roleId) => {
    const meta = getRoleMeta(roleId);

    if (roleId === 'target_matrix') {
      const issues = [];
      if (isTooLong || isTooShort) {
        issues.push({
          timestampSec: Math.max(0, Math.round((actualDurationSec - 2) * 10) / 10),
          segmentRef: `Segmen #${edl.segments.length}`,
          issue: `Durasi aktual ${actualDurationSec.toFixed(1)}s berada di luar rentang brief ${minDur}-${maxDur}s untuk target ${targetConfig.platform.toUpperCase()} (${targetConfig.countryCode}).`,
          executableFix: isTooLong
            ? `Pangkas segmen terpanjang dan naikkan speed ke 1.12x agar total durasi masuk bawah ${maxDur}s.`
            : 'Perpanjang potongan segmen akhir agar memenuhi batas durasi minimal brief.'
        });
      }
      if (isLoudTiktok) {
        issues.push({
          timestampSec: 0,
          segmentRef: 'Audio Track',
          issue: `Audio asli masih 100% padahal target ${targetConfig.platform.toUpperCase()} (${targetConfig.ageGroup}) rentan bentrok jika ingin ditumpuk sound trending.`,
          executableFix: 'Terapkan Ducking 15% atau Mute 0% sesuai rencana Upload Playbook.'
        });
      }
      if (issues.length === 0) {
        issues.push({
          timestampSec: 0,
          segmentRef: 'Segmen #1',
          issue: `Hook tipe ${targetConfig.hookType} untuk audiens ${targetConfig.countryCode} (${targetConfig.ageGroup}) masih bisa lebih spesifik agar KPI ${targetConfig.primaryKpi} melonjak.`,
          executableFix: `Pertajam teks Hook Banner dalam ${contentLang.label} dan beri zoom 1.12x + push_in pada 2.5 detik pertama.`
        });
      }
      return {
        roleId,
        roleName: meta.name,
        verdictHeadline: `Audit Matriks ${targetConfig.countryCode} (${targetConfig.platform.toUpperCase()}): ${issues.length} celah eksekusi ditemukan`,
        whatWorks: `Struktur ${edl.segments.length} segmen dari ${uniqueSources} sumber (${actualDurationSec.toFixed(1)}s) sudah selaras framing ${edl.framingMode} untuk niche ${targetConfig.personaNiche}.`,
        weaknesses: issues
      };
    }

    if (roleId === 'roger_ebert') {
      return {
        roleId,
        roleName: meta.name,
        verdictHeadline: 'Jiwa cerita sudah mulai terasa, tinggal jaga fokus emosi di pembuka & penutup',
        whatWorks: `Klip membawa ${edl.segments.length} potongan visual (${uniqueSources} video sumber) dengan alur ${cues.length > 0 ? 'dialog nyata yang memberi kehadiran manusia' : 'visual berurutan yang hangat'} - pertahankan momen interaksi manusia utamanya.`,
        weaknesses: [
          {
            timestampSec: firstSlot ? Math.min(2.5, firstSlot.effDurSec) : 0,
            segmentRef: 'Segmen #1',
            issue: isSlowFirstShot
              ? `Pembukaan Segmen #1 (${firstSlot.effDurSec.toFixed(1)}s) sedikit menahan penonton sebelum ikatan emosi terbangun.`
              : 'Transisi dari hook menuju momen inti perlu ruang bernapas emosional agar niat cerita langsung dirasakan.',
            executableFix: isSlowFirstShot
              ? 'Potong 1.5 detik pembukaan yang lambat dan pakai transisi dissolve halus menuju momen ekspresi wajah utama.'
              : 'Gunakan colorGrade warm_holiday_film dan transisi dissolve 0.35s agar nada emosional menyatu.'
          }
        ]
      };
    }

    if (roleId === 'pauline_kael') {
      return {
        roleId,
        roleName: meta.name,
        verdictHeadline: 'Jangan biarkan klip terasa aman tapi lesu - potong bagian yang menahan energi!',
        whatWorks: uniqueSources >= 2
          ? `Perpaduan ${uniqueSources} sumber video memberi denyut dinamis yang jauh lebih hidup ketimbang rekaman tunggal statis.`
          : 'Premis visual utamanya punya potensi daya tarik bila ritmenya dipacu lebih berani.',
        weaknesses: [
          {
            timestampSec: 0,
            segmentRef: 'Segmen #1',
            issue: `Shot awal berjalan ${firstSlot ? `${firstSlot.effDurSec.toFixed(1)}s` : 'terlalu santai'} pada speed ${(edl.segments[0]?.speed ?? 1).toFixed(2)}x sehingga belum cukup menggigit penonton yang cepat bosan.`,
            executableFix: 'Pangkas 1.5 detik awal, naikkan speed Segmen #1 ke 1.15x, pakai transisi smoothleft, dan ubah colorGrade ke viral_high_contrast.'
          }
        ]
      };
    }

    if (roleId === 'cinema_poetica') {
      return {
        roleId,
        roleName: meta.name,
        verdictHeadline: 'Perkuat koherensi subteks visual antara pembuka, tengah, dan klimaks penutup',
        whatWorks: `Komposisi ${edl.segments.length} segmen dengan warna ${edl.colorGrade ?? 'natural'} membentuk kerangka naratif singkat yang sudah terbaca.`,
        weaknesses: [
          {
            timestampSec: Math.round((actualDurationSec * 0.5) * 10) / 10,
            segmentRef: `Segmen #${Math.min(edl.segments.length, 2)}`,
            issue: 'Kontras estetika antar shot masih cenderung informatif; pilihan warna dan transisi bisa lebih mendukung subteks tema.',
            executableFix: 'Terapkan colorGrade cinematic_teal_orange atau moody_cinema dengan transisi fadeblack/dissolve di titik balik cerita.'
          }
        ]
      };
    }

    if (roleId === 'shandy_gasella') {
      return {
        roleId,
        roleName: meta.name,
        verdictHeadline: 'Lugasnya: rapatkan ritme pacing agar tidak ada detik terbuang percuma',
        whatWorks: `Durasi ${actualDurationSec.toFixed(1)}s dengan ${edl.segments.length} segmen sudah punya pondasi tontonan yang cukup rapi.`,
        weaknesses: [
          {
            timestampSec: firstSlot ? Math.min(3.0, firstSlot.effDurSec) : 0,
            segmentRef: 'Segmen #1',
            issue: isSlowFirstShot
              ? `Segmen #1 (${firstSlot.effDurSec.toFixed(1)}s) terlalu bertele-tele untuk format short-form.`
              : 'Ritme pergantian shot masih bisa dibuat lebih padat agar hook langsung menyambung ke payoff.',
            executableFix: 'Potong 1.5 detik awal yang lambat, percepat pacing ke 1.12x, dan pastikan CTA singkat hadir di 3 detik terakhir.'
          }
        ]
      };
    }

    if (roleId === 'cine_crib') {
      return {
        roleId,
        roleName: meta.name,
        verdictHeadline: 'Cek kesinambungan logika antar potongan agar penonton modern tidak bingung',
        whatWorks: `Nilai hiburan visualnya sudah tertangkap dari pergantian ${edl.segments.length} shot dan Hook Banner "${edl.hookBanner.text || '-'}".`,
        weaknesses: [
          {
            timestampSec: timeline.slots[1]?.timelineStartSec ?? 2.0,
            segmentRef: edl.segments.length >= 2 ? 'Segmen #2' : 'Segmen #1',
            issue: 'Perpindahan visual dari hook ke badan cerita perlu jangkar konteks yang mulus supaya tidak terasa seperti lompatan acak.',
            executableFix: 'Rapikan teks Hook Banner agar langsung menjanjikan isi Segmen #2 dan pakai transisi fade/dissolve yang tidak mematahkan alur.'
          }
        ]
      };
    }

    if (roleId === 'tony_zhou') {
      return {
        roleId,
        roleName: meta.name,
        verdictHeadline: 'Biarkan kamera dan ritme potongan bercerita, bukan cuma teks di layar',
        whatWorks: `Framing ${edl.framingMode} menjaga komposisi ${edl.aspectRatio} tetap utuh sepanjang ${actualDurationSec.toFixed(1)}s.`,
        weaknesses: [
          {
            timestampSec: 0,
            segmentRef: 'Segmen #1',
            issue: !hasMotion
              ? 'Seluruh segmen saat ini statis (motion = none) sehingga mata penonton kurang dituntun menuju fokus subjek.'
              : 'Kombinasi framing dan ritme cut bisa lebih ritmis pada pergantian shot.',
            executableFix: 'Aktifkan framing auto_face_track (atau zoom 1.15x) + gerak kamera push_in di shot pembuka dan transisi smoothleft di cut utama.'
          }
        ]
      };
    }

    if (roleId === 'mark_kermode') {
      return {
        roleId,
        roleName: meta.name,
        verdictHeadline: 'Bangun atmosfer & eskalasi tensi visual-audio yang lebih konsisten',
        whatWorks: `Pilihan audio saat ini (${edl.audio.muteOriginal ? 'Mute 0%' : `${Math.round(edl.audio.originalVolume * 100)}%`}) dan struktur ${edl.segments.length} shot memberi dasar suasana yang jelas.`,
        weaknesses: [
          {
            timestampSec: Math.round((actualDurationSec * 0.7) * 10) / 10,
            segmentRef: `Segmen #${edl.segments.length}`,
            issue: isFlatGrade
              ? 'Warna masih natural polos sehingga atmosfer genre dan ketegangan menuju klimaks terasa datar.'
              : 'Bangunan tensi menuju segmen penutup perlu aksentuasi ritme dan kontras audio.',
            executableFix: 'Terapkan colorGrade moody_cinema atau warm_holiday_film, tambah fadeblack sebelum payoff akhir, dan sinkronkan volume audio untuk musik latar.'
          }
        ]
      };
    }

    // general_audience
    return {
      roleId,
      roleName: meta.name,
      verdictHeadline: '3 detik pertama menentukan apakah penonton awam lanjut nonton atau langsung scroll',
      whatWorks: `Video ${actualDurationSec.toFixed(1)}s sudah siap tonton vertikal dengan teks pembuka "${edl.hookBanner.text || 'tanpa banner'}".`,
      weaknesses: [
        {
          timestampSec: 0,
          segmentRef: 'Segmen #1',
          issue: lowSubtitlePos
            ? `Posisi subtitle (${edl.captions.verticalOffsetPct}%) cukup rendah dan rawan tertutup tombol/caption aplikasi.`
            : 'Daya henti 3 detik pertama perlu penekanan visual lebih jelas agar penonton awam langsung paham nilainya.',
          executableFix: lowSubtitlePos
            ? 'Naikkan subtitle ke 66% Safe-Zone dan potong 1.5 detik pembukaan lambat.'
            : 'Potong 1.5 detik awal, aktifkan push_in halus, dan perjelas warna ke viral_high_contrast.'
        }
      ]
    };
  });

  const roleLabels = perspectives.map((p) => getRoleMeta(p.roleId).shortName).join(' + ');
  const combinedSynthesis = sanitizeAntiSlopText(
    `Sintesis ${roleLabels}: pertahankan kekuatan inti klip (${edl.segments.length} segmen dari ${uniqueSources} sumber), lalu fokus pada perbaikan eksekusi konkret: ${actionFixes.slice(0, 3).join(' ')}` +
      (focusNote?.trim() ? ` Fokus tambahan Anda ("${focusNote.trim()}") ikut diprioritaskan.` : '')
  );

  const suggestedPrompt = sanitizeAntiSlopText(
    [
      `Terapkan perbaikan terarah berdasarkan bedah ${roleLabels}:`,
      ...actionFixes.slice(0, 4).map((fix, idx) => `${idx + 1}. ${fix}`),
      focusNote?.trim() ? `Catatan tambahan kreator: ${focusNote.trim()}` : ''
    ]
      .filter(Boolean)
      .join(' ')
  );

  return CriticReviewResultSchema.parse({
    mode: 'local_deterministic',
    rolesUsed: roleIds,
    perspectives,
    combinedSynthesis,
    executableSolutions: actionFixes.slice(0, 5).map(sanitizeAntiSlopText),
    recommendedPresetCodes: Array.from(presets),
    suggestedPrompt,
    groundingNote: `Analisis deterministik berbasis fakta EDL aktual (${edl.segments.length} segmen, ${actualDurationSec.toFixed(1)}s, ${targetConfig.platform.toUpperCase()} ${targetConfig.countryCode}). Pasang kunci Brain aktif untuk bedah mendalam AI.`
  });
}

export async function generateCriticCouncilReview(ctx: CriticClipContext): Promise<CriticReviewResult> {
  const uniqueRoles = Array.from(new Set(ctx.roleIds)).slice(0, 3);
  const safeCtx: CriticClipContext = { ...ctx, roleIds: uniqueRoles };
  const fallback = buildDeterministicCriticReview(safeCtx);
  const brainKey = await getActiveKeyForRole(ctx.userId, 'brain');
  if (!brainKey) {
    return fallback;
  }

  const timeline = computeEdlSegmentTimeline(ctx.edl.segments);
  const contentLang = resolveContentLanguage(ctx.targetConfig);
  const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');

  // Ekstrak 1 contact-sheet 3x2 dari klip ter-render (0 biaya) agar Gemini Vision melihat video aktual
  let images: MultimodalImagePart[] = [];
  if (!isTestEnv && brainKey.provider === 'gemini' && ctx.outputVideoRelPath) {
    try {
      const absVid = resolveSafeStoragePath(ctx.outputVideoRelPath);
      if (fs.existsSync(absVid)) {
        const sbs = await extractVideoStoryboards(
          [
            {
              id: ctx.clipId,
              originalFilename: `rendered-clip.mp4`,
              filePath: ctx.outputVideoRelPath,
              durationSec: ctx.actualDurationSec
            }
          ],
          1
        );
        if (sbs[0]) {
          images = [
            {
              label: `3x2 rendered clip storyboard (duration ${ctx.actualDurationSec.toFixed(1)}s, timestamps sec: [${sbs[0].frameTimestampsSec.join(', ')}])`,
              mimeType: sbs[0].mimeType,
              dataBase64: sbs[0].dataBase64
            }
          ];
        }
      }
    } catch {
      images = [];
    }
  }

  const activePersonasBlock = uniqueRoles
    .map((id, idx) => `${idx + 1}. [${id}] ${ROLE_PERSONA_INSTRUCTIONS[id]}`)
    .join('\n');

  const systemPrompt = [
    'Anda adalah Dewan Kritikus Film & Short-Form Editor Profesional untuk studio clip-content-rewards.',
    'TUGAS: Bedah klip video secara tajam, jujur, konstruktif, dan bebas AI slop berdasarkan FAKTA KLIP AKTUAL (segmen, durasi, audio, colorGrade, hookBanner, transkrip, targetConfig, briefRulebook, dan storyboard jika tersedia).',
    '',
    'PERAN KRITIKUS YANG WAJIB DIMAINKAN:',
    activePersonasBlock,
    '',
    ENGINE_CAPABILITY_MANIFEST,
    '',
    'ATURAN ANTI-AI-SLOP MUTLAK:',
    '- DILARANG menulis pujian kosong atau saran generik seperti "secara keseluruhan sudah cukup baik", "tingkatkan kualitas visual secara umum", atau menggunakan karakter em-dash.',
    '- Setiap item pada weaknesses WAJIB merujuk ke Segmen nyata ("Segmen #1".."Segmen #N" atau "Audio Track") dan timestampSec nyata dalam rentang 0 sampai actualDurationSec.',
    '- Setiap executableFix dan suggestedPrompt HARUS 100% bisa langsung dieksekusi oleh FFmpeg EDL Patcher (potong detik, ubah speed/zoom/motion/transition, ubah colorGrade, ubah audio mute/ducking/normalize, ubah framingMode, ubah/matikan hookBanner, naikkan/matikan subtitle, tambah CTA brief).',
    `- Bila menyarankan revisi teks layar (hookBanner / CTA), teks layar tersebut WAJIB berbahasa ${contentLang.label} (Country: ${ctx.targetConfig.countryCode}) dan dilarang memuat tag demografi dalam kurung.`,
    '- Semua penjelasan analisis, sintesis, dan instruksi prompt untuk kreator ditulis dalam Bahasa Indonesia yang tajam, konkret, dan langsung pakai.',
    '- Bila ada 2-3 peran dipilih, bagian combinedSynthesis WAJIB menyatukan kedua kutub (apa yang DIPERTAHANKAN vs apa yang DIPOTONG/DIUBAH secara konkret).',
    '',
    'KEMBALIKAN HANYA JSON VALID dengan skema persis berikut:',
    '{"perspectives":[{"roleId":"...","roleName":"...","verdictHeadline":"...","whatWorks":"...","weaknesses":[{"timestampSec":0.0,"segmentRef":"Segmen #1","issue":"...","executableFix":"..."}]}],"combinedSynthesis":"...","executableSolutions":["..."],"recommendedPresetCodes":["mute_original_audio|duck_original_15|duck_original_30|normalize_clean_vocal|cut_slow_intro_2s|raise_subtitle_safezone|zoom_in_115|inject_brief_cta"],"suggestedPrompt":"..."}'
  ].join('\n');

  const clipSnapshot = {
    angleTitle: ctx.angleTitle,
    hookSummary: ctx.hookSummary,
    actualDurationSec: Math.round(ctx.actualDurationSec * 100) / 100,
    viralScoreTotal: ctx.viralScoreTotal,
    requestedRoleIds: uniqueRoles,
    creatorFocusNote: ctx.focusNote?.trim() || null,
    targetConfig: {
      platform: ctx.targetConfig.platform,
      countryCode: ctx.targetConfig.countryCode,
      languageStyle: ctx.targetConfig.languageStyle,
      ageGroup: ctx.targetConfig.ageGroup,
      personaNiche: ctx.targetConfig.personaNiche,
      controversyLevel: ctx.targetConfig.controversyLevel,
      hookType: ctx.targetConfig.hookType,
      emotionalTrigger: ctx.targetConfig.emotionalTrigger,
      primaryKpi: ctx.targetConfig.primaryKpi,
      editingStyle: ctx.targetConfig.editingStyle,
      colorGrade: ctx.targetConfig.colorGrade,
      initialAudioMode: ctx.targetConfig.initialAudioMode
    },
    briefRulebook: ctx.rulebook,
    edlActual: {
      aspectRatio: ctx.edl.aspectRatio,
      framingMode: ctx.edl.framingMode,
      colorGrade: ctx.edl.colorGrade,
      audio: ctx.edl.audio,
      hookBanner: ctx.edl.hookBanner,
      captions: {
        enabled: ctx.edl.captions.enabled,
        style: ctx.edl.captions.style,
        verticalOffsetPct: ctx.edl.captions.verticalOffsetPct
      },
      ctaText: ctx.edl.complianceOverlays.ctaText,
      segments: timeline.slots.map((slot) => ({
        segmentRef: `Segmen #${slot.index + 1}`,
        sourceFile: ctx.sourceFilenamesById[slot.mediaAssetId] ?? slot.mediaAssetId,
        sourceRangeSec: [slot.sourceStartSec, slot.sourceEndSec],
        timelineRangeSec: [
          Math.round(slot.timelineStartSec * 100) / 100,
          Math.round(slot.timelineEndSec * 100) / 100
        ],
        speed: slot.speed,
        zoom: ctx.edl.segments[slot.index]?.zoom ?? 1,
        transition: ctx.edl.segments[slot.index]?.transition ?? 'cut',
        motion: ctx.edl.segments[slot.index]?.motion ?? 'none'
      }))
    },
    spokenSubtitleSample: ctx.cues.slice(0, 24).map((c) => `[${c.startSec.toFixed(1)}s] ${c.text}`)
  };

  try {
    const aiRes = await generateStructuredJsonWithByok({
      key: brainKey,
      systemPrompt,
      userPrompt: JSON.stringify(clipSnapshot),
      images: images.length > 0 ? images : undefined,
      temperature: 0.35,
      maxOutputTokens: Math.min(3200, 1100 + uniqueRoles.length * 550)
    });

    const raw = aiRes.json as Record<string, unknown>;
    const rawPerspectives = Array.isArray(raw.perspectives) ? raw.perspectives : [];
    const byRole = new Map<CriticRoleId, Record<string, unknown>>();
    for (const item of rawPerspectives) {
      if (item && typeof item === 'object' && typeof (item as { roleId?: unknown }).roleId === 'string') {
        const rid = (item as { roleId: string }).roleId as CriticRoleId;
        if (uniqueRoles.includes(rid)) {
          byRole.set(rid, item as Record<string, unknown>);
        }
      }
    }

    const sanitizedPerspectives = uniqueRoles.map((rid) => {
      const found = byRole.get(rid);
      const fallbackRole = fallback.perspectives.find((p) => p.roleId === rid) ?? fallback.perspectives[0];
      if (!found) return fallbackRole;
      const meta = getRoleMeta(rid);
      const rawWeaknesses = Array.isArray(found.weaknesses) ? found.weaknesses : [];
      const weaknesses = rawWeaknesses
        .slice(0, 4)
        .map((w) => {
          const obj = (w ?? {}) as Record<string, unknown>;
          const rawTs = typeof obj.timestampSec === 'number' && Number.isFinite(obj.timestampSec)
            ? Math.round(Math.min(ctx.actualDurationSec, Math.max(0, obj.timestampSec)) * 10) / 10
            : undefined;
          return {
            timestampSec: rawTs,
            segmentRef: typeof obj.segmentRef === 'string' ? sanitizeAntiSlopText(obj.segmentRef).slice(0, 40) : undefined,
            issue: sanitizeAntiSlopText(String(obj.issue ?? '')).slice(0, 300),
            executableFix: sanitizeAntiSlopText(String(obj.executableFix ?? '')).slice(0, 260)
          };
        })
        .filter((w) => w.issue.length >= 4 && w.executableFix.length >= 4);

      return {
        roleId: rid,
        roleName: meta.name,
        verdictHeadline: sanitizeAntiSlopText(String(found.verdictHeadline ?? fallbackRole.verdictHeadline)).slice(0, 180) || fallbackRole.verdictHeadline,
        whatWorks: sanitizeAntiSlopText(String(found.whatWorks ?? fallbackRole.whatWorks)).slice(0, 340) || fallbackRole.whatWorks,
        weaknesses: weaknesses.length > 0 ? weaknesses : fallbackRole.weaknesses
      };
    });

    const allowedPresetCodes = new Set([
      'mute_original_audio',
      'duck_original_15',
      'duck_original_30',
      'normalize_clean_vocal',
      'cut_slow_intro_2s',
      'raise_subtitle_safezone',
      'zoom_in_115',
      'inject_brief_cta'
    ]);
    const recPresets = Array.isArray(raw.recommendedPresetCodes)
      ? raw.recommendedPresetCodes
          .map((c) => String(c))
          .filter((c) => allowedPresetCodes.has(c))
      : fallback.recommendedPresetCodes;

    const solutions = Array.isArray(raw.executableSolutions)
      ? raw.executableSolutions
          .map((s) => sanitizeAntiSlopText(String(s)).slice(0, 260))
          .filter((s) => s.length >= 4)
          .slice(0, 6)
      : fallback.executableSolutions;

    const modeTag = images.length > 0 ? ('ai_vision' as const) : ('ai_text' as const);

    return CriticReviewResultSchema.parse({
      mode: modeTag,
      usedModel: aiRes.usedModel,
      rolesUsed: uniqueRoles,
      perspectives: sanitizedPerspectives,
      combinedSynthesis:
        sanitizeAntiSlopText(String(raw.combinedSynthesis ?? fallback.combinedSynthesis)).slice(0, 700) ||
        fallback.combinedSynthesis,
      executableSolutions: solutions.length > 0 ? solutions : fallback.executableSolutions,
      recommendedPresetCodes: Array.from(new Set(recPresets)),
      suggestedPrompt:
        sanitizeAntiSlopText(String(raw.suggestedPrompt ?? fallback.suggestedPrompt)).slice(0, 1450) ||
        fallback.suggestedPrompt,
      groundingNote:
        modeTag === 'ai_vision'
          ? `Dibedah oleh ${aiRes.usedModel} Vision AI (melihat 6 frame video aktual + fakta EDL | ${aiRes.tokensUsed} token).`
          : `Dibedah oleh ${aiRes.usedModel} AI berbasis fakta EDL aktual (${aiRes.tokensUsed} token).`
    });
  } catch (err) {
    const errReason = err instanceof Error ? err.message.slice(0, 120) : 'AI timeout';
    return {
      ...fallback,
      groundingNote: `Analisis deterministik lokal aktif (AI fallback: ${errReason}) berbasis data EDL & Target Matrix nyata.`
    };
  }
}
