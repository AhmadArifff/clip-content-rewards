import type { AiKeyRole, AiProvider, ServiceResult } from '@clip/shared';
import { apiKeyRepository } from '../repositories/api-key.repository.js';
import { decryptSecret, encryptSecret, maskApiKey } from '../utils/crypto.js';
import { pingAiProvider } from './ai/provider-ping.adapter.js';

export const PROVIDER_DEFAULT_MODELS: Record<AiProvider, { role: AiKeyRole; models: string[] }> = {
  gemini: { role: 'brain', models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'] },
  openai: { role: 'brain', models: ['gpt-4o-mini', 'gpt-4o', 'whisper-1'] },
  anthropic: { role: 'brain', models: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'] },
  openrouter: { role: 'brain', models: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'] },
  groq: { role: 'stt', models: ['whisper-large-v3-turbo', 'whisper-large-v3'] },
  deepgram: { role: 'stt', models: ['nova-3', 'nova-2'] }
};

export const apiKeyService = {
  async listKeys(userId: string): Promise<ServiceResult<unknown>> {
    const items = await apiKeyRepository.listByUser(userId);
    return {
      ok: true,
      data: {
        items,
        providerCatalog: PROVIDER_DEFAULT_MODELS
      }
    };
  },

  async createKey(
    userId: string,
    input: {
      provider: AiProvider;
      role: AiKeyRole;
      label: string;
      apiKey: string;
      defaultModel: string;
    }
  ): Promise<ServiceResult<unknown>> {
    const encrypted = encryptSecret(input.apiKey);
    const maskedPreview = maskApiKey(input.apiKey);

    const created = await apiKeyRepository.create({
      userId,
      provider: input.provider,
      role: input.role,
      label: input.label,
      encryptedKey: encrypted.encryptedKey,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      maskedPreview,
      defaultModel: input.defaultModel
    });

    return { ok: true, data: created };
  },

  async testConnection(
    userId: string,
    keyId: string
  ): Promise<ServiceResult<{ key: unknown; ping: { ok: boolean; statusMessage: string; latencyMs: number } }>> {
    const raw = await apiKeyRepository.findRawForUser(keyId, userId);
    if (!raw) {
      return {
        ok: false,
        code: 'API_KEY_NOT_FOUND',
        message: 'Kunci API tidak ditemukan.',
        statusCode: 404
      };
    }

    const plaintext = decryptSecret({
      encryptedKey: raw.encryptedKey,
      iv: raw.iv,
      authTag: raw.authTag
    });

    const ping = await pingAiProvider(raw.provider as AiProvider, plaintext);
    const updated = await apiKeyRepository.updateTestStatus(raw.id, ping.ok);

    return {
      ok: true,
      data: {
        key: updated,
        ping
      }
    };
  },

  async toggleActive(userId: string, keyId: string, isActive: boolean): Promise<ServiceResult<unknown>> {
    const raw = await apiKeyRepository.findRawForUser(keyId, userId);
    if (!raw) {
      return {
        ok: false,
        code: 'API_KEY_NOT_FOUND',
        message: 'Kunci API tidak ditemukan.',
        statusCode: 404
      };
    }

    const updated = await apiKeyRepository.toggleActive(raw.id, isActive);
    return { ok: true, data: updated };
  },

  async deleteKey(userId: string, keyId: string): Promise<ServiceResult<{ deletedId: string }>> {
    const raw = await apiKeyRepository.findRawForUser(keyId, userId);
    if (!raw) {
      return {
        ok: false,
        code: 'API_KEY_NOT_FOUND',
        message: 'Kunci API tidak ditemukan.',
        statusCode: 404
      };
    }

    await apiKeyRepository.deleteById(raw.id);
    return { ok: true, data: { deletedId: raw.id } };
  }
};
