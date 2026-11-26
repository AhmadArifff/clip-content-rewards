import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function initDatabaseAndRecoverJobs(): Promise<{ walMode: string; recoveredJobs: number }> {
  const walRows = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON;');

  // Recover zombie jobs yang terhenti saat server/laptop dimatikan tiba-tiba
  const recovered = await prisma.renderJob.updateMany({
    where: { status: 'processing' },
    data: {
      status: 'failed',
      stageLabel: 'Terhenti saat aplikasi dimatikan',
      errorMessage: 'Proses terhenti karena server lokal dimatikan. Tekan Retry untuk melanjutkan.',
      finishedAt: new Date()
    }
  });

  const walMode = walRows?.[0]?.journal_mode ?? 'unknown';
  return { walMode, recoveredJobs: recovered.count };
}
