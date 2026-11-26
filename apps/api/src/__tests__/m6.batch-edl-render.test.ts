import { spawn } from 'node:child_process';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import { probeMediaAsset } from '../services/media/media-probe.service.js';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg gagal (${code})`))));
  });
}

describe('M6 Multi-Variant Auto-Editor, FFmpeg 9:16 Safe-Zone Render & HTTP 206 Range Streaming', () => {
  const app = createApp();
  const qaEmail = `qa-m6-${Date.now()}@clipstudio.local`;
  let authCookie = '';
  let sampleVideoPath = '';
  let createdBatchId = '';
  let createdCampaignId = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await prisma.user.create({
      data: { name: 'QA M6 Runner', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: qaEmail,
      password: 'PasswordKuat123!'
    });
    authCookie = loginRes.headers['set-cookie'][0];

    sampleVideoPath = resolveSafeStoragePath(`temp/qa_m6_${Date.now()}.mp4`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=5:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=5',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      sampleVideoPath
    ]);
  }, 30000);

  afterAll(async () => {
    fs.rmSync(sampleVideoPath, { force: true });
    if (createdBatchId) {
      fs.rmSync(resolveSafeStoragePath(`renders/${createdBatchId}`), { recursive: true, force: true });
    }
    if (createdCampaignId) {
      fs.rmSync(resolveSafeStoragePath(`uploads/${createdCampaignId}`), { recursive: true, force: true });
    }
    await prisma.user.deleteMany({ where: { email: qaEmail } });
  });

  it('merender batch 2 variasi 1080x1920 (fit_blur_bg + mute_for_platform_sound), verifikasi FFprobe & HTTP 206 Range Streaming', async () => {
    // 1. Buat Campaign & Upload Raw Video 16:9
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Cookie', authCookie)
      .send({ title: 'Campaign Render M6', brandOwner: 'Brand M6', platformTargets: ['tiktok'] });
    expect(campRes.status).toBe(201);
    createdCampaignId = campRes.body.data.id;

    const vidBuf = fs.readFileSync(sampleVideoPath);
    const upId = `up_m6_${Date.now()}`;
    await request(app)
      .post(`/api/campaigns/${createdCampaignId}/media/chunk`)
      .set('Cookie', authCookie)
      .field('uploadId', upId)
      .field('chunkIndex', '0')
      .attach('chunk', vidBuf, 'chunk0.bin');

    const compRes = await request(app)
      .post(`/api/campaigns/${createdCampaignId}/media/complete`)
      .set('Cookie', authCookie)
      .send({
        uploadId: upId,
        originalFilename: 'podcast-m6.mp4',
        mimeType: 'video/mp4',
        totalChunks: 1,
        assetType: 'raw_video'
      });
    expect(compRes.status).toBe(201);

    // 2. Hitung Estimasi Token & Render
    const targetConfig = {
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
    };

    const estRes = await request(app)
      .post(`/api/campaigns/${createdCampaignId}/batches/estimate`)
      .set('Cookie', authCookie)
      .send({ targetConfig });
    expect(estRes.status).toBe(200);
    expect(estRes.body.data.estimatedTotalTokens).toBeGreaterThan(0);

    // 3. Mulai Batch Generate (2 Variasi)
    const startRes = await request(app)
      .post(`/api/campaigns/${createdCampaignId}/batches`)
      .set('Cookie', authCookie)
      .send({ targetConfig });
    expect(startRes.status).toBe(201);
    createdBatchId = startRes.body.data.id;

    // Tunggu worker lokal menyelesaikan render 2 variasi
    let batchState: { status: string; clips: Array<{ id: string; status: string; activeVersion: { id: string; hasVideo: boolean; hasCover: boolean } }> } | null = null;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      const poll = await request(app).get(`/api/batches/${createdBatchId}`).set('Cookie', authCookie);
      batchState = poll.body.data;
      if (batchState && ['completed', 'partial_success', 'failed'].includes(batchState.status)) break;
    }

    expect(batchState?.status).toBe('completed');
    expect(batchState?.clips.length).toBe(2);
    expect(batchState?.clips[0].status).toBe('ready');
    expect(batchState?.clips[0].activeVersion.hasVideo).toBe(true);
    expect(batchState?.clips[0].activeVersion.hasCover).toBe(true);

    // 4. Verifikasi Output MP4 Aktual via FFprobe (1080x1920 + audio hening valid untuk mute_for_platform_sound!)
    const clip0 = batchState!.clips[0];
    const relMp4 = `renders/${createdBatchId}/${clip0.id}/v1/video.mp4`;
    const probed = await probeMediaAsset(relMp4, 'raw_video');
    expect(probed.width).toBe(1080);
    expect(probed.height).toBe(1920);
    expect(probed.hasAudio).toBe(true); // Track AAC stereo valid (anullsrc) agar tidak ditolak TikTok/iOS!
    expect(probed.audioDiagnostic?.meanVolumeDb ?? -91).toBeLessThan(-60);

    // 5. Verifikasi HTTP 206 Partial Content Range Streaming & Cover Image
    const rangeRes = await request(app)
      .get(`/api/clips/${clip0.id}/stream-video`)
      .set('Cookie', authCookie)
      .set('Range', 'bytes=0-1023');
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers['content-range']).toMatch(/^bytes 0-1023\/\d+/);

    const coverRes = await request(app)
      .get(`/api/clips/${clip0.id}/cover`)
      .set('Cookie', authCookie);
    expect(coverRes.status).toBe(200);
    expect(coverRes.headers['content-type']).toBe('image/jpeg');
  }, 60000);
});
