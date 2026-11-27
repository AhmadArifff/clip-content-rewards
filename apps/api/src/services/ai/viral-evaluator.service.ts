import { z } from 'zod';
import {
  UploadPlaybookSchema,
  ViralScoreCritiqueSchema,
  type BriefRulebook,
  type EdlDocument,
  type TargetConfig,
  type UploadPlaybook,
  type ViralScoreCritique
} from '@clip/shared';
import { generateStructuredJsonWithByok, getActiveKeyForRole } from './llm-json.adapter.js';

const COUNTRY_SCHEDULE_MAP: Record<string, { timezone: string; bestDays: string[]; bestTimeSlots: string[]; rationale: string }> = {
  ID: {
    timezone: 'Asia/Jakarta (WIB)',
    bestDays: ['Selasa', 'Kamis', 'Jumat', 'Minggu'],
    bestTimeSlots: ['12:00-13:30 WIB', '18:30-21:00 WIB'],
    rationale: 'Lonjakan scroll audiens Indonesia terjadi saat jam istirahat siang dan jam santai sepulang kerja/kuliah.'
  },
  US: {
    timezone: 'America/New_York (EST)',
    bestDays: ['Selasa', 'Rabu', 'Kamis', 'Sabtu'],
    bestTimeSlots: ['11:30-13:00 EST', '19:00-22:00 EST'],
    rationale: 'Puncak tayangan TikTok/Shorts pasar US ada di jam makan siang East Coast dan prime time malam.'
  },
  UK: {
    timezone: 'Europe/London (GMT)',
    bestDays: ['Selasa', 'Kamis', 'Minggu'],
    bestTimeSlots: ['12:00-13:30 GMT', '18:00-21:00 GMT'],
    rationale: 'Waktu komuter pulang kerja dan istirahat sore di Inggris menghasilkan completion rate tertinggi.'
  },
  MY: {
    timezone: 'Asia/Kuala_Lumpur (MYT)',
    bestDays: ['Selasa', 'Kamis', 'Sabtu'],
    bestTimeSlots: ['12:30-14:00 MYT', '19:30-22:00 MYT'],
    rationale: 'Audiens Malaysia aktif tinggi selepas makan siang dan malam hari.'
  },
  SG: {
    timezone: 'Asia/Singapore (SGT)',
    bestDays: ['Rabu', 'Kamis', 'Sabtu'],
    bestTimeSlots: ['12:00-13:30 SGT', '19:00-21:30 SGT'],
    rationale: 'Pekerja muda dan pelajar Singapura paling aktif pada jam makan siang dan komuter malam.'
  }
};

function buildAudioPlaybookSection(edl: EdlDocument, targetConfig: TargetConfig): UploadPlaybook['audioMusicGuide'] {
  const isTiktok = targetConfig.platform === 'tiktok';
  const platformName = isTiktok ? 'TikTok' : targetConfig.platform === 'youtube_shorts' ? 'YouTube Shorts' : 'YouTube';
  const musicVibe =
    targetConfig.controversyLevel === 'hot_take' || targetConfig.controversyLevel === 'controlled_debate'
      ? 'Dark Phonk / Tension Beat / Fast Lo-Fi'
      : targetConfig.editingStyle === 'cinematic_story'
        ? 'Ambient Emotional Piano / Cinematic Build-up'
        : 'Upbeat Viral Pop / Clean Tech Groove';
  const bpmRange = targetConfig.editingStyle === 'fast_cut_retention' ? '120-132 BPM' : '95-115 BPM';

  if (edl.audio.muteOriginal || edl.audio.originalVolume <= 0) {
    return {
      renderedAudioState: 'Audio Asli Di-Mute Penuh (0%)',
      recommendedMusicVibe: musicVibe,
      bpmRange,
      platformMixingInstruction: `Suara asli video ini sudah di-mute total (0%). Saat upload di ${platformName}, langsung pilih Trending Sound sesuai vibe di atas dan biarkan volume Added Sound di 100% agar sinkron tanpa tabrakan suara.`
    };
  }

  if (edl.audio.originalVolume < 0.85) {
    const pct = Math.round(edl.audio.originalVolume * 100);
    const addedPct = Math.min(85, Math.max(40, 100 - pct));
    return {
      renderedAudioState: `Audio Asli Dikecilkan (Ducking ${pct}%)`,
      recommendedMusicVibe: musicVibe,
      bpmRange,
      platformMixingInstruction: `Suara asli sudah disiapkan di level ${pct}%. Saat upload di ${platformName}, tambahkan Trending Sound dan atur Original Sound ${pct}% + Added Sound ${addedPct}% agar suasana musik terasa kuat namun audio latar tetap masuk.`
    };
  }

  return {
    renderedAudioState: `Audio Vokal Asli Penuh (100%, ${edl.audio.normalizeLufs} LUFS)`,
    recommendedMusicVibe: musicVibe,
    bpmRange,
    platformMixingInstruction: `Vokal asli sudah dinormalisasi ke ${edl.audio.normalizeLufs} LUFS. Jika ingin menambah musik latar di ${platformName}, jaga volume Added Sound rendah di kisaran 6%-12% (atau gunakan preset Re-Editor "Mute 0%" / "Ducking 15%" bila ingin mengganti dengan musik trending penuh).`
  };
}

