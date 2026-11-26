import { prisma } from '../config/prisma.js';

export const presetRepository = {
  listMasterPresets(category?: string, onlyActive = false) {
    return prisma.masterPreset.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(onlyActive ? { isActive: true } : {})
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { labelId: 'asc' }]
    });
  },

  findMasterPresetById(id: string) {
    return prisma.masterPreset.findUnique({ where: { id } });
  },

  findMasterPresetByCategoryCode(category: string, code: string) {
    return prisma.masterPreset.findUnique({
      where: { category_code: { category, code } }
    });
  },

  createMasterPreset(data: {
    category: string;
    code: string;
    labelId: string;
    configJson: string;
    sortOrder: number;
    isActive: boolean;
  }) {
    return prisma.masterPreset.create({ data });
  },

  updateMasterPreset(
    id: string,
    data: {
      labelId?: string;
      configJson?: string;
      sortOrder?: number;
      isActive?: boolean;
    }
  ) {
    return prisma.masterPreset.update({ where: { id }, data });
  },

  deleteMasterPreset(id: string) {
    return prisma.masterPreset.delete({ where: { id } });
  },

  listTargetProfiles(userId: string) {
    return prisma.targetProfile.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }]
    });
  },

  findTargetProfile(id: string, userId: string) {
    return prisma.targetProfile.findFirst({ where: { id, userId } });
  },

  async createTargetProfile(data: {
    userId: string;
    profileName: string;
    description?: string;
    targetConfigJson: string;
    isDefault: boolean;
  }) {
    if (data.isDefault) {
      await prisma.targetProfile.updateMany({
        where: { userId: data.userId, isDefault: true },
        data: { isDefault: false }
      });
    }
    return prisma.targetProfile.create({ data });
  },

  deleteTargetProfile(id: string) {
    return prisma.targetProfile.delete({ where: { id } });
  }
};
