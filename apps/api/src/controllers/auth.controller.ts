import type { NextFunction, Request, Response } from 'express';
import { AuthLoginInputSchema, AuthSetupInputSchema } from '@clip/shared';
import { AUTH_COOKIE_NAME } from '../middlewares/auth.middleware.js';
import { authService } from '../services/auth.service.js';
import { sendServiceResult } from '../utils/http.js';

function attachAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

export const authController = {
  async setupStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.getSetupStatus();
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async setup(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = AuthSetupInputSchema.parse(req.body);
      const result = await authService.setupFirstAdmin(parsed);
      if (result.ok) {
        attachAuthCookie(res, result.data.token);
        sendServiceResult(res, { ok: true, data: { user: result.data.user } }, 201);
        return;
      }
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = AuthLoginInputSchema.parse(req.body);
      const result = await authService.login(parsed);
      if (result.ok) {
        attachAuthCookie(res, result.data.token);
        sendServiceResult(res, { ok: true, data: { user: result.data.user } });
        return;
      }
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  },

  logout(_req: Request, res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    sendServiceResult(res, { ok: true, data: { loggedOut: true } });
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.getCurrentUser(req.user!.sub);
      sendServiceResult(res, result);
    } catch (err) {
      next(err);
    }
  }
};
