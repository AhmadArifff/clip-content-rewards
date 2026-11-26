import type { AiProvider } from '@clip/shared';
import { prisma } from '../../config/prisma.js';
import { decryptSecret, sanitizeSecretFromText } from '../../utils/crypto.js';

export interface ActiveAiKeyRecord {
  id: string;
  provider: AiProvider;
  defaultModel: string;
  rawApiKey: string;
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

function extractJsonObject(rawText: string): unknown {
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

export async function generateStructuredJsonWithByok(params: {
  key: ActiveAiKeyRecord;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ json: unknown; tokensUsed: number }> {
  const { key, systemPrompt, userPrompt, temperature = 0.2, timeoutMs = 45000 } = params;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let rawContent = '';
    let tokensUsed = 0;

    if (key.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(key.defaultModel)}:generateContent?key=${encodeURIComponent(key.rawApiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature,
            responseMimeType: 'application/json'
          }
        })
      });
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const body = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { totalTokenCount?: number };
      };
      rawContent = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      tokensUsed = body.usageMetadata?.totalTokenCount ?? 0;
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
          max_tokens: 4096,
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
      tokensUsed
    };
  } catch (err) {
    const msg = err instanceof Error ? sanitizeSecretFromText(err.message, [key.rawApiKey]) : 'AI request error';
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}
