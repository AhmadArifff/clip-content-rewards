import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '../../../..');
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1000).max(65535).default(4000),
  WEB_PORT: z.coerce.number().int().min(1000).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'APP_ENCRYPTION_KEY wajib 64 karakter hex (32 byte)'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET wajib minimal 32 karakter'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  MAX_RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(1),
  MAX_UPLOAD_MB: z.coerce.number().int().min(50).max(4096).default(2048)
});

export const env = EnvSchema.parse(process.env);
