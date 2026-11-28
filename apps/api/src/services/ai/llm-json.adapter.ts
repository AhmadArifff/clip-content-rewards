import type { AiProvider } from '@clip/shared';
import { prisma } from '../../config/prisma.js';
import { decryptSecret, sanitizeSecretFromText } from '../../utils/crypto.js';

export interface ActiveAiKeyRecord {
  id: string;
  provider: AiProvider;
  defaultModel: string;
  rawApiKey: string;
}

const GEMINI_FREE_WATERFALL = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
let lastGeminiCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getGeminiWaterfallModels(primaryModel: string): string[] {
  const ordered = [primaryModel.trim() || 'gemini-2.5-flash', ...GEMINI_FREE_WATERFALL];
  return Array.from(new Set(ordered));
}

export function compactTextForTokenBudget(rawText: string, maxChars: number): string {
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length <= maxChars) return normalized;

  // Pertahankan baris penting (hashtag, mention, durasi, wajib/dilarang) bila brief sangat panjang
  const lines = normalized.split('\n');
  const priorityLines: string[] = [];
  const otherLines: string[] = [];
  for (const line of lines) {
    if (/(#|@|wajib|harus|dilarang|jangan|durasi|detik|sec|tiktok|shorts|cta|must|don't)/i.test(line)) {
      priorityLines.push(line);
    } else {
      otherLines.push(line);
    }
  }

  let acc = priorityLines.join('\n');
  if (acc.length >= maxChars) {
    return acc.slice(0, maxChars).trim();
  }
  const remaining = maxChars - acc.length - 2;
  if (remaining > 80 && otherLines.length > 0) {
    const head = otherLines.join('\n').slice(0, remaining).trim();
    acc = `${head}\n\n${acc}`.trim();
  }
  return acc.slice(0, maxChars).trim();
}

export async function paceGeminiRequest(minGapMs?: number): Promise<void> {
  const gap =
    typeof minGapMs === 'number'
      ? minGapMs
      : process.env.VITEST || process.env.NODE_ENV === 'test'
        ? 0
        : 3800;
  if (gap <= 0) return;

  const elapsed = Date.now() - lastGeminiCallAt;
  if (lastGeminiCallAt > 0 && elapsed < gap) {
    await sleep(gap - elapsed);
  }
  lastGeminiCallAt = Date.now();
}

export async function getActiveKeyForRole(
  userId: string,
  role: 'brain' | 'stt' | 'tts'
): Promise<ActiveAiKeyRecord | null> {
  const row = await prisma.apiKey.findFirst({
    where: { userId, role, isActive: true },
    orderBy: [{ lastTestOk: 'desc' }, { updatedAt: 'desc' }]
  });
  if (!row) return null;

  const rawApiKey = decryptSecret({
    encryptedKey: row.encryptedKey,
    iv: row.iv,
    authTag: row.authTag
  });

  return {
    id: row.id,
    provider: row.provider as AiProvider,
    defaultModel: row.defaultModel,
    rawApiKey
  };
}

export function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Respons AI tidak mengandung objek JSON valid');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callGeminiWithWaterfall(params: {
  key: ActiveAiKeyRecord;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxOutputTokens: number;
  signal: AbortSignal;
  minGapMs?: number;
  retryDelayMs?: number;
}): Promise<{ rawContent: string; tokensUsed: number; usedModel: string }> {
  const models = getGeminiWaterfallModels(params.key.defaultModel);
  const baseRetryMs =
    typeof params.retryDelayMs === 'number'
      ? params.retryDelayMs
      : process.env.VITEST || process.env.NODE_ENV === 'test'
        ? 20
        : 3500;
  let lastError: Error = new Error('Gemini gagal merespons');

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await paceGeminiRequest(params.minGapMs);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.key.rawApiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: params.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: params.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: params.userPrompt }] }],
          generationConfig: {
            temperature: params.temperature,
            maxOutputTokens: params.maxOutputTokens,
            responseMimeType: 'application/json'
          }
        })
      });

      if (res.ok) {
        const body = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { totalTokenCount?: number };
        };
        return {
          rawContent: body.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
          tokensUsed: body.usageMetadata?.totalTokenCount ?? 0,
          usedModel: model
        };
      }

      lastError = new Error(`Gemini HTTP ${res.status} (${model})`);
      if (res.status === 429 || res.status === 503) {
        // Pada percobaan pertama tunggu sejenak, lalu pada percobaan kedua pindah ke model lebih ringan (waterfall)
        if (attempt === 0) {
          const retryAfterSec = Number(res.headers.get('retry-after') ?? '0');
          const waitMs =
            Number.isFinite(retryAfterSec) && retryAfterSec > 0 && retryAfterSec <= 12
              ? retryAfterSec * 1000
              : baseRetryMs;
          await sleep(waitMs);
          continue;
        }
        break;
      }

      // Status 404 (model tidak tersedia) -> coba model berikutnya dalam waterfall; error lain (400/401/403) hentikan
      if (res.status === 404) {
        break;
      }
      throw lastError;
    }
  }

  throw lastError;
}

export async function generateStructuredJsonWithByok(params: {
  key: ActiveAiKeyRecord;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  minGapMs?: number;
  retryDelayMs?: number;
}): Promise<{ json: unknown; tokensUsed: number; usedModel: string }> {
  const {
    key,
    systemPrompt,
    userPrompt,
    temperature = 0.2,
    maxOutputTokens = 2048,
    timeoutMs = 55000,
    minGapMs,
    retryDelayMs
  } = params;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let rawContent = '';
    let tokensUsed = 0;
    let usedModel = key.defaultModel;

    if (key.provider === 'gemini') {
      const gem = await callGeminiWithWaterfall({
        key,
        systemPrompt,
        userPrompt,
        temperature,
        maxOutputTokens,
        signal: controller.signal,
        minGapMs,
        retryDelayMs
      });
      rawContent = gem.rawContent;
      tokensUsed = gem.tokensUsed;
      usedModel = gem.usedModel;
    } else if (key.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key.rawApiKey,
          'anthropic-version': '2023-06-01'
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: key.defaultModel,
          max_tokens: maxOutputTokens,
          temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
      const body = (await res.json()) as {
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      rawContent = body.content?.[0]?.text ?? '';
      tokensUsed = (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0);
    } else {
      // OpenAI, OpenRouter, atau Groq chat completions compatible
      const endpoint =
        key.provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : key.provider === 'groq'
            ? 'https://api.groq.com/openai/v1/chat/completions'
            : 'https://api.openai.com/v1/chat/completions';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key.rawApiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: key.defaultModel,
          temperature,
          max_tokens: maxOutputTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });
      if (!res.ok) throw new Error(`${key.provider.toUpperCase()} HTTP ${res.status}`);
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };
      rawContent = body.choices?.[0]?.message?.content ?? '';
      tokensUsed = body.usage?.total_tokens ?? 0;
    }

    return {
      json: extractJsonObject(rawContent),
      tokensUsed,
      usedModel
    };
  } catch (err) {
    const msg = err instanceof Error ? sanitizeSecretFromText(err.message, [key.rawApiKey]) : 'AI request error';
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}
