import fs from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { BriefRulebookSchema, type BriefRulebook, type PlatformTarget } from '@clip/shared';
import { generateStructuredJsonWithByok, getActiveKeyForRole } from './ai/llm-json.adapter.js';

export interface ExtractedBriefText {
  sourceType: 'pdf' | 'docx' | 'doc' | 'text';
  rawText: string;
  isLikelyScannedPdf: boolean;
}

function extractPrintableTextFromLegacyDoc(buffer: Buffer): string {
  // Ekstraksi teks fallback untuk berkas .doc biner lama (ASCII/UTF-8 chunks)
  const latin = buffer.toString('latin1');
  const matches = latin.match(/[A-Za-z0-9@#.,:;!?()/%&'"\-+\s]{16,}/g) ?? [];
  return matches
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter((chunk) => /[a-zA-Z]{3,}/.test(chunk))
    .join('\n')
    .slice(0, 30000)
    .trim();
}

export async function extractRawTextFromBriefFile(
  filePath: string,
  originalFilename: string
): Promise<ExtractedBriefText> {
  const ext = path.extname(originalFilename).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (ext === '.pdf') {
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
    const rawText = (Array.isArray(result.text) ? result.text.join('\n') : String(result.text ?? '')).trim();
    return {
      sourceType: 'pdf',
      rawText,
      isLikelyScannedPdf: rawText.length < 30
    };
  }

  if (ext === '.docx') {
    const res = await mammoth.extractRawText({ buffer });
    return {
      sourceType: 'docx',
      rawText: res.value.trim(),
      isLikelyScannedPdf: false
    };
  }

  if (ext === '.doc') {
    return {
      sourceType: 'doc',
      rawText: extractPrintableTextFromLegacyDoc(buffer),
      isLikelyScannedPdf: false
    };
  }

  return {
    sourceType: 'text',
    rawText: buffer.toString('utf8').trim(),
    isLikelyScannedPdf: false
  };
}

export function buildHeuristicRulebook(rawText: string): BriefRulebook {
  const lower = rawText.toLowerCase();
  const platforms: PlatformTarget[] = [];
  if (lower.includes('tiktok')) platforms.push('tiktok');
  if (lower.includes('shorts') || lower.includes('short')) platforms.push('youtube_shorts');
  if (lower.includes('youtube') && !platforms.includes('youtube_shorts')) platforms.push('youtube_long');
  if (platforms.length === 0) platforms.push('tiktok', 'youtube_shorts');

  const hashtags = Array.from(new Set(rawText.match(/#[A-Za-z0-9_]+/g) ?? [])).slice(0, 10);
  const mentions = Array.from(
    new Set((rawText.match(/@[A-Za-z0-9_.]+/g) ?? []).map((m) => m.replace(/\.+$/, '')).filter((m) => m.length > 1))
  ).slice(0, 8);

  const durMatch = rawText.match(/(\d{1,3})\s*(?:-|s\/d|to|hingga|sampai)\s*(\d{1,3})\s*(?:detik|sec|s\b)/i);
  const minSec = durMatch ? Math.max(5, Number(durMatch[1])) : 15;
  const maxSec = durMatch ? Math.max(minSec + 5, Number(durMatch[2])) : 60;

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*\u2022\d.)\s]+/, '').trim())
    .filter((l) => l.length >= 6);

  const mandatoryDos: string[] = [];
  const strictDonts: string[] = [];

  for (const line of lines) {
    const l = line.toLowerCase();
    if (/(dilarang|jangan|hindari|tidak boleh|do not|don't|avoid|prohibited)/i.test(l)) {
      strictDonts.push(line.slice(0, 160));
    } else if (/(wajib|harus|sertakan|tampilkan|cta|must|required|include|mention)/i.test(l)) {
      mandatoryDos.push(line.slice(0, 160));
    }
  }

  if (mandatoryDos.length === 0) {
    mandatoryDos.push('Patuhi pesan inti brand dan tampilkan CTA di akhir video sesuai brief.');
  }
  if (strictDonts.length === 0) {
    strictDonts.push('Dilarang membuat klaim berlebihan atau menggunakan audio berhak cipta tanpa izin.');
  }

  const firstGoalLine = lines[0]?.slice(0, 180) || 'Membuat konten short-form sesuai brief campaign Content Rewards.';

  return BriefRulebookSchema.parse({
    campaignGoal: firstGoalLine,
    targetPlatforms: platforms,
    durationRules: {
      minSec,
      maxSec,
      idealSec: Math.round((minSec + maxSec) / 2)
    },
    mandatoryDos: mandatoryDos.slice(0, 8),
    strictDonts: strictDonts.slice(0, 8),
    requiredHashtags: hashtags,
    requiredMentions: mentions,
    brandTone: lower.includes('formal') || lower.includes('profesional')
      ? 'Profesional & Informatif'
      : 'Enerjik, Ringkas & Natural'
  });
}

export async function parseBriefTextToRulebook(params: {
  userId: string;
  rawText: string;
}): Promise<{ rulebook: BriefRulebook; extractionMode: 'ai' | 'local_heuristic'; note: string }> {
  const { userId, rawText } = params;
  const fallback = buildHeuristicRulebook(rawText);

  if (rawText.trim().length < 20) {
    return {
      rulebook: fallback,
      extractionMode: 'local_heuristic',
      note: 'Teks brief terlalu singkat atau hasil scan gambar. Silakan tempel teks brief atau lengkapi aturan secara manual.'
    };
  }

  const brainKey = await getActiveKeyForRole(userId, 'brain');
  if (!brainKey) {
    return {
      rulebook: fallback,
      extractionMode: 'local_heuristic',
      note: 'Diekstrak otomatis secara lokal karena belum ada kunci AI (Otak Analisis) aktif. Silakan tinjau dan sunting jika perlu.'
    };
  }

  const systemPrompt =
    'Anda adalah Analis Brief Campaign Content Rewards. Ekstrak dokumen brief menjadi JSON murni yang mematuhi persis skema berikut: ' +
    '{ "campaignGoal": string, "targetPlatforms": ("tiktok"|"youtube_shorts"|"youtube_long")[], ' +
    '"durationRules": { "minSec": number, "maxSec": number, "idealSec": number }, ' +
    '"mandatoryDos": string[], "strictDonts": string[], "requiredHashtags": string[], ' +
    '"requiredMentions": string[], "brandTone": string }. Gunakan Bahasa Indonesia ringkas untuk penjelasan.';

  try {
    const aiResult = await generateStructuredJsonWithByok({
      key: brainKey,
      systemPrompt,
      userPrompt: `Teks Brief Campaign:\n\n${rawText.slice(0, 20000)}`
    });
    const validated = BriefRulebookSchema.parse(aiResult.json);
    return {
      rulebook: validated,
      extractionMode: 'ai',
      note: `Diekstrak otomatis oleh ${brainKey.provider.toUpperCase()} (${brainKey.defaultModel}). Silakan verifikasi sebelum konfirmasi.`
    };
  } catch {
    return {
      rulebook: fallback,
      extractionMode: 'local_heuristic',
      note: 'Ekstraksi AI sementara tidak merespons; dialihkan ke ekstraktor lokal agar Anda tetap bisa meninjau dan menyunting aturan brief.'
    };
  }
}
