import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';

function getKeyBuffer(hexKey?: string): Buffer {
  const keyHex = hexKey ?? env.APP_ENCRYPTION_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('INVALID_ENCRYPTION_KEY_FORMAT');
  }
  return Buffer.from(keyHex, 'hex');
}

export interface EncryptedPayload {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

export function encryptSecret(plaintext: string, overrideHexKey?: string): EncryptedPayload {
  const key = getKeyBuffer(overrideHexKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedKey: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

export function decryptSecret(payload: EncryptedPayload, overrideHexKey?: string): string {
  const key = getKeyBuffer(overrideHexKey);
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');
  const ciphertext = Buffer.from(payload.encryptedKey, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskApiKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function sanitizeSecretFromText(text: string, knownSecrets: string[] = []): string {
  let safe = text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:key|api_key|apikey)=)[^&\s]+/gi, '$1[REDACTED]');

  for (const secret of knownSecrets) {
    if (secret && secret.length >= 6) {
      safe = safe.split(secret).join('[REDACTED]');
    }
  }
  return safe;
}
