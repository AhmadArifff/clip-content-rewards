import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';

function runFfmpegSyncLike(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg fixture gagal (${code})`));
    });
  });
}

describe('M5 Campaign Manager, Brief Parser & Chunked Raw Media Ingestion', () => {
  const app = createApp();
  const qaEmail = `qa-m5-${Date.now()}@clipstudio.local`;
  let authCookie = '';
  let sampleVideoPath = '';
  let samplePngPath = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await prisma.user.create({
      data: { name: 'QA M5 Runner', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: qaEmail,
      password: 'PasswordKuat123!'
    });
    expect(loginRes.status).toBe(200);
    authCookie = loginRes.headers['set-cookie'][0];

    // Buat video uji 4 detik (2s suara + 1s hening + 1s suara) dan PNG watermark lokal
    sampleVideoPath = resolveSafeStoragePath(`temp/qa_m5_${Date.now()}.mp4`);
    samplePngPath = resolveSafeStoragePath(`temp/qa_m5_${Date.now()}.png`);

    await runFfmpegSyncLike([
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=4:size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
      '-af', "volume=enable='between(t,1.5,2.6)':volume=0",
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      sampleVideoPath
    ]);

    await runFfmpegSyncLike([
      '-y',
      '-f', 'lavfi', '-i', 'color=c=green:s=128x64:d=0.1',
      '-frames:v', '1',
      samplePngPath
    ]);
  }, 30000);

  afterAll(async () => {
    fs.rmSync(sampleVideoPath, { force: true });
    fs.rmSync(samplePngPath, { force: true });
    await prisma.user.deleteMany({ where: { email: qaEmail } });
  });

  it('menjalankan alur penuh: Create Campaign -> Parse & Confirm Brief -> Chunked Upload Video -> Audio Diagnostic & Silences -> Supporting Watermark -> Cleanup', async () => {
    // 1. Create Campaign
    const createRes = await request(app)
      .post('/api/campaigns')
      .set('Cookie', authCookie)
      .send({
        title: 'Campaign Brand Uji M5',
        brandOwner: 'Brand Demo',
        platformTargets: ['tiktok', 'youtube_shorts'],
        rewardNotes: 'Rp 15.000 / 10k views'
      });
    expect(createRes.status).toBe(201);
    const campaignId = createRes.body.data.id as string;

    // 2. Upload Brief via Teks (Fallback Heuristic saat tanpa API key Brain)
    const briefText = `Campaign Clipping Brand Demo untuk TikTok dan YouTube Shorts.
Durasi wajib 20-45 detik.
Wajib sertakan hashtag #BrandDemo #ContentRewards dan mention @branddemo.
Wajib tampilkan CTA Cek link di bio pada akhir video.
Dilarang membuat klaim medis atau memakai lagu berhak cipta penuh.`;

    const briefRes = await request(app)
      .post(`/api/campaigns/${campaignId}/brief/upload`)
      .set('Cookie', authCookie)
      .field('pastedText', briefText);
    expect(briefRes.status).toBe(200);
    expect(briefRes.body.data.rulebook.requiredHashtags).toContain('#BrandDemo');
    expect(briefRes.body.data.rulebook.requiredMentions).toContain('@branddemo');
    expect(briefRes.body.data.rulebook.durationRules.minSec).toBe(20);
    expect(briefRes.body.data.rulebook.durationRules.maxSec).toBe(45);

    // 3. Edit & Confirm Brief Rulebook
    const updatedRulebook = {
      ...briefRes.body.data.rulebook,
      brandTone: 'Berani & Kontras'
    };
    const confirmRes = await request(app)
      .patch(`/api/campaigns/${campaignId}/brief`)
      .set('Cookie', authCookie)
      .send({ rulebook: updatedRulebook, confirmedByUser: true });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.confirmedByUser).toBe(true);

    // 4. Chunked Upload Video Mentah (dipecah menjadi 2 potongan)
    const videoBuf = fs.readFileSync(sampleVideoPath);
    const mid = Math.ceil(videoBuf.length / 2);
    const uploadId = `up_vid_${Date.now()}`;

    const c0 = await request(app)
      .post(`/api/campaigns/${campaignId}/media/chunk`)
      .set('Cookie', authCookie)
      .field('uploadId', uploadId)
      .field('chunkIndex', '0')
      .attach('chunk', videoBuf.subarray(0, mid), 'part0.bin');
    expect(c0.status).toBe(200);

    const c1 = await request(app)
      .post(`/api/campaigns/${campaignId}/media/chunk`)
      .set('Cookie', authCookie)
      .field('uploadId', uploadId)
      .field('chunkIndex', '1')
      .attach('chunk', videoBuf.subarray(mid), 'part1.bin');
    expect(c1.status).toBe(200);

    const completeVideoRes = await request(app)
      .post(`/api/campaigns/${campaignId}/media/complete`)
      .set('Cookie', authCookie)
      .send({
        uploadId,
        originalFilename: 'raw-podcast-uji.mp4',
        mimeType: 'video/mp4',
        totalChunks: 2,
        assetType: 'raw_video'
      });

    expect(completeVideoRes.status).toBe(201);
    const media = completeVideoRes.body.data;
    expect(media.width).toBe(640);
    expect(media.height).toBe(360);
    expect(media.hasAudio).toBe(true);
    expect(media.durationSec).toBeGreaterThan(3);
    expect(media.audioDiagnostic).not.toBeNull();
    expect(media.silences.length).toBeGreaterThanOrEqual(1);

    // 5. Upload Supporting Asset (Watermark PNG)
    const pngBuf = fs.readFileSync(samplePngPath);
    const wmUploadId = `up_wm_${Date.now()}`;
    await request(app)
      .post(`/api/campaigns/${campaignId}/media/chunk`)
      .set('Cookie', authCookie)
      .field('uploadId', wmUploadId)
      .field('chunkIndex', '0')
      .attach('chunk', pngBuf, 'wm.bin');

    const completeWmRes = await request(app)
      .post(`/api/campaigns/${campaignId}/media/complete`)
      .set('Cookie', authCookie)
      .send({
        uploadId: wmUploadId,
        originalFilename: 'logo-brand.png',
        mimeType: 'image/png',
        totalChunks: 1,
        assetType: 'watermark'
      });
    expect(completeWmRes.status).toBe(201);
    expect(completeWmRes.body.data.assetType).toBe('watermark');

    // 6. Cek Detail Campaign & Hapus Bersih Campaign + File Fisik
    const detailRes = await request(app)
      .get(`/api/campaigns/${campaignId}`)
      .set('Cookie', authCookie);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.mediaAssets.length).toBe(2);
    expect(detailRes.body.data.status).toBe('ready');

    const delRes = await request(app)
      .delete(`/api/campaigns/${campaignId}`)
      .set('Cookie', authCookie);
    expect(delRes.status).toBe(200);
  }, 30000);
});
