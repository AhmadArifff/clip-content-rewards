import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const AUTH_COOKIE_NAME = 'clip_studio_token';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const token = cookieToken || bearerToken;

  if (!token) {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Sesi login tidak ditemukan. Silakan masuk terlebih dahulu.'
      }
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({
      success: false,
      data: null,
      error: {
        code: 'INVALID_SESSION',
        message: 'Sesi Anda telah berakhir. Silakan login kembali.'
      }
    });
  }
}
