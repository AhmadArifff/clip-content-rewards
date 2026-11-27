import { spawn } from 'node:child_process';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg gagal (${code})`))));
  });
}

function listZipEntriesViaTar(zipAbsPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-tf', zipAbsPath], { shell: false });
    let stdout = '';
    proc.stdout.on('data', (d) => {
      stdout += String(d);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`tar -tf gagal (${code})`));
      else resolve(stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    });
  });
}

describe('M9 Single Download (.mp4/.txt/.srt/.jpg), Bulk Streaming ZIP & Storage Temp Cleanup', () => {
  const app = createApp();
  const qaEmail = `qa-m9-${Date.now()}@clipstudio.local`;
  let authCookie = '';
  let sampleVideoPath = '';
  let createdCampaignId = '';
  let createdBatchId = '';
  let exportedZipPath = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await prisma.user.create({
      data: { name: 'QA M9 Export', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: qaEmail,
      password: 'PasswordKuat123!'
    });
    authCookie = loginRes.headers['set-cookie'][0];

    sampleVideoPath = resolveSafeStoragePath(`temp/qa_m9_${Date.now()}.mp4`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=3:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      sampleVideoPath
    ]);
  }, 30000);

  afterAll(async () => {
    fs.rmSync(sampleVideoPath, { force: true });
    if (exportedZipPath) fs.rmSync(exportedZipPath, { force: true });
    if (createdBatchId) {
      fs.rmSync(resolveSafeStoragePath(`renders/${createdBatchId}`), { recursive: true, force: true });
    }
    if (createdCampaignId) {
      fs.rmSync(resolveSafeStoragePath(`uploads/${createdCampaignId}`), { recursive: true, force: true });
    }
    await prisma.user.deleteMany({ where: { email: qaEmail } });
  });

  it('mengunduh satuan (.mp4/.txt/.srt/.jpg), streaming Bulk ZIP terverifikasi, filter Final, dan membersihkan folder storage/temp', async () => {
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Cookie', authCookie)
      .send({ title: 'Campaign Export M9', brandOwner: 'Brand M9', platformTargets: ['tiktok'] });
    createdCampaignId = campRes.body.data.id;

    await request(app)
      .post(`/api/campaigns/${createdCampaignId}/brief/upload`)
      .set('Cookie', authCookie)
      .field('pastedText', 'Brief TikTok #BrandM9 @brandm9 durasi 3-45 detik wajib CTA.');

    const vidBuf = fs.readFileSync(sampleVideoPath);
    const upId = `up_m9_${Date.now()}`;
    await request(app)
      .post(`/api/campaigns/${createdCampaignId}/media/chunk`)
      .set('Cookie', authCookie)
      .field('uploadId', upId)
      .field('chunkIndex', '0')
      .attach('chunk', vidBuf, 'p0.bin');

    await request(app)
      .post(`/api/campaigns/${createdCampaignId}/media/complete`)
      .set('Cookie', authCookie)
      .send({
        uploadId: upId,
        originalFilename: 'raw-m9.mp4',
        mimeType: 'video/mp4',
        totalChunks: 1,
        assetType: 'raw_video'
      });

    const startRes = await request(app)
      .post(`/api/campaigns/${createdCampaignId}/batches`)
      .set('Cookie', authCookie)
      .send({
        targetConfig: {
          platform: 'tiktok',
          countryCode: 'ID',
          languageStyle: 'Bahasa Indonesia Santai',
          ageGroup: '18-24',
          genderFocus: 'all',
          personaNiche: 'Kreator Muda',
          controversyLevel: 'hot_take',
          hookType: 'curiosity_gap',
          emotionalTrigger: 'FOMO',
          primaryKpi: 'watch_time',
          editingStyle: 'fast_cut_retention',
          framingMode: 'fit_blur_bg',
          captionStyle: 'hormozi_bold',
          initialAudioMode: 'mute_for_platform_sound',
          batchDiversityMode: 'distinct_moments',
          batchCount: 2
        }
      });
    expect(startRes.status).toBe(201);
    createdBatchId = startRes.body.data.id;

    let clipIds: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      const b = await request(app).get(`/api/batches/${createdBatchId}`).set('Cookie', authCookie);
      if (b.body.data.status === 'completed') {
        clipIds = b.body.data.clips.map((c: { id: string }) => c.id);
        break;
      }
    }
    expect(clipIds.length).toBe(2);

    // 1. Uji Single Download (.mp4, playbook .txt, .srt, cover .jpg)
    const dlMp4 = await request(app)
      .get(`/api/clips/${clipIds[0]}/download?type=mp4`)
      .set('Cookie', authCookie);
    expect(dlMp4.status).toBe(200);
    expect(dlMp4.headers['content-type']).toContain('video/mp4');
    expect(dlMp4.headers['content-disposition']).toContain('.mp4');

    const dlPlaybook = await request(app)
      .get(`/api/clips/${clipIds[0]}/download?type=playbook`)
      .set('Cookie', authCookie);
    expect(dlPlaybook.status).toBe(200);
    expect(dlPlaybook.text).toContain('UPLOAD PLAYBOOK - Campaign Export M9');
    expect(dlPlaybook.text).toContain('Audio Asli Di-Mute Penuh (0%)');

    const dlSrt = await request(app)
      .get(`/api/clips/${clipIds[0]}/download?type=srt`)
      .set('Cookie', authCookie);
    expect(dlSrt.status).toBe(200);
    expect(dlSrt.headers['content-disposition']).toContain('.srt');

    const dlCover = await request(app)
      .get(`/api/clips/${clipIds[0]}/download?type=cover`)
      .set('Cookie', authCookie);
    expect(dlCover.status).toBe(200);
    expect(dlCover.headers['content-type']).toContain('image/jpeg');

    // 2. Uji Bulk ZIP filter 'approved' ketika belum ada yang Final -> harus 400
    const emptyZipRes = await request(app)
      .post(`/api/batches/${createdBatchId}/export-zip`)
      .set('Cookie', authCookie)
      .send({ filter: 'approved' });
    expect(emptyZipRes.status).toBe(400);
    expect(emptyZipRes.body.error.code).toBe('NO_MATCHING_CLIPS_FOR_EXPORT');

    // 3. Uji Bulk ZIP filter 'all' -> verifikasi header PK + isi 2 folder + ringkasan MD via tar -tf
    const zipRes = await request(app)
      .post(`/api/batches/${createdBatchId}/export-zip`)
      .set('Cookie', authCookie)
      .send({ filter: 'all' })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(zipRes.status).toBe(200);
    expect(zipRes.headers['content-type']).toContain('application/zip');
    const zipBuf = zipRes.body as Buffer;
    expect(zipBuf.subarray(0, 4).toString('binary')).toBe('PK\x03\x04');

    exportedZipPath = resolveSafeStoragePath(`exports/qa_m9_${Date.now()}.zip`);
    fs.writeFileSync(exportedZipPath, zipBuf);
    const entries = await listZipEntriesViaTar(exportedZipPath);
    expect(entries).toContain('00-RINGKASAN-CAMPAIGN-DAN-JADWAL-UPLOAD.md');
    expect(entries.filter((e) => e.endsWith('/video-ready-upload.mp4')).length).toBe(2);
    expect(entries.filter((e) => e.endsWith('/upload-playbook.txt')).length).toBe(2);
    expect(entries.filter((e) => e.endsWith('/cover.jpg')).length).toBe(2);

    // 4. Uji Storage Stats & Safe Temp Cleanup
    const dummyTempFile = resolveSafeStoragePath(`temp/dummy_cleanup_${Date.now()}.bin`);
    fs.writeFileSync(dummyTempFile, Buffer.alloc(64 * 1024, 1));
    expect(fs.existsSync(dummyTempFile)).toBe(true);

    const storageRes = await request(app).get('/api/system/storage').set('Cookie', authCookie);
    expect(storageRes.status).toBe(200);
    expect(storageRes.body.data.breakdown.tempMb).toBeGreaterThan(0);

    const cleanRes = await request(app)
      .post('/api/system/cleanup-temp')
      .set('Cookie', authCookie)
      .send({ includeInactiveVersions: false });
    expect(cleanRes.status).toBe(200);
    expect(cleanRes.body.data.deletedItemsCount).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(dummyTempFile)).toBe(false);
    // Pastikan video render aktif tetap utuh!
    const stillPlayable = await request(app)
      .get(`/api/clips/${clipIds[0]}/download?type=mp4`)
      .set('Cookie', authCookie);
    expect(stillPlayable.status).toBe(200);
  }, 60000);
});
