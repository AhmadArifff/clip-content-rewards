import { spawn } from 'node:child_process';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import { hexToAssColor } from '../services/media/ass-subtitle.builder.js';
import { probeMediaAsset } from '../services/media/media-probe.service.js';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg gagal (${code})`))));
  });
}

describe('M15 Frame-by-Frame Visual Annotation & Brand Asset Kit (ASS Colors + Logo Watermark)', () => {
  const app = createApp();
  const qaEmail = `qa-m15-${Date.now()}@clipstudio.local`;
  let authCookie = '';
  let sampleVideoPath = '';
  let sampleLogoPath = '';
  let createdCampaignId = '';
  let createdBatchId = '';
  let createdKitId = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await prisma.user.create({
      data: { name: 'QA M15 Studio Kit', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: qaEmail,
      password: 'PasswordKuat123!'
    });
    authCookie = loginRes.headers['set-cookie'][0];

    sampleVideoPath = resolveSafeStoragePath(`temp/qa_m15_${Date.now()}.mp4`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=4:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      sampleVideoPath
    ]);

    sampleLogoPath = resolveSafeStoragePath(`temp/qa_m15_logo_${Date.now()}.png`);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'color=c=0xE11D48:s=160x160:d=1',
      '-frames:v', '1',
      sampleLogoPath
    ]);
  }, 30000);

  afterAll(async () => {
    fs.rmSync(sampleVideoPath, { force: true });
    fs.rmSync(sampleLogoPath, { force: true });
    if (createdKitId) {
      fs.rmSync(resolveSafeStoragePath(`brand-kits/${createdKitId}`), { recursive: true, force: true });
    }
    if (createdBatchId) {
      fs.rmSync(resolveSafeStoragePath(`renders/${createdBatchId}`), { recursive: true, force: true });
    }
    if (createdCampaignId) {
      fs.rmSync(resolveSafeStoragePath(`uploads/${createdCampaignId}`), { recursive: true, force: true });
    }
    await prisma.user.deleteMany({ where: { email: qaEmail } });
  });

  it('mengelola Brand Kit + logo PNG + warna ASS FFmpeg, serta CRUD Pin Anotasi Frame per klip', async () => {
    // 0. Uji konversi Hex -> ASS (&HAABBGGRR)
    expect(hexToAssColor('#E11D48')).toBe('&H00481DE1');
    expect(hexToAssColor('#F59E0B')).toBe('&H000B9EF5');
    expect(hexToAssColor('invalid')).toBeNull();

    // 1. Buat Brand Asset Kit & unggah logo PNG valid
    const kitRes = await request(app)
      .post('/api/brand-kits')
      .set('Cookie', authCookie)
      .send({
        name: 'Brand Kit Uji M15',
        brandTagline: 'Merah Marun & Emas',
        primaryColorHex: '#E11D48',
        accentColorHex: '#F59E0B',
        captionFontFamily: 'Arial',
        defaultCaptionStyle: 'hormozi_bold',
        defaultWatermarkPos: 'top_right_safe',
        defaultWatermarkOpacity: 0.9,
        defaultCtaTemplate: 'Cek keranjang sekarang #BrandM15'
      });
    expect(kitRes.status).toBe(201);
    createdKitId = kitRes.body.data.id;

    // Tolak format non-gambar
    const badLogoRes = await request(app)
      .post(`/api/brand-kits/${createdKitId}/logo`)
      .set('Cookie', authCookie)
      .attach('logo', Buffer.from('not an image'), { filename: 'bad.txt', contentType: 'text/plain' });
    expect(badLogoRes.status).toBe(400);
    expect(badLogoRes.body.error.code).toBe('INVALID_LOGO_FORMAT');

    // Unggah PNG valid & verifikasi GET logo
    const logoUpRes = await request(app)
      .post(`/api/brand-kits/${createdKitId}/logo`)
      .set('Cookie', authCookie)
      .attach('logo', fs.readFileSync(sampleLogoPath), { filename: 'brand-logo.png', contentType: 'image/png' });
    expect(logoUpRes.status).toBe(200);
    expect(logoUpRes.body.data.hasLogo).toBe(true);

    const logoServeRes = await request(app)
      .get(`/api/brand-kits/${createdKitId}/logo`)
      .set('Cookie', authCookie);
    expect(logoServeRes.status).toBe(200);
    expect(logoServeRes.headers['content-type']).toContain('image/png');

    // 2. Buat Campaign, upload video 4s, generate 1 variasi memakai Brand Kit
    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Cookie', authCookie)
      .send({ title: 'Campaign M15 Brand Kit', brandOwner: 'Brand M15', platformTargets: ['tiktok'] });
    createdCampaignId = campRes.body.data.id;

    const upId = `up_m15_${Date.now()}`;
    await request(app)
      .post(`/api/campaigns/${createdCampaignId}/media/chunk`)
      .set('Cookie', authCookie)
      .field('uploadId', upId)
      .field('chunkIndex', '0')
      .attach('chunk', fs.readFileSync(sampleVideoPath), 'p0.bin');

    await request(app)
      .post(`/api/campaigns/${createdCampaignId}/media/complete`)
      .set('Cookie', authCookie)
      .send({
        uploadId: upId,
        originalFilename: 'raw-m15.mp4',
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
          initialAudioMode: 'ducking_20',
          batchDiversityMode: 'distinct_moments',
          batchCount: 1,
          brandKitId: createdKitId
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

    // Verifikasi berkas ASS menggunakan warna & font & CTA Brand Kit, dan MP4 valid 1080x1920
    const assContent = fs.readFileSync(
      resolveSafeStoragePath(`renders/${createdBatchId}/${clipId}/v1/subtitles.ass`),
      'utf8'
    );
    expect(assContent).toContain('&H00481DE1');
    expect(assContent).toContain('&H000B9EF5');
    expect(assContent).toContain('Arial');
    expect(assContent.replace(/\\N/g, ' ')).toContain('Cek keranjang sekarang #BrandM15');

    const probed = await probeMediaAsset(`renders/${createdBatchId}/${clipId}/v1/video.mp4`, 'raw_video');
    expect(probed.width).toBe(1080);
    expect(probed.height).toBe(1920);

    // 3. CRUD Frame-by-Frame Visual Annotation pada klip tersebut
    const createAnn = await request(app)
      .post(`/api/clips/${clipId}/annotations`)
      .set('Cookie', authCookie)
      .send({
        timestampSec: 1.43,
        xPct: 42.5,
        yPct: 74.0,
        category: 'subtitle',
        noteText: 'Naikkan subtitle agar tidak ketutup tombol kanan bawah'
      });
    expect(createAnn.status).toBe(201);
    const annId = createAnn.body.data.id;
    expect(createAnn.body.data.status).toBe('open');

    const listAnn = await request(app)
      .get(`/api/clips/${clipId}/annotations`)
      .set('Cookie', authCookie);
    expect(listAnn.status).toBe(200);
    expect(listAnn.body.data.length).toBe(1);

    const resolveAnn = await request(app)
      .patch(`/api/annotations/${annId}`)
      .set('Cookie', authCookie)
      .send({ status: 'resolved' });
    expect(resolveAnn.status).toBe(200);
    expect(resolveAnn.body.data.status).toBe('resolved');

    const delAnn = await request(app)
      .delete(`/api/annotations/${annId}`)
      .set('Cookie', authCookie);
    expect(delAnn.status).toBe(200);
    expect(delAnn.body.data.deleted).toBe(true);

    // 4. Hapus Brand Kit & pastikan direktori logo ikut terhapus bersih
    const delKit = await request(app)
      .delete(`/api/brand-kits/${createdKitId}`)
      .set('Cookie', authCookie);
    expect(delKit.status).toBe(200);
    expect(fs.existsSync(resolveSafeStoragePath(`brand-kits/${createdKitId}`))).toBe(false);
    createdKitId = '';
  }, 90000);
});
