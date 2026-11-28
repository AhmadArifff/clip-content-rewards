import fs from 'node:fs';
import type { PacingBlueprint, ServiceResult } from '@clip/shared';
import { pacingRepository } from '../repositories/pacing.repository.js';
import { analyzeReferenceVideoPacing } from './media/pacing-analyzer.service.js';

function mapProfileRow(row: Awaited<ReturnType<typeof pacingRepository.listByUser>>[number]) {
  let blueprint: PacingBlueprint | null = null;
  try {
    blueprint = JSON.parse(row.pacingBlueprintJson) as PacingBlueprint;
  } catch {
    blueprint = null;
  }

  return {
    id: row.id,
    name: row.name,
    sourceFilename: row.sourceFilename,
    durationSec: row.durationSec,
    width: row.width,
    height: row.height,
    fps: row.fps,
    shotCount: row.shotCount,
    avgShotDurationSec: row.avgShotDurationSec,
    cutsPerMinute: row.cutsPerMinute,
    estimatedBpm: row.estimatedBpm,
    energyCurve: row.energyCurve,
    blueprint,
    createdAt: row.createdAt
  };
}

export const pacingService = {
  async list(userId: string): Promise<ServiceResult<ReturnType<typeof mapProfileRow>[]>> {
    const rows = await pacingRepository.listByUser(userId);
    return {
      ok: true,
      data: rows.map(mapProfileRow)
    };
  },

  async analyzeAndSave(
    userId: string,
    input: { name?: string; originalFilename: string; tempFilePath: string }
  ): Promise<ServiceResult<ReturnType<typeof mapProfileRow>>> {
    try {
      const analyzed = await analyzeReferenceVideoPacing(input.tempFilePath);
      const fallbackName = input.originalFilename.replace(/\.[^.]+$/, '').slice(0, 60) || 'Ritme Referensi';
      const cleanName = (input.name?.trim() || `Ritme ${fallbackName}`).slice(0, 90);

      const saved = await pacingRepository.create({
        userId,
        name: cleanName,
        sourceFilename: input.originalFilename,
        durationSec: analyzed.metadata.durationSec,
        width: analyzed.metadata.width,
        height: analyzed.metadata.height,
        fps: analyzed.metadata.fps,
        shotCount: analyzed.blueprint.shotCount,
        avgShotDurationSec: analyzed.blueprint.avgShotDurationSec,
        cutsPerMinute: analyzed.blueprint.cutsPerMinute,
        estimatedBpm: analyzed.blueprint.estimatedBpm,
        energyCurve: analyzed.blueprint.energyCurve,
        pacingBlueprintJson: JSON.stringify(analyzed.blueprint)
      });

      return {
        ok: true,
        data: mapProfileRow(saved)
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'INVALID_REFERENCE_VIDEO') {
        return {
          ok: false,
          code: 'INVALID_REFERENCE_VIDEO',
          message: 'Berkas yang diunggah bukan video valid atau durasinya kurang dari 1 detik.',
          statusCode: 400
        };
      }
      return {
        ok: false,
        code: 'PACING_ANALYSIS_FAILED',
        message: 'Gagal menganalisis ritme potongan video referensi.',
        statusCode: 422
      };
    } finally {
      // Guardrail Style-Only Cloning: berkas video referensi langsung dihapus setelah telemetri selesai
      fs.rmSync(input.tempFilePath, { force: true });
    }
  },

  async remove(userId: string, id: string): Promise<ServiceResult<{ deleted: boolean }>> {
    const found = await pacingRepository.findByIdForUser(id, userId);
    if (!found) {
      return {
        ok: false,
        code: 'PACING_PROFILE_NOT_FOUND',
        message: 'Profil ritme referensi tidak ditemukan.',
        statusCode: 404
      };
    }
    await pacingRepository.deleteById(found.id);
    return { ok: true, data: { deleted: true } };
  }
};
