import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { ServiceResult } from '@clip/shared';
import { env } from '../config/env.js';
import { userRepository } from '../repositories/user.repository.js';
import type { AuthTokenPayload } from '../middlewares/auth.middleware.js';

export interface AuthSessionData {
  user: { id: string; email: string; name: string; role: string };
  token: string;
}

function issueToken(user: { id: string; email: string; name: string; role: string }): string {
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn']
  });
}

export const authService = {
  async getSetupStatus(): Promise<ServiceResult<{ needsSetup: boolean }>> {
    const count = await userRepository.countUsers();
    return { ok: true, data: { needsSetup: count === 0 } };
  },

  async setupFirstAdmin(input: {
    name: string;
    email: string;
    password: string;
  }): Promise<ServiceResult<AuthSessionData>> {
    const existingCount = await userRepository.countUsers();
    if (existingCount > 0) {
      return {
        ok: false,
        code: 'SETUP_ALREADY_COMPLETED',
        message: 'Akun pemilik studio sudah terdaftar. Silakan masuk melalui halaman Login.',
        statusCode: 409
      };
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const created = await userRepository.createUser({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: 'admin'
    });

    const token = issueToken(created);
    return { ok: true, data: { user: created, token } };
  },

  async login(input: { email: string; password: string }): Promise<ServiceResult<AuthSessionData>> {
    const user = await userRepository.findByEmail(input.email.toLowerCase());
    if (!user) {
      return {
        ok: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email atau kata sandi tidak sesuai.',
        statusCode: 401
      };
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      return {
        ok: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Email atau kata sandi tidak sesuai.',
        statusCode: 401
      };
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };
    const token = issueToken(safeUser);
    return { ok: true, data: { user: safeUser, token } };
  },

  async getCurrentUser(userId: string): Promise<ServiceResult<{ id: string; email: string; name: string; role: string }>> {
    const user = await userRepository.findById(userId);
    if (!user) {
      return {
        ok: false,
        code: 'USER_NOT_FOUND',
        message: 'Profil pengguna tidak ditemukan.',
        statusCode: 404
      };
    }
    return { ok: true, data: user };
  }
};
