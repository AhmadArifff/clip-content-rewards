import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { TranscriptPayload, WordTimestamp } from '@clip/shared';
import { env } from '../../config/env.js';
import { resolveSafeStoragePath } from '../../config/storage.js';
import { sanitizeSecretFromText } from '../../utils/crypto.js';
import {
  extractJsonObject,
  getGeminiWaterfallModels,
  paceGeminiRequest,
  type ActiveAiKeyRecord
} from './llm-json.adapter.js';

const WHISPER_CHUNK_DURATION_SEC = 600; // 10 menit (~4.8 MB pada 64kbps mono, jauh di bawah 25 MB Whisper)
const GEMINI_CHUNK_DURATION_SEC = 180; // 3 menit (~720 KB pada 32kbps mono, super hemat token Free Tier Gemini)
const CHUNK_OVERLAP_SEC = 2;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg audio extract gagal (${code}): ${stderr.slice(-240)}`));
    });
  });
}

export function interpolatePhraseToWords(
  segments: Array<{ startSec: number; endSec: number; text: string }>,
  maxDurationSec: number
): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  const safeMax = Math.max(0.5, maxDurationSec);

  for (const seg of segments) {
    const tokens = String(seg.text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
    if (tokens.length === 0) continue;

    const start = Math.max(0, Math.min(safeMax - 0.1, Number(seg.startSec) || 0));
    const rawEnd = Number(seg.endSec) || start + tokens.length * 0.32;
    const end = Math.max(start + 0.15, Math.min(safeMax, rawEnd));
    const step = (end - start) / tokens.length;

    tokens.forEach((word, idx) => {
      const wStart = Math.round((start + idx * step) * 100) / 100;
      const wEnd = Math.round(Math.min(end, start + (idx + 1) * step) * 100) / 100;
      words.push({
        word,
        startSec: wStart,
        endSec: Math.max(wStart + 0.05, wEnd)
      });
    });
  }

  return words;
}

async function transcribeChunkWithGemini(
  key: ActiveAiKeyRecord,
  fileBuf: Buffer,
  chunkDurationSec: number,
  signal: AbortSignal
): Promise<{ text: string; language?: string; words: WordTimestamp[] }> {
  const base64Audio = fileBuf.toString('base64');
  // Prioritaskan model flash & flash-lite agar sangat hemat kuota Free Tier Google AI Studio
  const candidateModels = getGeminiWaterfallModels(
    key.defaultModel.includes('pro') ? 'gemini-2.5-flash' : key.defaultModel
  );

  const instruction =
    'Transkripsikan seluruh ucapan pada audio ini secara akurat dalam bahasa aslinya (Indonesia/Inggris/campuran). ' +
    'Kembalikan HANYA JSON valid dengan format: ' +
    '{"language":"id","segments":[{"startSec":0.0,"endSec":2.5,"text":"kalimat pendek 3-6 kata"}]}. ' +
    'Pecah menjadi segmen pendek 2-4 detik agar sinkron untuk subtitle video vertikal. ' +
    'Jika audio tidak mengandung ucapan manusia (hanya musik/hening), kembalikan {"language":"none","segments":[]}.';

  let lastErr: Error = new Error('Gemini Audio STT gagal merespons');

  for (const model of candidateModels) {
    await paceGeminiRequest();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key.rawApiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: instruction },
              {
                inlineData: {
                  mimeType: 'audio/mp3',
                  data: base64Audio
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      })
    });

    if (res.ok) {
      const body = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const parsed = extractJsonObject(rawText) as {
        language?: string;
        segments?: Array<{ startSec?: number; endSec?: number; text?: string }>;
      };
      const segs = (parsed.segments ?? [])
        .map((s) => ({
          startSec: Number(s.startSec ?? 0),
          endSec: Number(s.endSec ?? 0),
          text: String(s.text ?? '').trim()
        }))
        .filter((s) => s.text.length > 0);

      const words = interpolatePhraseToWords(segs, chunkDurationSec);
      const fullText = segs.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
      return {
        text: fullText,
        language: parsed.language && parsed.language !== 'none' ? parsed.language : undefined,
        words
      };
    }

    lastErr = new Error(`Gemini Audio STT HTTP ${res.status} (${model})`);
    if (res.status === 429 || res.status === 503 || res.status === 404) {
      continue;
    }
    throw lastErr;
  }

  throw lastErr;
}

async function transcribeSingleChunk(
  key: ActiveAiKeyRecord,
  chunkPath: string,
  chunkDurationSec: number
): Promise<{ text: string; language?: string; words: WordTimestamp[] }> {
  const fileBuf = fs.readFileSync(chunkPath);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    if (key.provider === 'gemini') {
      return await transcribeChunkWithGemini(key, fileBuf, chunkDurationSec, controller.signal);
    }

    if (key.provider === 'deepgram') {
      const res = await fetch(
        `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(key.defaultModel)}&smart_format=true&detect_language=true`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${key.rawApiKey}`,
            'Content-Type': 'audio/mpeg'
          },
          body: fileBuf,
          signal: controller.signal
        }
      );
      if (!res.ok) throw new Error(`Deepgram HTTP ${res.status}`);
      const json = (await res.json()) as {
        results?: {
          channels?: Array<{
            detected_language?: string;
            alternatives?: Array<{
              transcript?: string;
              words?: Array<{ word?: string; punctuated_word?: string; start?: number; end?: number }>;
            }>;
          }>;
        };
      };
      const ch = json.results?.channels?.[0];
      const alt = ch?.alternatives?.[0];
      const words: WordTimestamp[] = (alt?.words ?? []).map((w) => ({
        word: w.punctuated_word || w.word || '',
        startSec: Number(w.start ?? 0),
        endSec: Number(w.end ?? 0)
      }));
      return {
        text: alt?.transcript ?? '',
        language: ch?.detected_language,
        words
      };
    }

    // Groq Whisper atau OpenAI Whisper multipart API
    const endpoint =
      key.provider === 'groq'
        ? 'https://api.groq.com/openai/v1/audio/transcriptions'
        : 'https://api.openai.com/v1/audio/transcriptions';

    const form = new FormData();
    form.append('file', new Blob([fileBuf], { type: 'audio/mpeg' }), path.basename(chunkPath));
    form.append('model', key.defaultModel);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key.rawApiKey}` },
      body: form,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`${key.provider.toUpperCase()} STT HTTP ${res.status}`);

    const json = (await res.json()) as {
      text?: string;
      language?: string;
      words?: Array<{ word?: string; start?: number; end?: number }>;
      segments?: Array<{ text?: string; start?: number; end?: number }>;
    };

    const words: WordTimestamp[] =
      json.words && json.words.length > 0
        ? json.words.map((w) => ({
            word: String(w.word ?? '').trim(),
            startSec: Number(w.start ?? 0),
            endSec: Number(w.end ?? 0)
          }))
        : (json.segments ?? []).map((seg) => ({
            word: String(seg.text ?? '').trim(),
            startSec: Number(seg.start ?? 0),
            endSec: Number(seg.end ?? 0)
          }));

    return {
      text: String(json.text ?? '').trim(),
      language: json.language,
      words: words.filter((w) => w.word.length > 0)
    };
  } catch (err) {
    const safe = err instanceof Error ? sanitizeSecretFromText(err.message, [key.rawApiKey]) : 'STT error';
    throw new Error(safe);
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeMediaWithAutoChunking(params: {
  mediaId: string;
  mediaRelativePath: string;
  durationSec: number;
  sttKey: ActiveAiKeyRecord;
}): Promise<TranscriptPayload> {
  const { mediaId, mediaRelativePath, durationSec, sttKey } = params;
  const inputAbsPath = resolveSafeStoragePath(mediaRelativePath);
  const tempWorkDir = resolveSafeStoragePath(`temp/stt_${mediaId}_${Date.now()}`);
  fs.mkdirSync(tempWorkDir, { recursive: true });

  const isGeminiStt = sttKey.provider === 'gemini';
  const chunkDurLimit = isGeminiStt ? GEMINI_CHUNK_DURATION_SEC : WHISPER_CHUNK_DURATION_SEC;
  const audioBitrate = isGeminiStt ? '32k' : '64k';

  const mergedWords: WordTimestamp[] = [];
  const textParts: string[] = [];
  let detectedLanguage: string | undefined;
  let chunkIndex = 0;

  try {
    const totalDur = Math.max(durationSec, 1);
    let offsetSec = 0;

    while (offsetSec < totalDur) {
      const segDur = Math.min(chunkDurLimit, totalDur - offsetSec);
      const chunkFile = path.join(tempWorkDir, `chunk_${String(chunkIndex).padStart(3, '0')}.mp3`);

      await runFfmpeg([
        '-y',
        '-ss',
        offsetSec.toFixed(2),
        '-t',
        segDur.toFixed(2),
        '-i',
        inputAbsPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-b:a',
        audioBitrate,
        chunkFile
      ]);

      const chunkRes = await transcribeSingleChunk(sttKey, chunkFile, segDur);
      if (!detectedLanguage && chunkRes.language) {
        detectedLanguage = chunkRes.language;
      }
      if (chunkRes.text) {
        textParts.push(chunkRes.text);
      }

      const lastAcceptedEnd = mergedWords.length > 0 ? mergedWords[mergedWords.length - 1].endSec : -1;
      for (const w of chunkRes.words) {
        const absStart = Math.round((w.startSec + offsetSec) * 100) / 100;
        const absEnd = Math.round((w.endSec + offsetSec) * 100) / 100;
        // Deduplikasi kata yang jatuh di zona overlap 2 detik
        if (chunkIndex > 0 && absStart < lastAcceptedEnd - 0.15) {
          continue;
        }
        mergedWords.push({ word: w.word, startSec: absStart, endSec: absEnd });
      }

      chunkIndex += 1;
      if (offsetSec + chunkDurLimit >= totalDur) break;
      offsetSec += chunkDurLimit - CHUNK_OVERLAP_SEC;
    }

    const fullText = textParts.join(' ').replace(/\s+/g, ' ').trim();
    if (!fullText && mergedWords.length === 0) {
      return {
        mode: 'visual_only',
        provider: sttKey.provider,
        language: detectedLanguage,
        fullText: '',
        chunksProcessed: chunkIndex,
        words: []
      };
    }

    return {
      mode: 'stt_word_level',
      provider: sttKey.provider,
      language: detectedLanguage,
      fullText,
      chunksProcessed: chunkIndex,
      words: mergedWords
    };
  } finally {
    fs.rmSync(tempWorkDir, { recursive: true, force: true });
  }
}
