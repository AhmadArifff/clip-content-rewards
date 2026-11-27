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

describe('M7 & M8 Viral Score, Upload Playbook, Prompt Re-Editor (v1->v2 Mute Audio) & Rollback', () => {
  const app = createApp();
  const qaEmail = `qa-m78-${Date.now()}@clipstudio.local`;
  let authCookie = '';
  let sampleVideoPath = '';
  let createdCampaignId = '';
  let createdBatchId = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await prisma.user.create({
      data: { name: 'QA M78 Runner', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: qaEmail,
      password: 'PasswordKuat123!'
    });
    authCookie = loginRes.headers['set-cookie'][0];

    sampleVideoPath = resolveSafeStoragePath(`temp/qa_m78_${Date.now()}.mp4`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=4:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
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

  it('menghasilkan Viral Score + Upload Playbook di v1, regenerate v2 dengan prompt mute audio TikTok (FFprobe < -60dB + Playbook sinkron), & rollback ke v1', async () => {
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Cookie', authCookie)
      .send({ title: 'Campaign M78', brandOwner: 'Brand M78', platformTargets: ['tiktok'] });
    createdCampaignId = campRes.body.data.id;

    // Upload & confirm brief
    await request(app)
      .post(`/api/campaigns/${createdCampaignId}/brief/upload`)
      .set('Cookie', authCookie)
      .field('pastedText', 'Campaign TikTok #BrandM78 @brandm78 durasi 3-45 detik wajib CTA.');

    const vidBuf = fs.readFileSync(sampleVideoPath);
    const upId = `up_m78_${Date.now()}`;
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
        originalFilename: 'raw-m78.mp4',
        mimeType: 'video/mp4',
        totalChunks: 1,
        assetType: 'raw_video'
      });

    // Generate v1 dengan Original 100% (sengaja bersuara dulu!)
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
          primaryKpi: 'comments',
          editingStyle: 'fast_cut_retention',
          framingMode: 'fit_blur_bg',
          captionStyle: 'hormozi_bold',
          initialAudioMode: 'original_normalized',
          batchDiversityMode: 'distinct_moments',
          batchCount: 1
        }
      });
    expect(startRes.status).toBe(201);
    createdBatchId = startRes.body.data.id;

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

    // 1. Verifikasi M7 di v1: Viral Score, Impact, Critique & Playbook (Original 100%)
    const detailV1 = await request(app).get(`/api/clips/${clipId}`).set('Cookie', authCookie);
    expect(detailV1.status).toBe(200);
    const v1 = detailV1.body.data.activeVersion;
    expect(v1.viralScoreTotal).toBeGreaterThanOrEqual(50);
    expect(v1.critiques.length).toBeGreaterThan(0);
    expect(v1.uploadPlaybook.optimalSchedule.timezone).toContain('Asia/Jakarta');
    expect(v1.uploadPlaybook.audioMusicGuide.renderedAudioState).toContain('100%');

    const v1Probe = await probeMediaAsset(`renders/${createdBatchId}/${clipId}/v1/video.mp4`, 'raw_video');
    expect(v1Probe.audioDiagnostic?.meanVolumeDb ?? -90).toBeGreaterThan(-30);

    // 2. M8 Regenerate ke v2 dengan prompt nyata user (Mute Audio + Naikkan Subtitle Safe-Zone)
    const regenRes = await request(app)
      .post(`/api/clips/${clipId}/regenerate`)
      .set('Cookie', authCookie)
      .send({
        userPrompt: 'Suara audio asli belum sesuai brief, tolong mute total karena akan diganti sound musik di TikTok, dan naikkan subtitle ke safe-zone',
        presetCodes: ['mute_original_audio']
      });
    expect(regenRes.status).toBe(201);
    expect(regenRes.body.data.newVersionNumber).toBe(2);

    const v2 = regenRes.body.data.clip.activeVersion;
    expect(v2.edl.audio.muteOriginal).toBe(true);
    expect(v2.edl.captions.verticalOffsetPct).toBe(66);
    expect(v2.uploadPlaybook.audioMusicGuide.renderedAudioState).toContain('Mute');

    // Verifikasi fisik file v2 benar-benar hening di FFprobe!
    const v2Probe = await probeMediaAsset(`renders/${createdBatchId}/${clipId}/v2/video.mp4`, 'raw_video');
    expect(v2Probe.audioDiagnostic?.meanVolumeDb ?? 0).toBeLessThan(-60);

    // 3. Uji Rollback ke v1 & Approve Final
    const rollbackRes = await request(app)
      .patch(`/api/clips/${clipId}/active-version`)
      .set('Cookie', authCookie)
      .send({ versionId: v1.id });
    expect(rollbackRes.status).toBe(200);
    expect(rollbackRes.body.data.activeVersionId).toBe(v1.id);

    const approveRes = await request(app)
      .patch(`/api/clips/${clipId}/approve`)
      .set('Cookie', authCookie)
      .send({ isApproved: true });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.isApproved).toBe(true);
  }, 60000);
});