export function buildDeterministicEvaluation(params: {
  edl: EdlDocument;
  actualDurationSec: number;
  rulebook: BriefRulebook | null;
  targetConfig: TargetConfig;
  angleTitle: string;
  hookSummary: string;
}): { evaluation: ViralScoreCritique; playbook: UploadPlaybook } {
  const { edl, actualDurationSec, rulebook, targetConfig, angleTitle, hookSummary } = params;

  const briefChecklist: ViralScoreCritique['briefChecklist'] = [];
  const critiques: ViralScoreCritique['critiques'] = [];

  // 1. Cek durasi terhadap Brief Rulebook
  const minDur = rulebook?.durationRules.minSec ?? 15;
  const maxDur = rulebook?.durationRules.maxSec ?? 60;
  let durationOk = true;
  if (actualDurationSec < minDur) {
    durationOk = false;
    briefChecklist.push({
      rule: `Rentang durasi wajib ${minDur}-${maxDur} detik`,
      status: 'warn',
      evidence: `Durasi hasil ${actualDurationSec.toFixed(1)}s (di bawah batas minimum ${minDur}s karena panjang footage uji/potongan).`
    });
    critiques.push({
      id: 'crit-duration-short',
      timestampSec: 0,
      severity: 'medium',
      issue: `Durasi klip (${actualDurationSec.toFixed(1)}s) lebih pendek dari target brief (${minDur}-${maxDur}s).`,
      suggestedRegeneratePrompt: `Perpanjang potongan segmen video agar durasi mendekati ${minDur}-${maxDur} detik sesuai brief.`
    });
  } else if (actualDurationSec > maxDur) {
    durationOk = false;
    briefChecklist.push({
      rule: `Rentang durasi wajib ${minDur}-${maxDur} detik`,
      status: 'fail',
      evidence: `Durasi hasil ${actualDurationSec.toFixed(1)}s melewati batas maksimal ${maxDur}s.`
    });
    critiques.push({
      id: 'crit-duration-long',
      timestampSec: Math.max(0, maxDur - 2),
      severity: 'high',
      issue: `Durasi melebihi batas maksimal brief (${maxDur}s), berisiko ditolak saat verifikasi campaign.`,
      suggestedRegeneratePrompt: `Ringkas durasi klip menjadi maksimal ${Math.max(15, maxDur - 3)} detik dan buang jeda hening.`
    });
  } else {
    briefChecklist.push({
      rule: `Rentang durasi wajib ${minDur}-${maxDur} detik`,
      status: 'pass',
      evidence: `Durasi klip ${actualDurationSec.toFixed(1)}s berada di dalam rentang ideal.`
    });
  }

  // 2. Cek Hook Banner 0-3s
  const hasHook = edl.hookBanner.enabled && edl.hookBanner.text.trim().length >= 8;
  const hookScore = hasHook ? (targetConfig.controversyLevel === 'hot_take' || targetConfig.controversyLevel === 'controlled_debate' ? 91 : 86) : 64;
  if (!hasHook) {
    critiques.push({
      id: 'crit-hook-missing',
      timestampSec: 0,
      severity: 'high',
      issue: 'Teks Hook Banner 3 detik pertama belum aktif sehingga risiko swipe-away tinggi.',
      suggestedRegeneratePrompt: 'Aktifkan teks Hook Banner 3 detik pertama yang memancing rasa penasaran di area aman atas.'
    });
  }

  // 3. Cek CTA & Elemen Wajib Brief
  const hasCta = edl.complianceOverlays.ctaText.trim().length > 0;
  briefChecklist.push({
    rule: 'Overlay CTA / Ajakan Aksi di akhir video',
    status: hasCta ? 'pass' : 'warn',
    evidence: hasCta ? `CTA tampil: "${edl.complianceOverlays.ctaText}"` : 'CTA layar belum diisi.'
  });
  if (!hasCta) {
    critiques.push({
      id: 'crit-cta-missing',
      timestampSec: Math.max(0, actualDurationSec - 3),
      severity: 'medium',
      issue: 'Belum ada overlay CTA wajib brief pada detik-detik penutup.',
      suggestedRegeneratePrompt: 'Tambahkan teks CTA dan disclaimer wajib sesuai aturan Brief di 4 detik terakhir.'
    });
  }

  // 4. Cek Audio & Safe-Zone Health
  const safeZoneOk = edl.aspectRatio === '16:9' || (edl.captions.verticalOffsetPct >= 58 && edl.captions.verticalOffsetPct <= 76);
  const audioScore = edl.audio.muteOriginal
    ? 92
    : edl.audio.originalVolume <= 0.35
      ? 90
      : 82;

  if (!edl.audio.muteOriginal && edl.audio.originalVolume >= 0.9 && targetConfig.platform === 'tiktok') {
    critiques.push({
      id: 'crit-audio-tiktok',
      timestampSec: 1.0,
      severity: 'medium',
      issue: 'Volume suara asli masih 100%; jika akan diganti/ditumpuk sound musik trending TikTok, suara bisa bertabrakan.',
      suggestedRegeneratePrompt: 'Suara audio asli belum sesuai brief musik TikTok, tolong kecilkan ke 15% atau mute total (0%) agar siap diisi sound trending TikTok.'
    });
  }

  if (!safeZoneOk) {
    critiques.push({
      id: 'crit-safezone',
      timestampSec: 2.0,
      severity: 'high',
      issue: `Posisi subtitle (${edl.captions.verticalOffsetPct}%) terlalu dekat dengan area caption/tombol bawah TikTok/Shorts.`,
      suggestedRegeneratePrompt: 'Naikkan posisi subtitle ke area aman tengah (verticalOffsetPct 68%) agar tidak tertutup UI aplikasi.'
    });
  }

  briefChecklist.push({
    rule: 'Kesesuaian Safe-Zone 9:16 & Kompatibilitas Audio',
    status: safeZoneOk ? 'pass' : 'warn',
    evidence: `Framing ${edl.framingMode}, posisi subtitle ${edl.captions.verticalOffsetPct}%, mode audio ${edl.audio.muteOriginal ? 'Mute 0%' : `${Math.round(edl.audio.originalVolume * 100)}%`}.`
  });

  if (critiques.length === 0) {
    critiques.push({
      id: 'crit-pacing-polish',
      timestampSec: Math.min(2.0, Math.max(0, actualDurationSec / 3)),
      severity: 'low',
      issue: 'Struktur video sudah solid; Anda bisa mencoba zoom-in 115% atau memotong 1-2 detik pembuka untuk menguji retensi lebih agresif.',
      suggestedRegeneratePrompt: 'Tambahkan zoom-in 115% pada segmen utama agar fokus visual lebih kuat.'
    });
  }

  const retentionScore = targetConfig.editingStyle === 'fast_cut_retention' ? 88 : 83;
  const briefScore = durationOk && hasCta ? 95 : durationOk || hasCta ? 82 : 65;
  const audienceFitScore = 88;
  const engagementScore = targetConfig.primaryKpi === 'comments' || targetConfig.controversyLevel === 'controlled_debate' ? 89 : 84;
  const audioSafeScore = safeZoneOk ? audioScore : 68;

  const totalScore = Math.round(
    hookScore * 0.25 +
      retentionScore * 0.2 +
      briefScore * 0.2 +
      audienceFitScore * 0.15 +
      engagementScore * 0.1 +
      audioSafeScore * 0.1
  );

  const briefComplianceStatus: ViralScoreCritique['briefComplianceStatus'] =
    briefChecklist.some((c) => c.status === 'fail')
      ? 'fail'
      : briefChecklist.some((c) => c.status === 'warn')
        ? 'warn'
        : 'pass';

  const evaluation = ViralScoreCritiqueSchema.parse({
    totalScore,
    briefComplianceStatus,
    dimensions: {
      hookStrength: { score: hookScore, note: hasHook ? 'Hook 0-3 detik langsung tampil kontras di zona aman atas.' : 'Hook visual awal perlu diperkuat.' },
      retentionPacing: { score: retentionScore, note: `Ritme selaras gaya ${targetConfig.editingStyle} dengan framing ${edl.framingMode}.` },
      briefCompliance: { score: briefScore, note: `Memeriksa durasi ${minDur}-${maxDur}s, CTA, dan ketentuan wajib campaign.` },
      audienceFit: { score: audienceFitScore, note: `Disesuaikan untuk audiens ${targetConfig.countryCode} usia ${targetConfig.ageGroup} (${targetConfig.personaNiche}).` },
      engagementTrigger: { score: engagementScore, note: `Fokus KPI ${targetConfig.primaryKpi} dengan sudut ${targetConfig.controversyLevel}.` },
      audioSafeZone: { score: audioSafeScore, note: safeZoneOk ? 'Subtitle dan banner berada dalam batas aman tombol platform.' : 'Posisi subtitle perlu dinaikkan.' }
    },
    briefChecklist,
    projectedImpact: {
      firstThreeSeconds: `Audiens ${targetConfig.countryCode} (${targetConfig.ageGroup}) cenderung berhenti scroll di 0-3 detik pertama berkat Hook Banner "${edl.hookBanner.text || hookSummary}".`,
      midRetention: `Framing ${edl.framingMode} menjaga konteks visual tetap terbaca penuh tanpa memotong detail penting di sisi layar.`,
      commentSharePotential: `Pendekatan ${targetConfig.controversyLevel} dengan pemicu ${targetConfig.emotionalTrigger} mendorong komentar pro-kontra sehat serta simpan/bagikan.`,
      audienceReactionSummary: `Variasi "${angleTitle}" cocok untuk uji performa awal pada segmen ${targetConfig.personaNiche}. ${edl.audio.muteOriginal ? 'Karena audio asli sudah di-mute 0%, pemilihan Trending Sound di aplikasi akan sangat menentukan dorongan FYP.' : 'Keseimbangan vokal dan caption membuat video tetap dipahami meski ditonton tanpa suara.'}`
    },
    critiques
  });

  const sched = COUNTRY_SCHEDULE_MAP[targetConfig.countryCode] ?? {
    timezone: 'UTC / Lokal Target',
    bestDays: ['Selasa', 'Kamis', 'Sabtu'],
    bestTimeSlots: ['12:00-13:30', '19:00-21:00'],
    rationale: 'Jam makan siang dan prime time malam memberi interaksi awal tercepat.'
  };

  const mandatoryTags = rulebook?.requiredHashtags ?? [];
  const mandatoryMentions = rulebook?.requiredMentions ?? [];
  const nicheSlug = targetConfig.personaNiche.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'kontenkreator';
  const nicheTags = [`#${nicheSlug}`, targetConfig.countryCode === 'ID' ? '#tipskonten' : '#contenttips', '#clipping'];
  const broadTags = targetConfig.platform === 'tiktok'
    ? ['#fyp', '#tiktokindonesia', '#belajarbareng']
    : ['#shorts', '#youtubeshorts', '#trending'];

  const allTagsText = Array.from(new Set([...mandatoryTags, ...nicheTags, ...broadTags])).join(' ');
  const mentionsText = mandatoryMentions.length > 0 ? ` ${mandatoryMentions.join(' ')}` : '';

  const rawGoalSnippet = rulebook?.campaignGoal.trim() || angleTitle;
  const cleanGoalSnippet =
    rawGoalSnippet.length > 44
      ? rawGoalSnippet.slice(0, 44).replace(/\s+\S*$/, '').trim()
      : rawGoalSnippet;

  const playbook = UploadPlaybookSchema.parse({
    audioMusicGuide: buildAudioPlaybookSection(edl, targetConfig),
    titleOptions: [
      hookSummary || angleTitle,
      `Jangan lewatkan hal ini kalau kamu ${targetConfig.personaNiche}`,
      `Bongkar fakta di balik ${cleanGoalSnippet || angleTitle}`
    ],
    captionDescription: `${hookSummary || angleTitle}. ${edl.complianceOverlays.ctaText || 'Tulis pendapatmu di kolom komentar!'}${mentionsText}\n\n${allTagsText}`.trim(),
    hashtags: {
      mandatory: mandatoryTags,
      niche: nicheTags,
      broad: broadTags
    },
    optimalSchedule: {
      timezone: sched.timezone,
      bestDays: sched.bestDays,
      bestTimeSlots: sched.bestTimeSlots,
      rationale: `${sched.rationale} (Target usia ${targetConfig.ageGroup}, KPI ${targetConfig.primaryKpi}).`
    },
    engagementToolkit: {
      pinnedComments: [
        `Menurut kamu poin mana yang paling relate untuk ${targetConfig.personaNiche}? Tulis di bawah!`,
        `Kalau ada yang butuh detail lengkapnya, cek link di bio ya.`
      ],
      first15MinChecklist: [
        'Pastikan setting volume Original Sound vs Added Sound di aplikasi sesuai panduan audio di atas.',
        'Sematkan (pin) salah satu Pinned Comment dalam 2 menit pertama setelah tayang.',
        'Balas 3-5 komentar pertama secara cepat untuk memicu dorongan distribusi awal algoritma.'
      ],
      coverFrameSec: Math.min(1.5, Math.max(0.2, actualDurationSec / 3))
    }
  });

  return { evaluation, playbook };
}

