import { prisma } from '../config/prisma.js';

export const apiKeyRepository = {
  listByUser(userId: string) {
    return prisma.apiKey.findMany({
      where: { userId },
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        provider: true,
        role: true,
        label: true,
        maskedPreview: true,
        defaultModel: true,
        isActive: true,
        lastTestedAt: true,
        lastTestOk: true,
        createdAt: true,
        updatedAt: true
      }
    });
  },

  findRawForUser(id: string, userId: string) {
    return prisma.apiKey.findFirst({
      where: { id, userId }
    });
  },

  create(data: {
    userId: string;
    provider: string;
    role: string;
    label: string;
    encryptedKey: string;
    iv: string;
    authTag: string;
    maskedPreview: string;
    defaultModel: string;
  }) {
    return prisma.apiKey.create({
      data,
      select: {
        id: true,
        provider: true,
        role: true,
        label: true,
        maskedPreview: true,
        defaultModel: true,
        isActive: true,
        lastTestedAt: true,
        lastTestOk: true,
        createdAt: true
      }
    });
  },

  updateTestStatus(id: string, ok: boolean) {
    return prisma.apiKey.update({
      where: { id },
      data: { lastTestedAt: new Date(), lastTestOk: ok },
      select: {
        id: true,
        provider: true,
        role: true,
        label: true,
        maskedPreview: true,
        defaultModel: true,
        isActive: true,
        lastTestedAt: true,
        lastTestOk: true
      }
    });
  },

  toggleActive(id: string, isActive: boolean) {
    return prisma.apiKey.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        provider: true,
        role: true,
        label: true,
        maskedPreview: true,
        defaultModel: true,
        isActive: true,
        lastTestedAt: true,
        lastTestOk: true
      }
    });
  },

  deleteById(id: string) {
    return prisma.apiKey.delete({ where: { id } });
  }
};
