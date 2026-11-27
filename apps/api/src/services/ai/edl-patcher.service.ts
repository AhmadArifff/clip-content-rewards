import {
  EdlPatchSchema,
  EdlSchema,
  type BriefRulebook,
  type EdlDocument,
  type EdlPatch,
  type TargetConfig
} from '@clip/shared';
import { generateStructuredJsonWithByok, getActiveKeyForRole } from './llm-json.adapter.js';

export interface SubtitleOverrideInput {
  index: number;
  text: string;
}

export function buildDeterministicEdlPatch(params: {
  currentEdl: EdlDocument;
  userPrompt: string;
  presetCodes: string[];
  subtitleOverrides?: SubtitleOverrideInput[];
  targetConfig: TargetConfig;
  rulebook: BriefRulebook | null;
}): EdlPatch {
  const { currentEdl, userPrompt, presetCodes, subtitleOverrides, targetConfig, rulebook } = params;
  const text = `${userPrompt} ${presetCodes.join(' ')}`.toLowerCase();
  const patch: EdlPatch = {
    humanSummary: ''
  };
  const summaries: string[] = [];

  const platformSound =
    targetConfig.platform === 'tiktok'
      ? ('tiktok_trending_overlay' as const)
      : targetConfig.platform === 'youtube_shorts'
        ? ('youtube_shorts_sound_overlay' as const)
        : ('none' as const);

  // 1. Kontrol Audio Lapangan (Mute / Ducking % / Normalize Vokal)
  if (
    presetCodes.includes('mute_original_audio') ||
    /(mute|bisukan|matikan suara|hilangkan suara|0%|\b0\s*persen)/i.test(text)
  ) {
    patch.audioPatch = {
      muteOriginal: true,
      originalVolume: 0,
      intendedPlatformSound: platformSound
    };
    summaries.push('Mute suara asli ke 0% (siap diganti sound trending TikTok/YouTube)');
  } else if (
    presetCodes.includes('duck_original_15') ||
    presetCodes.includes('duck_original_30') ||
    /(kecilkan|turunkan|pelankan|ducking|volume.{0,15}\d+\s*%)/i.test(text)
  ) {
    const pctMatch = text.match(/(\d{1,2})\s*(?:%|persen)/i);
    let pct = pctMatch ? Number(pctMatch[1]) : presetCodes.includes('duck_original_30') ? 30 : 15;
    pct = Math.max(5, Math.min(80, pct));
    patch.audioPatch = {
      muteOriginal: false,
      originalVolume: Math.round((pct / 100) * 100) / 100,
      intendedPlatformSound: platformSound
    };
    summaries.push(`Kecilkan suara asli ke ${pct}% untuk latar sound platform`);
  } else if (
    presetCodes.includes('normalize_clean_vocal') ||
    /(normalize|normalisasi|perjelas vokal|suara asli 100%|kembalikan suara)/i.test(text)
  ) {
    patch.audioPatch = {
      muteOriginal: false,
      originalVolume: 1.0,
      normalizeLufs: -14,
      intendedPlatformSound: 'none'
    };
    summaries.push('Aktifkan vokal asli 100% (-14 LUFS)');
  }

  // 2. Kontrol Hook & Pacing (Potong awal / Zoom)
  let nextSegments = currentEdl.segments.map((s) => ({ ...s }));
  let segmentsModified = false;

  if (presetCodes.includes('cut_slow_intro_2s') || /(potong.{0,12}(1|2|3)\s*detik|buang.{0,12}awal|intro lambat)/i.test(text)) {
    const cutMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:detik|s\b)/i);
    const cutSec = cutMatch ? Math.min(4, Math.max(0.5, Number(cutMatch[1]))) : 1.5;
    const first = nextSegments[0];
    if (first && first.endSec - first.startSec > cutSec + 1.0) {
      first.startSec = Math.round((first.startSec + cutSec) * 100) / 100;
      segmentsModified = true;
      summaries.push(`Potong ${cutSec} detik pembukaan agar langsung ke hook`);
    }
  }

  if (presetCodes.includes('zoom_in_115') || /(zoom|perbesar wajah|dekat)/i.test(text)) {
    nextSegments = nextSegments.map((s) => ({ ...s, zoom: 1.15 }));
    segmentsModified = true;
    summaries.push('Terapkan zoom-in 115% pada segmen utama');
  }

  if (segmentsModified) {
    patch.segmentsPatch = nextSegments;
  }

  // 3. Kontrol Framing 16:9 -> 9:16
  if (/fit.?blur|blur background|latar blur/i.test(text)) {
    patch.framingMode = 'fit_blur_bg';
    summaries.push('Ubah framing menjadi Fit-Width + Latar Blur');
  } else if (/center.?crop|crop tengah/i.test(text)) {
    patch.framingMode = 'center_crop';
    summaries.push('Ubah framing menjadi Center Crop 9:16');
  } else if (/split.?screen/i.test(text)) {
    patch.framingMode = 'split_screen';
    summaries.push('Ubah framing menjadi Split-Screen');
  }

  // 4. Kontrol Subtitle Safe-Zone & Inline Overrides
  const captionsPatch: NonNullable<EdlPatch['captionsPatch']> = {};
  if (presetCodes.includes('raise_subtitle_safezone') || /(naikkan subtitle|safe.?zone|ketutup caption|geser subtitle)/i.test(text)) {
    captionsPatch.enabled = true;
    captionsPatch.verticalOffsetPct = 66;
    summaries.push('Naikkan posisi subtitle ke Safe-Zone tengah (66%)');
  }
  if (/matikan subtitle|hapus subtitle|tanpa subtitle/i.test(text)) {
    captionsPatch.enabled = false;
    captionsPatch.style = 'off';
    summaries.push('Nonaktifkan subtitle');
  }
  if (subtitleOverrides && subtitleOverrides.length > 0) {
    captionsPatch.overrides = subtitleOverrides;
    summaries.push(`Terapkan ${subtitleOverrides.length} koreksi teks subtitle manual`);
  }
  if (Object.keys(captionsPatch).length > 0) {
    patch.captionsPatch = captionsPatch;
  }

  // 5. Kontrol Hook Banner & CTA Brief
  const quotedHook = userPrompt.match(/hook(?:\s+banner)?\s*[:=]\s*["']([^"']{4,100})["']/i);
  if (quotedHook) {
    patch.hookBannerPatch = { enabled: true, text: quotedHook[1] };
    summaries.push(`Perbarui teks Hook Banner menjadi "${quotedHook[1]}"`);
  }

  if (presetCodes.includes('inject_brief_cta') || /(tambah.{0,15}cta|disclaimer|wajib brief)/i.test(text)) {
    const ctaText =
      rulebook?.requiredHashtags?.length
        ? `Cek link di bio ${rulebook.requiredHashtags.slice(0, 2).join(' ')}`
        : 'Cek link di bio sekarang!';
    patch.complianceOverlaysPatch = {
      ctaText,
      disclosureText: rulebook?.mandatoryDos.some((d) => /#ad|sponsored|iklan/i.test(d)) ? '#ad' : ''
    };
    summaries.push('Tambahkan overlay CTA wajib brief di akhir video');
  }

  patch.humanSummary =
    summaries.length > 0
      ? summaries.join('; ')
      : `Penyesuaian regenerasi sesuai instruksi: "${userPrompt.slice(0, 120)}"`;

  return EdlPatchSchema.parse(patch);
}

