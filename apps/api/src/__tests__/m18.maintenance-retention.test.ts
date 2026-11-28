import { spawn } from 'node:child_process';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import { createApp } from '../app.js';

const app = createApp();
const agent = request.agent(app);

const uniqueEmail = `qa-m18-${Date.now()}@clipstudio.local`;
let userId = '';
let campaignId = '';
let rawMediaId = '';
let clip1Id = '';
let clip2Id = '';
const tempCreatedFiles: string[] = [];

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg gagal (${code})`))));
  });
}

describe('M18 Storage Maintenance, Lifecycle Retention & Content Hygiene Center', () => {
  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('Password123!', 10);
    const createdUser = await prisma.user.create({
      data: { name: 'QA M18 Tester', email: uniqueEmail, passwordHash: hash, role: 'admin' }
    });
    userId = createdUser.id;

    const loginRes = await agent.post('/api/auth/login').send({
      email: uniqueEmail,
      password: 'Password123!'
    });
    expect(loginRes.status).toBe(200);

    const campRes = await agent.post('/api/campaigns').send({
      title: 'Maintenance Hygiene Test Campaign M18',
      brandOwner: 'CleanDisk Co',
      platformTargets: ['tiktok'],
      rewardNotes: 'Testing lifecycle retention'
    });
    expect(campRes.status).toBe(201);
    campaignId = campRes.body.data.id;

    const absRaw = resolveSafeStoragePath(`temp/qa_m18_raw_${Date.now()}.mp4`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'color=c=0x1e40af:s=640x360:d=3:r=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-shortest',
      absRaw
    ]);
    tempCreatedFiles.push(absRaw);

    const buf = fs.readFileSync(absRaw);
    const uploadId = `up_m18_${Date.now()}`;
    await agent
      .post(`/api/campaigns/${campaignId}/media/chunk`)
      .field('uploadId', uploadId)
      .field('chunkIndex', '0')
      .attach('chunk', buf, 'm18-raw.mp4');

    const compRes = await agent.post(`/api/campaigns/${campaignId}/media/complete`).send({
      uploadId,
      originalFilename: 'm18-raw.mp4',
      mimeType: 'video/mp4',
      totalChunks: 1,
      assetType: 'raw_video'
    });
    expect(compRes.status).toBe(201);
    rawMediaId = compRes.body.data.id;

    const batchRes = await agent.post(`/api/campaigns/${campaignId}/batches`).send({
      targetConfig: {
        platform: 'tiktok',
        countryCode: 'ID',
        languageStyle: 'Bahasa Indonesia Santai',
        ageGroup: '18-24',
        genderFocus: 'all',
        personaNiche: 'Kreator',
        controversyLevel: 'safe_edu',
        hookType: 'curiosity_gap',
        emotionalTrigger: 'Penasaran',
        primaryKpi: 'watch_time',
        editingStyle: 'fast_cut_retention',
        framingMode: 'fit_blur_bg',
        captionStyle: 'hormozi_bold',
        initialAudioMode: 'mute_for_platform_sound',
        batchDiversityMode: 'distinct_moments',
        clipEndingMode: 'complete_story',
        batchCount: 2
      }
    });
    expect(batchRes.status).toBe(201);
    const batchId = batchRes.body.data.id as string;

    for (let i = 0; i < 60; i += 1) {
      const poll = await agent.get(`/api/batches/${batchId}`);
      if (poll.body.data.status === 'completed' || poll.body.data.status === 'failed') {
        expect(poll.body.data.status).toBe('completed');
        clip1Id = poll.body.data.clips[0].id;
        clip2Id = poll.body.data.clips[1].id;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(clip1Id).toBeTruthy();
    expect(clip2Id).toBeTruthy();
  }, 90_000);

  afterAll(async () => {
    for (const f of tempCreatedFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    if (campaignId) {
      await agent.delete(`/api/campaigns/${campaignId}`).catch(() => {});
    }
    await prisma.masterPreset.deleteMany({
      where: { category: 'retention_policy', code: `user_${userId}` }
    });
    await prisma.user.deleteMany({ where: { email: uniqueEmail } });
  });

  it('melacak lastInspectedAt & downloadCount, mendeteksi klip menganggur 35 hari, serta mendukung Pin/Snooze & Policy dinamis', async () => {
    // 1. Verifikasi tracking inspeksi & unduhan pada Clip #2
    const inspectRes = await agent.get(`/api/clips/${clip2Id}`);
    expect(inspectRes.status).toBe(200);
    expect(inspectRes.body.data.lastInspectedAt).toBeTruthy();

    const dlRes = await agent.get(`/api/clips/${clip2Id}/download?type=mp4`);
    expect(dlRes.status).toBe(200);
    const dbClip2 = await prisma.clip.findUnique({ where: { id: clip2Id } });
    expect(dbClip2?.downloadCount).toBeGreaterThanOrEqual(1);
    expect(dbClip2?.lastDownloadedAt).toBeTruthy();

    // 2. Simulasikan Clip #1 sudah 35 hari menganggur tanpa pernah dicek maupun dijadwalkan
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    await prisma.clip.update({
      where: { id: clip1Id },
      data: {
        createdAt: thirtyFiveDaysAgo,
        lastInspectedAt: null,
        lastDownloadedAt: null,
        downloadCount: 0,
        publishStatus: 'unscheduled'
      }
    });

    const overRes = await agent.get('/api/maintenance/overview');
    expect(overRes.status).toBe(200);
    expect(overRes.body.data.summary.staleCriticalCount).toBeGreaterThanOrEqual(1);
    const foundStale = overRes.body.data.staleClips.find((c: { id: string }) => c.id === clip1Id);
    expect(foundStale).toBeTruthy();
    expect(foundStale.severity).toBe('critical');
    expect(foundStale.neverInspected).toBe(true);
    expect(foundStale.ageDays).toBeGreaterThanOrEqual(35);

    const summaryRes = await agent.get('/api/maintenance/alert-summary');
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.criticalCount).toBeGreaterThanOrEqual(1);

    // 3. Pin (Lindungi) mengeluarkan Clip #1 dari daftar peringatan
    const pinRes = await agent.patch(`/api/maintenance/clips/${clip1Id}/retention`).send({ action: 'pin' });
    expect(pinRes.status).toBe(200);
    expect(pinRes.body.data.retentionProtected).toBe(true);

    const afterPin = await agent.get('/api/maintenance/overview');
    expect(afterPin.body.data.staleClips.some((c: { id: string }) => c.id === clip1Id)).toBe(false);
    expect(afterPin.body.data.protectedClips.some((c: { id: string }) => c.id === clip1Id)).toBe(true);

    // 4. Snooze 30 hari juga menahan peringatan
    const snoozeRes = await agent.patch(`/api/maintenance/clips/${clip1Id}/retention`).send({ action: 'snooze', snoozeDays: 30 });
    expect(snoozeRes.status).toBe(200);
    expect(snoozeRes.body.data.snoozedUntil).toBeTruthy();

    // 5. Unpin mengembalikan Clip #1 ke antrean peringatan
    await agent.patch(`/api/maintenance/clips/${clip1Id}/retention`).send({ action: 'unpin' });

    // 6. Ubah kebijakan retensi secara dinamis (tersimpan di master_presets)
    const polRes = await agent.patch('/api/maintenance/policy').send({
      staleDaysThreshold: 21,
      warningDaysThreshold: 7,
      publishedPruneDays: 10,
      diskWarningMb: 4096
    });
    expect(polRes.status).toBe(200);
    expect(polRes.body.data.staleDaysThreshold).toBe(21);
  });

  it('menjalankan Arsip Ringan (hapus MP4 pertahankan Playbook & Skor), kunci 409 saat render aktif, cleanup orphan, & hapus permanen', async () => {
    const clip1Before = await prisma.clip.findUnique({
      where: { id: clip1Id },
      include: { versions: true }
    });
    const mp4Rel = clip1Before?.versions[0]?.outputVideoPath;
    const coverRel = clip1Before?.versions[0]?.coverImagePath;
    expect(mp4Rel).toBeTruthy();
    const mp4Abs = resolveSafeStoragePath(mp4Rel!);
    expect(fs.existsSync(mp4Abs)).toBe(true);

    // 1. Uji proteksi kunci 409 RENDER_IN_PROGRESS saat ada job berjalan
    const dummyJob = await prisma.renderJob.create({
      data: {
        jobType: 'render_clip',
        entityId: 'dummy-lock-m18',
        payloadJson: '{}',
        status: 'processing'
      }
    });
    const blockedRes = await agent.post('/api/maintenance/actions/prune-media').send({ clipIds: [clip1Id] });
    expect(blockedRes.status).toBe(409);
    await prisma.renderJob.delete({ where: { id: dummyJob.id } });

    // 2. Jalankan Arsip Ringan (Prune MP4 Saja) pada Clip #1
    const pruneRes = await agent.post('/api/maintenance/actions/prune-media').send({ clipIds: [clip1Id] });
    expect(pruneRes.status).toBe(200);
    expect(pruneRes.body.data.prunedCount).toBe(1);
    expect(pruneRes.body.data.freedBytes).toBeGreaterThan(0);

    // Verifikasi MP4 hilang dari disk, tetapi Cover, Skor Viral & Upload Playbook 100% UTUH!
    expect(fs.existsSync(mp4Abs)).toBe(false);
    if (coverRel) {
      expect(fs.existsSync(resolveSafeStoragePath(coverRel))).toBe(true);
    }
    const clip1After = await prisma.clip.findUnique({
      where: { id: clip1Id },
      include: { versions: true }
    });
    expect(clip1After?.mediaPrunedAt).toBeTruthy();
    expect(clip1After?.versions[0]?.outputVideoPath).toBeNull();
    expect(clip1After?.versions[0]?.viralScoreTotal).toBeGreaterThan(0);
    expect(clip1After?.versions[0]?.uploadPlaybookJson).toBeTruthy();

    // 3. Uji deteksi & pembersihan orphan file di storage/temp/
    const orphanPath = resolveSafeStoragePath(`temp/qa_m18_orphan_${Date.now()}.tmp`);
    fs.writeFileSync(orphanPath, Buffer.alloc(64 * 1024, 1));
    const orphanCleanRes = await agent.post('/api/maintenance/actions/cleanup-orphans');
    expect(orphanCleanRes.status).toBe(200);
    expect(fs.existsSync(orphanPath)).toBe(false);

    // 4. Uji hapus permanen Clip #2 & hapus Raw Video
    const delClipRes = await agent.post('/api/maintenance/actions/delete-clips').send({ clipIds: [clip2Id] });
    expect(delClipRes.status).toBe(200);
    expect(delClipRes.body.data.deletedCount).toBe(1);

    const delRawRes = await agent.post('/api/maintenance/actions/delete-raw-assets').send({ mediaAssetIds: [rawMediaId] });
    expect(delRawRes.status).toBe(200);
    expect(delRawRes.body.data.deletedCount).toBe(1);

    // 5. Pastikan seluruh aksi tercatat pada StorageCleanupLog
    const logs = await prisma.storageCleanupLog.findMany({ where: { userId } });
    expect(logs.length).toBeGreaterThanOrEqual(4);
  });
});
