import type { MasterPresetCategory, ServiceResult, TargetConfig } from '@clip/shared';
import { presetRepository } from '../repositories/preset.repository.js';

function serializePreset(row: {
  id: string;
  category: string;
  code: string;
  labelId: string;
  configJson: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.configJson) as Record<string, unknown>;
  } catch {
    config = {};
  }
  return {
    id: row.id,
    category: row.category,
    code: row.code,
    labelId: row.labelId,
    config,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export const presetService = {
  async listPresets(category?: string, onlyActive = false): Promise<ServiceResult<unknown>> {
    const rows = await presetRepository.listMasterPresets(category, onlyActive);
    return {
      ok: true,
      data: rows.map(serializePreset)
    };
  },

  async createPreset(input: {
    category: MasterPresetCategory;
    code: string;
    labelId: string;
    config: Record<string, unknown>;
    sortOrder: number;
    isActive: boolean;
  }): Promise<ServiceResult<unknown>> {
    const existing = await presetRepository.findMasterPresetByCategoryCode(input.category, input.code);
    if (existing) {
      return {
        ok: false,
        code: 'PRESET_DUPLICATE',
        message: 'Kode preset pada kategori tersebut sudah tersedia.',
        statusCode: 409
      };
    }

    const created = await presetRepository.createMasterPreset({
      category: input.category,
      code: input.code,
      labelId: input.labelId,
      configJson: JSON.stringify(input.config),
      sortOrder: input.sortOrder,
      isActive: input.isActive
    });

    return { ok: true, data: serializePreset(created) };
  },

  async updatePreset(
    id: string,
    input: {
      labelId?: string;
      config?: Record<string, unknown>;
      sortOrder?: number;
      isActive?: boolean;
    }
  ): Promise<ServiceResult<unknown>> {
    const existing = await presetRepository.findMasterPresetById(id);
    if (!existing) {
      return {
        ok: false,
        code: 'PRESET_NOT_FOUND',
        message: 'Data preset tidak ditemukan.',
        statusCode: 404
      };
    }

    const updated = await presetRepository.updateMasterPreset(id, {
      ...(input.labelId !== undefined ? { labelId: input.labelId } : {}),
      ...(input.config !== undefined ? { configJson: JSON.stringify(input.config) } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
    });

    return { ok: true, data: serializePreset(updated) };
  },

  async deletePreset(id: string): Promise<ServiceResult<{ deletedId: string }>> {
    const existing = await presetRepository.findMasterPresetById(id);
    if (!existing) {
      return {
        ok: false,
        code: 'PRESET_NOT_FOUND',
        message: 'Data preset tidak ditemukan.',
        statusCode: 404
      };
    }

    await presetRepository.deleteMasterPreset(id);
    return { ok: true, data: { deletedId: id } };
  },

  async listTargetProfiles(userId: string): Promise<ServiceResult<unknown>> {
    const rows = await presetRepository.listTargetProfiles(userId);
    const items = rows.map((row) => ({
      id: row.id,
      profileName: row.profileName,
      description: row.description,
      targetConfig: JSON.parse(row.targetConfigJson) as TargetConfig,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));
    return { ok: true, data: items };
  },

  async createTargetProfile(
    userId: string,
    input: {
      profileName: string;
      description?: string;
      targetConfig: TargetConfig;
      isDefault: boolean;
    }
  ): Promise<ServiceResult<unknown>> {
    const created = await presetRepository.createTargetProfile({
      userId,
      profileName: input.profileName,
      description: input.description,
      targetConfigJson: JSON.stringify(input.targetConfig),
      isDefault: input.isDefault
    });

    return {
      ok: true,
      data: {
        id: created.id,
        profileName: created.profileName,
        description: created.description,
        targetConfig: JSON.parse(created.targetConfigJson) as TargetConfig,
        isDefault: created.isDefault,
        createdAt: created.createdAt
      }
    };
  },

  async deleteTargetProfile(userId: string, id: string): Promise<ServiceResult<{ deletedId: string }>> {
    const existing = await presetRepository.findTargetProfile(id, userId);
    if (!existing) {
      return {
        ok: false,
        code: 'TARGET_PROFILE_NOT_FOUND',
        message: 'Profil target audiens tidak ditemukan.',
        statusCode: 404
      };
    }

    await presetRepository.deleteTargetProfile(id);
    return { ok: true, data: { deletedId: id } };
  }
};
