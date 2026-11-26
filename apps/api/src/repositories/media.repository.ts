import { prisma } from '../config/prisma.js';

export const mediaRepository = {
  listByCampaign(campaignId: string) {
    return prisma.mediaAsset.findMany({
      where: { campaignId },
      orderBy: [{ assetType: 'asc' }, { createdAt: 'desc' }]
    });
  },

  findByIdWithOwner(id: string, userId: string) {
    return prisma.mediaAsset.findFirst({
      where: {
        id,
        campaign: { userId }
      }
    });
  },

  create(data: {
    campaignId: string;
    assetType: string;
    originalFilename: string;
    filePath: string;
    mimeType: string;
    fileSizeBytes: number;
    durationSec?: number | null;
    width?: number | null;
    height?: number | null;
    fps?: number | null;
    hasAudio?: boolean;
    loudnessLufs?: number | null;
    audioDiagnosticJson?: string | null;
    silencesJson?: string | null;
    transcriptJson?: string | null;
    status: string;
    errorMessage?: string | null;
  }) {
    return prisma.mediaAsset.create({ data });
  },

  updateAnalysis(
    id: string,
    data: {
      durationSec?: number | null;
      width?: number | null;
      height?: number | null;
      fps?: number | null;
      hasAudio?: boolean;
      loudnessLufs?: number | null;
      audioDiagnosticJson?: string | null;
      silencesJson?: string | null;
      transcriptJson?: string | null;
      status: string;
      errorMessage?: string | null;
    }
  ) {
    return prisma.mediaAsset.update({ where: { id }, data });
  },

  deleteById(id: string) {
    return prisma.mediaAsset.delete({ where: { id } });
  }
};
