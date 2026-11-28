import type {
  CreateClipAnnotationInput,
  ServiceResult,
  UpdateClipAnnotationInput
} from '@clip/shared';
import { prisma } from '../config/prisma.js';

export const annotationService = {
  async listByClip(userId: string, clipId: string): Promise<ServiceResult<unknown>> {
    const clip = await prisma.clip.findFirst({
      where: { id: clipId, batch: { campaign: { userId } } },
      select: { id: true }
    });
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const rows = await prisma.clipAnnotation.findMany({
      where: { clipId },
      orderBy: [{ timestampSec: 'asc' }, { createdAt: 'asc' }]
    });

    return { ok: true, data: rows };
  },

  async create(
    userId: string,
    clipId: string,
    input: CreateClipAnnotationInput
  ): Promise<ServiceResult<unknown>> {
    const clip = await prisma.clip.findFirst({
      where: { id: clipId, batch: { campaign: { userId } } },
      select: { id: true, activeVersionId: true }
    });
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const created = await prisma.clipAnnotation.create({
      data: {
        clipId: clip.id,
        versionId: input.versionId ?? clip.activeVersionId,
        timestampSec: Math.round(input.timestampSec * 100) / 100,
        xPct: Math.round(input.xPct * 10) / 10,
        yPct: Math.round(input.yPct * 10) / 10,
        category: input.category,
        noteText: input.noteText.trim(),
        status: 'open'
      }
    });

    return { ok: true, data: created };
  },

  async update(
    userId: string,
    annotationId: string,
    input: UpdateClipAnnotationInput
  ): Promise<ServiceResult<unknown>> {
    const existing = await prisma.clipAnnotation.findFirst({
      where: {
        id: annotationId,
        clip: { batch: { campaign: { userId } } }
      }
    });
    if (!existing) {
      return {
        ok: false,
        code: 'ANNOTATION_NOT_FOUND',
        message: 'Catatan anotasi frame tidak ditemukan.',
        statusCode: 404
      };
    }

    const updated = await prisma.clipAnnotation.update({
      where: { id: existing.id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.noteText !== undefined ? { noteText: input.noteText.trim() } : {}),
        ...(input.category !== undefined ? { category: input.category } : {})
      }
    });

    return { ok: true, data: updated };
  },

  async remove(userId: string, annotationId: string): Promise<ServiceResult<{ deleted: true }>> {
    const existing = await prisma.clipAnnotation.findFirst({
      where: {
        id: annotationId,
        clip: { batch: { campaign: { userId } } }
      }
    });
    if (!existing) {
      return {
        ok: false,
        code: 'ANNOTATION_NOT_FOUND',
        message: 'Catatan anotasi frame tidak ditemukan.',
        statusCode: 404
      };
    }

    await prisma.clipAnnotation.delete({ where: { id: existing.id } });
    return { ok: true, data: { deleted: true } };
  }
};
