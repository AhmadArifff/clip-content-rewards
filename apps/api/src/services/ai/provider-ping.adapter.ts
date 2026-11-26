import type { AiProvider } from '@clip/shared';
import { sanitizeSecretFromText } from '../../utils/crypto.js';

export interface ProviderPingResult {
  ok: boolean;
  statusMessage: string;
  latencyMs: number;
}

export async function pingAiProvider(
  provider: AiProvider,
  rawApiKey: string
): Promise<ProviderPingResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    let url = '';
    const headers: Record<string, string> = {};

    switch (provider) {
      case 'gemini':
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(rawApiKey)}`;
        break;
      case 'openai':
        url = 'https://api.openai.com/v1/models';
        headers.Authorization = `Bearer ${rawApiKey}`;
        break;
      case 'anthropic':
        url = 'https://api.anthropic.com/v1/models';
        headers['x-api-key'] = rawApiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
      case 'openrouter':
        url = 'https://openrouter.ai/api/v1/auth/key';
        headers.Authorization = `Bearer ${rawApiKey}`;
        break;
      case 'groq':
        url = 'https://api.groq.com/openai/v1/models';
        headers.Authorization = `Bearer ${rawApiKey}`;
        break;
      case 'deepgram':
        url = 'https://api.deepgram.com/v1/projects';
        headers.Authorization = `Token ${rawApiKey}`;
        break;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    const latencyMs = Date.now() - started;

    if (res.ok) {
      return {
        ok: true,
        statusMessage: `Koneksi ke ${provider.toUpperCase()} terverifikasi (${latencyMs} ms).`,
        latencyMs
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        statusMessage: 'API Key ditolak oleh penyedia layanan. Periksa kembali salinan kunci Anda.',
        latencyMs
      };
    }

    if (res.status === 429) {
      return {
        ok: false,
        statusMessage: 'Batas permintaan (rate limit) atau kuota penyedia API sedang habis.',
        latencyMs
      };
    }

    return {
      ok: false,
      statusMessage: `Penyedia merespons status HTTP ${res.status}. Silakan coba beberapa saat lagi.`,
      latencyMs
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const msg = err instanceof Error ? sanitizeSecretFromText(err.message, [rawApiKey]) : 'Network error';
    return {
      ok: false,
      statusMessage: msg.includes('abort')
        ? 'Koneksi ke penyedia AI melebihi batas waktu (8 detik). Periksa koneksi internet Anda.'
        : 'Gagal menghubungi server penyedia AI. Periksa koneksi internet Anda.',
      latencyMs
    };
  } finally {
    clearTimeout(timeout);
  }
}
