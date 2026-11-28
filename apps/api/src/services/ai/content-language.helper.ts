import type { ClipEndingMode, SilenceInterval, TargetConfig, WordTimestamp } from '@clip/shared';

export interface ResolvedContentLanguage {
  code: 'en' | 'id';
  label: string;
  defaultLanguageStyle: string;
}

const COUNTRY_LANGUAGE_META: Record<string, ResolvedContentLanguage> = {
  ID: {
    code: 'id',
    label: 'Bahasa Indonesia',
    defaultLanguageStyle: 'Bahasa Indonesia Santai'
  },
  US: {
    code: 'en',
    label: 'English (US)',
    defaultLanguageStyle: 'English (US Casual & Punchy)'
  },
  UK: {
    code: 'en',
    label: 'English (UK)',
    defaultLanguageStyle: 'English (UK Conversational)'
  },
  GB: {
    code: 'en',
    label: 'English (UK)',
    defaultLanguageStyle: 'English (UK Conversational)'
  },
  AU: {
    code: 'en',
    label: 'English (AU)',
    defaultLanguageStyle: 'English (AU Casual)'
  },
  CA: {
    code: 'en',
    label: 'English (Canada)',
    defaultLanguageStyle: 'English (North America Casual)'
  },
  SG: {
    code: 'en',
    label: 'English (International)',
    defaultLanguageStyle: 'English (International Clean)'
  },
  MY: {
    code: 'en',
    label: 'English (International)',
    defaultLanguageStyle: 'English (International Clean)'
  },
  GLOBAL: {
    code: 'en',
    label: 'English (International)',
    defaultLanguageStyle: 'English (International Viral)'
  }
};

export function getDefaultLanguageStyleForCountry(countryCode: string): string {
  const upper = (countryCode || 'ID').trim().toUpperCase();
  return COUNTRY_LANGUAGE_META[upper]?.defaultLanguageStyle ?? 'English (International)';
}

// Kunci bahasa konten publik (teks layar, hook, CTA, judul, caption, hashtag) sesuai target negara
// agar algoritma OCR/NLP TikTok & YouTube tidak salah mengklasifikasikan video luar negeri ke pasar Indonesia.
export function resolveContentLanguage(targetConfig: Pick<TargetConfig, 'countryCode' | 'languageStyle'>): ResolvedContentLanguage {
  const country = (targetConfig.countryCode || 'ID').trim().toUpperCase();
  const styleLower = (targetConfig.languageStyle || '').toLowerCase();

  if (/\b(english|inggris|en-us|en-gb|us casual|international)\b/i.test(styleLower)) {
    const mapped = COUNTRY_LANGUAGE_META[country];
    if (mapped && mapped.code === 'en') return mapped;
    return {
      code: 'en',
      label: country === 'US' ? 'English (US)' : country === 'UK' ? 'English (UK)' : 'English (International)',
      defaultLanguageStyle: 'English (International)'
    };
  }

  if (country === 'ID') {
    return COUNTRY_LANGUAGE_META.ID;
  }

  return COUNTRY_LANGUAGE_META[country] ?? {
    code: 'en',
    label: `English (${country} / International)`,
    defaultLanguageStyle: 'English (International)'
  };
}

