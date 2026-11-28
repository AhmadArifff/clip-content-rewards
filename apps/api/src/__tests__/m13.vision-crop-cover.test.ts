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
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg gagal (${code}): ${stderr.slice(-200)}`))));
  });
}

describe('M13 Smart Face-Tracking Auto-Crop 9:16 & Cover Frame Selector', () => {
  const app = createApp();
  const qaEmail = `qa-m13-${Date.now()}@clipstudio.local`;
  let authCookie = '';
  let sampleVideoPath = '';
  let createdCampaignId = '';
  let createdBatchId = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await prisma.user.create({
      data: { name: 'QA M13 Vision', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: qaEmail,
      password: 'PasswordKuat123!'
    });
    authCookie = loginRes.headers['set-cookie'][0];

    // Sintesis video 16:9 6 detik: subjek warna kulit (0xE4B08E) di KIRI (0-3s) lalu pindah ke KANAN (3-6s)
    sampleVideoPath = resolveSafeStoragePath(`temp/qa_m13_${Date.now()}.mp4`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi',
      '-i', "color=c=0x101828:s=1280x720:d=6:r=30,drawbox=x=110:y=140:w=220:h=260:color=0xE4B08E:t=fill:enable='lt(t,3)',drawbox=x=950:y=140:w=220:h=260:color=0xE4B08E:t=fill:enable='gte(t,3)'",
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

  it('mendeteksi subjek Kiri (0-3s) & Kanan (3-6s), merender auto_face_track 1080x1920, memindai 6 kandidat cover, dan memperbarui cover.jpg', async () => {
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Cookie', authCookie)
      .send({ title: 'Campaign M13 Smart Vision', brandOwner: 'Brand M13', platformTargets: ['tiktok'] });
    createdCampaignId = campRes.body.data.id;

    const vidBuf = fs.readFileSync(sampleVideoPath);
    const upId = `up_m13_${Date.now()}`;
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
        originalFilename: 'podcast-two-speakers.mp4',
        mimeType: 'video/mp4',
        totalChunks: 1,
        assetType: 'raw_video'
      });

    // Generate batch langsung memakai mode Smart Auto-Track 9:16 (auto_face_track)
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
          personaNiche: 'Kreator Podcast',
          controversyLevel: 'hot_take',
          hookType: 'curiosity_gap',
          emotionalTrigger: 'FOMO',
          primaryKpi: 'watch_time',
          editingStyle: 'fast_cut_retention',
          framingMode: 'auto_face_track',
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

    // 1. Cek hasil auto_face_track pada v1 (otomatis terbagi & terdeteksi kiri -> kanan)
    const detailV1 = await request(app).get(`/api/clips/${clipId}`).set('Cookie', authCookie);
    expect(detailV1.status).toBe(200);
    const v1 = detailV1.body.data.activeVersion;
    expect(v1.edl.framingMode).toBe('auto_face_track');
    expect(v1.edl.segments.length).toBeGreaterThanOrEqual(2);
    const srcMediaId = detailV1.body.data.sourceMediaList[0].id;

    const probedV1 = await probeMediaAsset(`renders/${createdBatchId}/${clipId}/v1/video.mp4`, 'raw_video');
    expect(probedV1.width).toBe(1080);
    expect(probedV1.height).toBe(1920);

    // 2. Uji endpoint POST /api/clips/:clipId/auto-track-crop untuk 2 segmen eksplisit (0-3s & 3-6s)
    const trackRes = await request(app)
      .post(`/api/clips/${clipId}/auto-track-crop`)
      .set('Cookie', authCookie)
      .send({
        segments: [
          { mediaAssetId: srcMediaId, startSec: 0, endSec: 3 },
          { mediaAssetId: srcMediaId, startSec: 3, endSec: 6 }
        ]
      });
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.data.recommendedFramingMode).toBe('auto_face_track');
    const trackedSegs = trackRes.body.data.segments;
    expect(trackedSegs.length).toBe(2);
    expect(trackedSegs[0].signalType).toBe('face_skin');
    expect(trackedSegs[0].focusX).toBeLessThan(0.38);
    expect(trackedSegs[0].cropX).toBe('left');
    expect(trackedSegs[1].signalType).toBe('face_skin');
    expect(trackedSegs[1].focusX).toBeGreaterThan(0.62);
    expect(trackedSegs[1].cropX).toBe('right');

    // 3. Render v2 via /render-edl memakai focusX hasil auto-track + zoom 1.1x
    const v2Edl = {
      ...v1.edl,
      framingMode: 'auto_face_track',
      segments: [
        { mediaAssetId: srcMediaId, startSec: 0, endSec: 3, zoom: 1.0, cropX: trackedSegs[0].cropX, focusX: trackedSegs[0].focusX },
        { mediaAssetId: srcMediaId, startSec: 3, endSec: 6, zoom: 1.1, cropX: trackedSegs[1].cropX, focusX: trackedSegs[1].focusX }
      ]
    };
    const renderV2 = await request(app)
      .post(`/api/clips/${clipId}/render-edl`)
      .set('Cookie', authCookie)
      .send({ edl: v2Edl, note: 'Smart Auto-Track Kiri ke Kanan' });
    expect(renderV2.status).toBe(201);
    expect(renderV2.body.data.newVersionNumber).toBe(2);

    const probedV2 = await probeMediaAsset(`renders/${createdBatchId}/${clipId}/v2/video.mp4`, 'raw_video');
    expect(probedV2.width).toBe(1080);
    expect(probedV2.height).toBe(1920);

    // 4. Pindai 6 kandidat cover via GET /api/clips/:clipId/cover-candidates
    const v2Id = renderV2.body.data.newVersionId;
    const candRes = await request(app)
      .get(`/api/clips/${clipId}/cover-candidates?versionId=${v2Id}`)
      .set('Cookie', authCookie);
    expect(candRes.status).toBe(200);
    const candidates = candRes.body.data.candidates as Array<{
      index: number;
      timestampSec: number;
      score: number;
      isRecommended: boolean;
      imageUrl: string;
    }>;
    expect(candidates.length).toBe(6);
    expect(candidates.filter((c) => c.isRecommended).length).toBe(1);

    // 5. Pastikan thumbnail kandidat dapat di-stream sebagai JPEG valid (200) & indeks ilegal ditolak (400)
    const imgRes = await request(app)
      .get(`/api/clips/${clipId}/cover-candidate/0?versionId=${v2Id}`)
      .set('Cookie', authCookie);
    expect(imgRes.status).toBe(200);
    expect(imgRes.headers['content-type']).toContain('image/jpeg');
    expect(imgRes.body.length).toBeGreaterThan(500);

    const badIdxRes = await request(app)
      .get(`/api/clips/${clipId}/cover-candidate/9?versionId=${v2Id}`)
      .set('Cookie', authCookie);
    expect(badIdxRes.status).toBe(400);

    // 6. Terapkan cover frame baru pada detik 4.2s via PATCH /api/clips/:clipId/cover
    const setCoverRes = await request(app)
      .patch(`/api/clips/${clipId}/cover`)
      .set('Cookie', authCookie)
      .send({ versionId: v2Id, timestampSec: 4.2 });
    expect(setCoverRes.status).toBe(200);
    expect(setCoverRes.body.data.updated).toBe(true);
    expect(setCoverRes.body.data.timestampSec).toBe(4.2);

    const coverFile = resolveSafeStoragePath(`renders/${createdBatchId}/${clipId}/v2/cover.jpg`);
    expect(fs.existsSync(coverFile)).toBe(true);
    expect(fs.statSync(coverFile).size).toBeGreaterThan(1000);
  }, 90000);
});
