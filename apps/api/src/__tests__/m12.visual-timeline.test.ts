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

describe('M12 Visual Multi-Track Timeline Editor (Direct EDL Render, Split Segments, Zoom & Audio Sync)', () => {
  const app = createApp();
  const qaEmail = `qa-m12-${Date.now()}@clipstudio.local`;
  let authCookie = '';
  let sampleVideoPath = '';
  let createdCampaignId = '';
  let createdBatchId = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await prisma.user.create({
      data: { name: 'QA M12 Timeline', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: qaEmail,
      password: 'PasswordKuat123!'
    });
    authCookie = loginRes.headers['set-cookie'][0];

    sampleVideoPath = resolveSafeStoragePath(`temp/qa_m12_${Date.now()}.mp4`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=6:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6',
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

  it('merender EDL hasil Visual Timeline (2 segmen split, zoom 1.18x, Hook baru, Ducking 25%, Safe-Zone 65%) ke v2 + sinkron Playbook', async () => {
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Cookie', authCookie)
      .send({ title: 'Campaign M12 Timeline', brandOwner: 'Brand M12', platformTargets: ['tiktok'] });
    createdCampaignId = campRes.body.data.id;

    const vidBuf = fs.readFileSync(sampleVideoPath);
    const upId = `up_m12_${Date.now()}`;
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
        originalFilename: 'raw-m12.mp4',
        mimeType: 'video/mp4',
        totalChunks: 1,
        assetType: 'raw_video'
      });

    const batchRes = await request(app)
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
          initialAudioMode: 'original_normalized',
          batchDiversityMode: 'distinct_moments',
          batchCount: 1
        }
      });
    expect(batchRes.status).toBe(201);
    createdBatchId = batchRes.body.data.id;

    let clipId = '';
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      const b = await request(app).get(`/api/batches/${createdBatchId}`).set('Cookie', authCookie);
      if (b.body.data.status === 'completed') {
        clipId = b.body.data.clips[0].id;
        break;
      }
    }
    expect(clipId).toBeTruthy();

    // 1. Cek GET /api/clips/:clipId mengembalikan sourceMediaList untuk bounds Timeline
    const detailV1 = await request(app).get(`/api/clips/${clipId}`).set('Cookie', authCookie);
    expect(detailV1.status).toBe(200);
    expect(detailV1.body.data.sourceMediaList.length).toBe(1);
    const srcMedia = detailV1.body.data.sourceMediaList[0];
    expect(srcMedia.durationSec).toBeGreaterThanOrEqual(5.5);

    // 2. Uji tolak EDL invalid (segments kosong) -> 422 Zod validation error
    const baseEdl = detailV1.body.data.activeVersion.edl;
    const badRes = await request(app)
      .post(`/api/clips/${clipId}/render-edl`)
      .set('Cookie', authCookie)
      .send({ edl: { ...baseEdl, segments: [] } });
    expect(badRes.status).toBe(422);

    // 3. Render EDL hasil Visual Timeline (2 segmen split + zoom 1.18 + Hook baru + Ducking 25% + Safe-Zone 65%)
    const editedEdl = {
      ...baseEdl,
      segments: [
        { mediaAssetId: srcMedia.id, startSec: 0, endSec: 2.5, zoom: 1.0, cropX: 'center' },
        { mediaAssetId: srcMedia.id, startSec: 2.5, endSec: 5.0, zoom: 1.18, cropX: 'center' }
      ],
      audio: {
        ...baseEdl.audio,
        muteOriginal: false,
        originalVolume: 0.25,
        intendedPlatformSound: 'tiktok_trending_overlay'
      },
      hookBanner: {
        ...baseEdl.hookBanner,
        enabled: true,
        text: 'Hook Timeline Visual Baru!',
        startSec: 0,
        endSec: 2.2
      },
      captions: {
        ...baseEdl.captions,
        verticalOffsetPct: 65
      }
    };

    const renderRes = await request(app)
      .post(`/api/clips/${clipId}/render-edl`)
      .set('Cookie', authCookie)
      .send({ edl: editedEdl, note: 'Potong 2 segmen zoom + ducking 25%' });

    expect(renderRes.status).toBe(201);
    expect(renderRes.body.data.newVersionNumber).toBe(2);

    const v2 = renderRes.body.data.clip.activeVersion;
    expect(v2.edl.segments.length).toBe(2);
    expect(v2.edl.segments[1].zoom).toBe(1.18);
    expect(v2.edl.hookBanner.text).toBe('Hook Timeline Visual Baru!');
    expect(v2.edl.captions.verticalOffsetPct).toBe(65);
    expect(v2.uploadPlaybook.audioMusicGuide.renderedAudioState).toContain('Ducking 25%');

    const probed = await probeMediaAsset(`renders/${createdBatchId}/${clipId}/v2/video.mp4`, 'raw_video');
    expect(probed.width).toBe(1080);
    expect(probed.height).toBe(1920);
    expect(probed.durationSec ?? 0).toBeGreaterThanOrEqual(4.5);
  }, 60000);
});