const CombinedEvalSchema = z.object({
  evaluation: ViralScoreCritiqueSchema,
  playbook: UploadPlaybookSchema
});

export async function evaluateClipVersion(params: {
  userId: string;
  edl: EdlDocument;
  actualDurationSec: number;
  rulebook: BriefRulebook | null;
  targetConfig: TargetConfig;
  angleTitle: string;
  hookSummary: string;
}): Promise<{ evaluation: ViralScoreCritique; playbook: UploadPlaybook; mode: 'ai' | 'local_heuristic' }> {
  const deterministic = buildDeterministicEvaluation(params);
  const brainKey = await getActiveKeyForRole(params.userId, 'brain');
  if (!brainKey) {
    return { ...deterministic, mode: 'local_heuristic' };
  }

  const systemPrompt =
    'Anda adalah Viral Content Strategist untuk TikTok & YouTube Content Rewards. ' +
    'Evaluasi video berbasis EDL dan Brief menjadi JSON {"evaluation": ..., "playbook": ...}. ' +
    'Semua penjelasan, kritik, caption, dan jadwal tayang wajib berbahasa Indonesia humanis tanpa em-dash. ' +
    'Panduan audio/musik pada playbook WAJIB 100% sesuai dengan edl.audio.muteOriginal dan edl.audio.originalVolume aktual.';

  try {
    const res = await generateStructuredJsonWithByok({
      key: brainKey,
      systemPrompt,
      userPrompt: JSON.stringify({
        angleTitle: params.angleTitle,
        hookSummary: params.hookSummary,
        actualDurationSec: params.actualDurationSec,
        edl: params.edl,
        rulebook: params.rulebook,
        targetConfig: params.targetConfig,
        baselineReference: deterministic
      }),
      temperature: 0.35
    });
    const parsed = CombinedEvalSchema.parse(res.json);
    // Pastikan instruksi mixing audio selalu akurat terhadap kondisi fisik audio di EDL
    parsed.playbook.audioMusicGuide.renderedAudioState = deterministic.playbook.audioMusicGuide.renderedAudioState;
    return {
      evaluation: parsed.evaluation,
      playbook: parsed.playbook,
      mode: 'ai'
    };
  } catch {
    return { ...deterministic, mode: 'local_heuristic' };
  }
}