export interface SpeechBoundarySnapResult {
  startSec: number;
  endSec: number;
  snappedStart: boolean;
  snappedEnd: boolean;
  completedToTail: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function endsSentencePunctuation(word: string): boolean {
  return /[.!?…]["')\]»”]*$/.test(word.trim());
}

// Menyelaraskan batas potong startSec & endSec terhadap akhir kalimat (tanda baca / jeda bicara)
// agar pembicara tidak pernah terpotong di tengah kalimat secara mendadak.
export function snapSegmentToSpeechBoundary(params: {
  startSec: number;
  endSec: number;
  mediaDurationSec: number;
  words?: WordTimestamp[];
  silences?: SilenceInterval[];
  mode?: ClipEndingMode;
  maxAllowedEndSec?: number;
}): SpeechBoundarySnapResult {
  const mediaDur = Math.max(0.8, params.mediaDurationSec);
  const mode = params.mode ?? 'complete_story';
  const words = (params.words ?? []).filter((w) => w.endSec > w.startSec).sort((a, b) => a.startSec - b.startSec);
  const silences = (params.silences ?? []).filter((s) => s.endSec > s.startSec).sort((a, b) => a.startSec - b.startSec);

  if (mode === 'full_source') {
    return {
      startSec: 0,
      endSec: round2(mediaDur),
      snappedStart: false,
      snappedEnd: false,
      completedToTail: true
    };
  }

  let startSec = Math.max(0, Math.min(params.startSec, Math.max(0, mediaDur - 0.6)));
  let endSec = Math.min(mediaDur, Math.max(startSec + 0.6, params.endSec));
  const maxAllowed = Math.min(mediaDur, Math.max(endSec, params.maxAllowedEndSec ?? mediaDur));
  let snappedStart = false;
  let snappedEnd = false;
  let completedToTail = false;

  // 1. Selaraskan titik mulai (startSec) agar selalu dimulai di awal kalimat atau awal video
  if (startSec <= 0.35) {
    if (startSec > 0) snappedStart = true;
    startSec = 0;
  } else if (words.length > 0) {
    const sentenceStarts: number[] = [];
    for (let i = 0; i < words.length; i += 1) {
      if (i === 0) {
        sentenceStarts.push(words[i].startSec);
      } else {
        const prev = words[i - 1];
        const gap = words[i].startSec - prev.endSec;
        if (endsSentencePunctuation(prev.word) || gap >= 0.38) {
          sentenceStarts.push(words[i].startSec);
        }
      }
    }

    let bestStart: number | null = null;
    let bestDist = Infinity;
    for (const candidate of sentenceStarts) {
      if (candidate >= startSec - 2.6 && candidate <= startSec + 2.4 && candidate < endSec - 1.0) {
        const dist = Math.abs(candidate - startSec) + (candidate > startSec ? 0.15 : 0);
        if (dist < bestDist) {
          bestDist = dist;
          bestStart = candidate;
        }
      }
    }

    if (bestStart !== null) {
      startSec = Math.max(0, bestStart - 0.08);
      snappedStart = true;
    } else {
      const straddling = words.find((w) => w.startSec < startSec && w.endSec > startSec);
      if (straddling) {
        startSec = Math.max(0, straddling.startSec - 0.06);
        snappedStart = true;
      }
    }
  } else if (silences.length > 0) {
    const nearSilence = silences.find((s) => s.endSec >= startSec - 2.5 && s.startSec <= startSec + 2.5 && s.endSec < endSec - 1.0);
    if (nearSilence) {
      startSec = Math.max(0, Math.min(nearSilence.endSec, nearSilence.startSec + nearSilence.durationSec * 0.75));
      snappedStart = true;
    }
  }

  // 2. Jika sisa ekor video tinggal <= 6.5 detik (dan masih muat batas aman), tuntaskan sampai selesai penuh
  const tailRemaining = mediaDur - endSec;
  if (mode === 'complete_story' && tailRemaining > 0 && tailRemaining <= 6.5 && mediaDur <= maxAllowed + 6.5) {
    endSec = mediaDur;
    snappedEnd = true;
    completedToTail = true;
  } else if (words.length > 0) {
    const sentenceEnds: number[] = [];
    for (let i = 0; i < words.length; i += 1) {
      const curr = words[i];
      const next = words[i + 1];
      const gap = next ? next.startSec - curr.endSec : 1.0;
      if (!next || endsSentencePunctuation(curr.word) || gap >= 0.38) {
        sentenceEnds.push(curr.endSec);
      }
    }

    // Prioritaskan mencari akhir kalimat ke DEPAN (hingga +6s) agar pembicara selesai berbicara tuntas
    const forwardLimit = Math.min(mediaDur, Math.max(maxAllowed, endSec + 6.0));
    const forwardCandidate = sentenceEnds.find((c) => c >= endSec - 0.1 && c <= forwardLimit && c > startSec + 0.8);
    if (forwardCandidate !== undefined) {
      endSec = Math.min(mediaDur, forwardCandidate + 0.18);
      snappedEnd = true;
    } else {
      // Jika tidak ada akhir kalimat di depan dalam batas, mundur ke akhir kalimat terdekat di belakang
      const backwardCandidates = sentenceEnds.filter((c) => c < endSec && c >= Math.max(startSec + 1.0, endSec - 5.0));
      if (backwardCandidates.length > 0) {
        endSec = Math.min(mediaDur, backwardCandidates[backwardCandidates.length - 1] + 0.18);
        snappedEnd = true;
      } else {
        // Minimal jangan potong di tengah satu kata
        const straddlingEnd = words.find((w) => w.startSec < endSec && w.endSec > endSec);
        if (straddlingEnd) {
          endSec = Math.min(mediaDur, straddlingEnd.endSec + 0.15);
          snappedEnd = true;
        }
      }
    }
  } else if (silences.length > 0) {
    const forwardSilence = silences.find((s) => s.startSec >= endSec - 0.5 && s.startSec <= Math.min(mediaDur, endSec + 5.5) && s.startSec > startSec + 0.8);
    if (forwardSilence) {
      endSec = Math.min(mediaDur, forwardSilence.startSec + Math.min(0.25, forwardSilence.durationSec * 0.5));
      snappedEnd = true;
    } else {
      const backwardSilences = silences.filter((s) => s.startSec < endSec && s.startSec >= Math.max(startSec + 1.0, endSec - 4.0));
      if (backwardSilences.length > 0) {
        const picked = backwardSilences[backwardSilences.length - 1];
        endSec = Math.min(mediaDur, picked.startSec + Math.min(0.25, picked.durationSec * 0.5));
        snappedEnd = true;
      }
    }
  }

  const finalStart = round2(Math.max(0, Math.min(startSec, Math.max(0, mediaDur - 0.6))));
  const finalEnd = round2(Math.min(mediaDur, Math.max(finalStart + 0.6, endSec)));
  if (mediaDur - finalEnd <= 0.25) {
    completedToTail = true;
  }

  return {
    startSec: finalStart,
    endSec: finalEnd,
    snappedStart,
    snappedEnd,
    completedToTail
  };
}
