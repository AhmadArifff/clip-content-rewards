import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { sanitizeSecretFromText } from '../utils/crypto.js';

export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Beberapa data yang Anda masukkan belum sesuai format.',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      }
    });
    return;
  }

  const rawMsg = err instanceof Error ? err.message : 'Terjadi kendala pada layanan lokal.';
  const safeMsg = sanitizeSecretFromText(rawMsg);
  console.error('[API Error]', safeMsg);

  res.status(500).json({
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.'
    }
  });
}
