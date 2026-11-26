import { env } from './config/env.js';
import { initDatabaseAndRecoverJobs } from './config/prisma.js';
import { ensureStorageDirectories } from './config/storage.js';
import { createApp } from './app.js';

async function bootstrap() {
  ensureStorageDirectories();
  const dbInfo = await initDatabaseAndRecoverJobs();

  const app = createApp();
  app.listen(env.API_PORT, '0.0.0.0', () => {
    console.log(`[API] Clip Content Rewards berjalan di http://127.0.0.1:${env.API_PORT}`);
    console.log(`[DB] SQLite mode: ${dbInfo.walMode} | Zombie jobs recovered: ${dbInfo.recoveredJobs}`);
  });
}

bootstrap().catch((err) => {
  console.error('[API] Gagal memulai server:', err);
  process.exit(1);
});