export function applyEdlPatch(currentEdl: EdlDocument, patch: EdlPatch): EdlDocument {
  const merged: EdlDocument = {
    ...currentEdl,
    framingMode: patch.framingMode ?? currentEdl.framingMode,
    segments: patch.segmentsPatch ?? currentEdl.segments,
    audio: patch.audioPatch ? { ...currentEdl.audio, ...patch.audioPatch } : currentEdl.audio,
    hookBanner: patch.hookBannerPatch ? { ...currentEdl.hookBanner, ...patch.hookBannerPatch } : currentEdl.hookBanner,
    captions: patch.captionsPatch ? { ...currentEdl.captions, ...patch.captionsPatch } : currentEdl.captions,
    supportingOverlays: patch.supportingOverlaysPatch
      ? { ...currentEdl.supportingOverlays, ...patch.supportingOverlaysPatch }
      : currentEdl.supportingOverlays,
    complianceOverlays: patch.complianceOverlaysPatch
      ? { ...currentEdl.complianceOverlays, ...patch.complianceOverlaysPatch }
      : currentEdl.complianceOverlays
  };

  return EdlSchema.parse(merged);
}

export async function planEdlPatchWithPrompt(params: {
  userId: string;
  currentEdl: EdlDocument;
  userPrompt: string;
  presetCodes: string[];
  subtitleOverrides?: SubtitleOverrideInput[];
  targetConfig: TargetConfig;
  rulebook: BriefRulebook | null;
}): Promise<{ patch: EdlPatch; patchedEdl: EdlDocument; mode: 'ai' | 'local_deterministic' }> {
  const deterministicPatch = buildDeterministicEdlPatch(params);
  const brainKey = await getActiveKeyForRole(params.userId, 'brain');

  if (!brainKey || !params.userPrompt.trim()) {
    return {
      patch: deterministicPatch,
      patchedEdl: applyEdlPatch(params.currentEdl, deterministicPatch),
      mode: 'local_deterministic'
    };
  }

  const systemPrompt =
    'Anda adalah Video EDL Patcher. Ubah instruksi revisi user menjadi JSON EdlPatch parsial yang hanya memodifikasi bagian yang diminta ' +
    'tanpa merusak bagian lain. Field yang valid: { "humanSummary": string, "framingMode"?, "audioPatch"?, "segmentsPatch"?, "hookBannerPatch"?, "captionsPatch"?, "supportingOverlaysPatch"?, "complianceOverlaysPatch"? }.';

  try {
    const res = await generateStructuredJsonWithByok({
      key: brainKey,
      systemPrompt,
      userPrompt: JSON.stringify({
        userPrompt: params.userPrompt,
        presetCodes: params.presetCodes,
        currentEdl: params.currentEdl,
        briefRulebook: params.rulebook,
        deterministicHint: deterministicPatch
      }),
      temperature: 0.2
    });
    const aiPatch = EdlPatchSchema.parse(res.json);
    // Pastikan override subtitle manual user & audio preset eksplisit tidak pernah hilang
    if (params.subtitleOverrides && params.subtitleOverrides.length > 0) {
      aiPatch.captionsPatch = { ...(aiPatch.captionsPatch ?? {}), overrides: params.subtitleOverrides };
    }
    if (deterministicPatch.audioPatch && !aiPatch.audioPatch) {
      aiPatch.audioPatch = deterministicPatch.audioPatch;
    }

    return {
      patch: aiPatch,
      patchedEdl: applyEdlPatch(params.currentEdl, aiPatch),
      mode: 'ai'
    };
  } catch {
    return {
      patch: deterministicPatch,
      patchedEdl: applyEdlPatch(params.currentEdl, deterministicPatch),
      mode: 'local_deterministic'
    };
  }
}
