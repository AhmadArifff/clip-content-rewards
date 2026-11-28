import { prisma } from '../config/prisma.js';

export const pacingRepository = {
  listByUser(userId: string) {
    return prisma.referencePacingProfile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.referencePacingProfile.findFirst({
      where: { id, userId }
    });
  },

  create(data: {
    userId: string;
    name: string;
    sourceFilename: string;
    durationSec: number;
    width?: number | null;
    height?: number | null;
    fps?: number | null;
    shotCount: number;
    avgShotDurationSec: number;
    cutsPerMinute: number;
    estimatedBpm: number;
    energyCurve: string;
    pacingBlueprintJson: string;
  }) {
    return prisma.referencePacingProfile.create({ data });
  },

  deleteById(id: string) {
    return prisma.referencePacingProfile.delete({ where: { id } });
  }
};
