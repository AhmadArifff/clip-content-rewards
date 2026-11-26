import { prisma } from '../config/prisma.js';

export const campaignRepository = {
  listByUser(userId: string) {
    return prisma.campaign.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        brief: {
          select: {
            id: true,
            sourceType: true,
            originalFilename: true,
            confirmedByUser: true,
            updatedAt: true
          }
        },
        _count: {
          select: {
            mediaAssets: true,
            batches: true
          }
        }
      }
    });
  },

  findDetailForUser(id: string, userId: string) {
    return prisma.campaign.findFirst({
      where: { id, userId },
      include: {
        brief: true,
        mediaAssets: {
          orderBy: [{ assetType: 'asc' }, { createdAt: 'desc' }]
        },
        batches: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });
  },

  findOwnership(id: string, userId: string) {
    return prisma.campaign.findFirst({
      where: { id, userId },
      select: { id: true, userId: true, status: true }
    });
  },

  create(data: {
    userId: string;
    title: string;
    brandOwner: string | null;
    platformTargetsJson: string;
    rewardNotes: string | null;
    deadlineAt: Date | null;
  }) {
    return prisma.campaign.create({ data });
  },

  update(
    id: string,
    data: {
      title?: string;
      brandOwner?: string | null;
      platformTargetsJson?: string;
      rewardNotes?: string | null;
      deadlineAt?: Date | null;
      status?: string;
    }
  ) {
    return prisma.campaign.update({ where: { id }, data });
  },

  deleteById(id: string) {
    return prisma.campaign.delete({ where: { id } });
  },

  upsertBrief(data: {
    campaignId: string;
    sourceType: string;
    originalFilename: string | null;
    storedFilePath: string | null;
    rawText: string;
    parsedRulebookJson: string;
    confirmedByUser: boolean;
  }) {
    return prisma.campaignBrief.upsert({
      where: { campaignId: data.campaignId },
      update: {
        sourceType: data.sourceType,
        originalFilename: data.originalFilename,
        storedFilePath: data.storedFilePath,
        rawText: data.rawText,
        parsedRulebookJson: data.parsedRulebookJson,
        confirmedByUser: data.confirmedByUser
      },
      create: data
    });
  },

  updateBriefRulebook(
    campaignId: string,
    data: {
      rawText?: string;
      parsedRulebookJson: string;
      confirmedByUser: boolean;
    }
  ) {
    return prisma.campaignBrief.update({
      where: { campaignId },
      data
    });
  },

  findBrief(campaignId: string) {
    return prisma.campaignBrief.findUnique({ where: { campaignId } });
  }
};
