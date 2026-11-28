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

describe('M11 Reference Video Pacing Cloner (Style-Only Scene Extraction & Multi-Cut EDL Cloning)', () => {
  const app = createApp();
  const qaEmail = `qa-m11-${Date.now()}@clipstudio.local`;
  let authCookie = '';
  let refMultiCutPath = '';
  let rawCampaignVideoPath = '';
  let createdCampaignId = '';
  let createdBatchId = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await prisma.user.create({
      data: { name: 'QA M11 Pacing', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: qaEmail,
      password: 'PasswordKuat123!'
    });
    authCookie = loginRes.headers['set-cookie'][0];

    // Buat video referensi sintetis 6 detik berisi 4 pergantian adegan visual tegas (tiap 1.5 detik)
    refMultiCutPath = resolveSafeStoragePath(`temp/qa_m11_ref_${Date.now()}.mp4`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=1.5:size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'smptebars=duration=1.5:size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'rgbtestsrc=duration=1.5:size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'color=c=orange:duration=1.5:size=640x360:rate=30',
      '-filter_complex', '[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]',
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      refMultiCutPath
    ]);

    // Buat video mentah campaign 6 detik (16:9 dengan audio)
    rawCampaignVideoPath = resolveSafeStoragePath(`temp/qa_m11_raw_${Date.now()}.mp4`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=6:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      rawCampaignVideoPath
    ]);
  }, 40000);

  afterAll(async () => {
    fs.rmSync(refMultiCutPath, { force: true });
    fs.rmSync(rawCampaignVideoPath, { force: true });
    if (createdBatchId) {
      fs.rmSync(resolveSafeStoragePath(`renders/${createdBatchId}`), { recursive: true, force: true });
    }
    if (createdCampaignId) {
      fs.rmSync(resolveSafeStoragePath(`uploads/${createdCampaignId}`), { recursive: true, force: true });
    }
    await prisma.user.deleteMany({ where: { email: qaEmail } });
  });

  it('mengekstrak ritme multi-cut video referensi (style-only), menerapkannya ke batch multi-segmen 9:16, dan menyinkronkan BPM Playbook', async () => {
    const tempBefore = fs.readdirSync(resolveSafeStoragePath('temp'));

    // 1. Upload & Analisis Video Referensi
    const analyzeRes = await request(app)
      .post('/api/pacing-profiles/analyze')
      .set('Cookie', authCookie)
      .field('name', 'Ritme Hook Cepat 4 Shot')
      .attach('file', refMultiCutPath, 'ref-viral-tiktok.mp4');

    expect(analyzeRes.status).toBe(201);
    const profile = analyzeRes.body.data;
    expect(profile.name).toBe('Ritme Hook Cepat 4 Shot');
    expect(profile.shotCount).toBeGreaterThanOrEqual(3);
    expect(profile.cutsPerMinute).toBeGreaterThan(0);
    expect(profile.estimatedBpm).toBeGreaterThanOrEqual(80);
    expect(profile.blueprint.shots.length).toBeGreaterThanOrEqual(3);

    // Guardrail Style-Only: tidak meninggalkan file upload sementara di storage/temp/
    const tempAfter = fs.readdirSync(resolveSafeStoragePath('temp'));
    expect(tempAfter.length).toBe(tempBefore.length);

    // 2. Pastikan daftar profil mengembalikan profil baru
    const listRes = await request(app).get('/api/pacing-profiles').set('Cookie', authCookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((p: { id: string }) => p.id === profile.id)).toBe(true);

    // 3. Uji file non-video ditolak dengan bersih
    const badRes = await request(app)
      .post('/api/pacing-profiles/analyze')
      .set('Cookie', authCookie)
      .attach('file', Buffer.from('bukan video'), { filename: 'fake.mp4', contentType: 'video/mp4' });
    expect(badRes.status).toBe(400);
    expect(badRes.body.error.code).toBe('INVALID_REFERENCE_VIDEO');

    // 4. Terapkan referencePacingId ke Campaign Batch -> Verifikasi multi-segment EDL & render 1080x1920 nyata
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Cookie', authCookie)
      .send({ title: 'Campaign M11 Pacing', brandOwner: 'Brand M11', platformTargets: ['tiktok'] });
    createdCampaignId = campRes.body.data.id;

    const vidBuf = fs.readFileSync(rawCampaignVideoPath);
    const upId = `up_m11_${Date.now()}`;
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
        originalFilename: 'raw-m11.mp4',
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
          initialAudioMode: 'mute_for_platform_sound',
          batchDiversityMode: 'distinct_moments',
          batchCount: 1,
          referencePacingId: profile.id
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

    const clipDetail = await request(app).get(`/api/clips/${clipId}`).set('Cookie', authCookie);
    expect(clipDetail.status).toBe(200);
    const activeVer = clipDetail.body.data.activeVersion;
    expect(activeVer.edl.segments.length).toBeGreaterThanOrEqual(3);
    expect(activeVer.uploadPlaybook.audioMusicGuide.bpmRange).toContain('Kloning Ritme Referensi');

    const probed = await probeMediaAsset(`renders/${createdBatchId}/${clipId}/v1/video.mp4`, 'raw_video');
    expect(probed.width).toBe(1080);
    expect(probed.height).toBe(1920);

    // 5. Hapus profil ritme
    const delRes = await request(app)
      .delete(`/api/pacing-profiles/${profile.id}`)
      .set('Cookie', authCookie);
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.deleted).toBe(true);
  }, 60000);
});
