import { prisma } from '../config/prisma.js';

export const batchRepository = {
  createBatch(data: {
    campaignId: string;
    targetProfileId?: string | null;
    targetConfigJson: string;
    batchDiversityMode: string;
    requestedCount: number;
    estimatedTokens?: number | null;
  }) {
    return prisma.generationBatch.create({
      data: {
        ...data,
        status: 'queued'
      }
    });
  },

  findBatchDetailForUser(batchId: string, userId: string) {
    return prisma.generationBatch.findFirst({
      where: {
        id: batchId,
        campaign: { userId }
      },
      include: {
        campaign: {
          include: {
            brief: true,
            mediaAssets: true
          }
        },
        clips: {
          orderBy: { sequenceIndex: 'asc' },
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' }
            }
          }
        }
      }
    });
  },

  findBatchById(batchId: string) {
    return prisma.generationBatch.findUnique({
      where: { id: batchId },
      include: {
        campaign: {
          include: {
            brief: true,
            mediaAssets: true
          }
        },
        clips: {
          orderBy: { sequenceIndex: 'asc' },
          include: {
            versions: { orderBy: { versionNumber: 'desc' } }
          }
        }
      }
    });
  },

  updateBatch(
    batchId: string,
    data: { status?: string; actualTokens?: number }
  ) {
    return prisma.generationBatch.update({ where: { id: batchId }, data });
  },

  createClip(data: {
    batchId: string;
    sequenceIndex: number;
    angleTitle: string;
    hookSummary: string;
    status: string;
  }) {
    return prisma.clip.create({ data });
  },

  updateClip(
    clipId: string,
    data: { status?: string; activeVersionId?: string | null; errorMessage?: string | null; isApproved?: boolean }
  ) {
    return prisma.clip.update({ where: { id: clipId }, data });
  },

  findClipForUser(clipId: string, userId: string) {
    return prisma.clip.findFirst({
      where: {
        id: clipId,
        batch: { campaign: { userId } }
      },
      include: {
        batch: {
          include: {
            campaign: {
              include: { brief: true, mediaAssets: true }
            }
          }
        },
        versions: { orderBy: { versionNumber: 'desc' } }
      }
    });
  },

  createClipVersion(data: {
    clipId: string;
    versionNumber: number;
    userPrompt?: string | null;
    appliedPresetsJson?: string | null;
    edlJson: string;
    outputVideoPath?: string | null;
    outputSrtPath?: string | null;
    outputAssPath?: string | null;
    coverImagePath?: string | null;
    actualDurationSec?: number | null;
    viralScoreTotal?: number | null;
    briefCompliance?: string | null;
    scoreBreakdownJson?: string | null;
    impactCritiqueJson?: string | null;
    uploadPlaybookJson?: string | null;
    renderDurationMs?: number | null;
  }) {
    return prisma.clipVersion.create({ data });
  },

  updateClipVersion(
    versionId: string,
    data: {
      edlJson?: string;
      outputVideoPath?: string | null;
      outputSrtPath?: string | null;
      outputAssPath?: string | null;
      coverImagePath?: string | null;
      actualDurationSec?: number | null;
      viralScoreTotal?: number | null;
      briefCompliance?: string | null;
      scoreBreakdownJson?: string | null;
      impactCritiqueJson?: string | null;
      uploadPlaybookJson?: string | null;
      renderDurationMs?: number | null;
    }
  ) {
    return prisma.clipVersion.update({ where: { id: versionId }, data });
  },

  createRenderJob(data: { jobType: string; entityId: string; payloadJson: string; stageLabel: string }) {
    return prisma.renderJob.create({ data });
  },

  updateRenderJob(
    id: string,
    data: {
      status?: string;
      progressPct?: number;
      stageLabel?: string;
      errorMessage?: string | null;
      startedAt?: Date;
      finishedAt?: Date;
      retryCount?: number;
    }
  ) {
    return prisma.renderJob.update({ where: { id }, data });
  },

  listJobsByEntityIds(entityIds: string[]) {
    return prisma.renderJob.findMany({
      where: { entityId: { in: entityIds } },
      orderBy: { createdAt: 'desc' }
    });
  }
};
