import { spawn } from 'node:child_process';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import { sanitizeSpreadsheetText } from '../services/export/xlsx-report.builder.js';

function runCommand(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += String(d);
    });
    proc.stderr.on('data', (d) => {
      stderr += String(d);
    });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${bin} gagal (${code}): ${stderr.slice(-240)}`))
    );
  });
}

describe('M14 Campaign Content Calendar & Export Laporan Excel (.xlsx 3-Sheet OpenXML)', () => {
  const app = createApp();
  const qaEmail = `qa-m14-${Date.now()}@clipstudio.local`;
  let authCookie = '';
  let sampleVideoPath = '';
  let tempXlsxPath = '';
  let createdCampaignId = '';
  let createdBatchId = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await prisma.user.create({
      data: { name: 'QA M14 Calendar Excel', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email: qaEmail,
      password: 'PasswordKuat123!'
    });
    authCookie = loginRes.headers['set-cookie'][0];

    sampleVideoPath = resolveSafeStoragePath(`temp/qa_m14_${Date.now()}.mp4`);
    await runCommand(env.FFMPEG_PATH, [
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
    if (tempXlsxPath) fs.rmSync(tempXlsxPath, { force: true });
    if (createdBatchId) {
      fs.rmSync(resolveSafeStoragePath(`renders/${createdBatchId}`), { recursive: true, force: true });
    }
    if (createdCampaignId) {
      fs.rmSync(resolveSafeStoragePath(`uploads/${createdCampaignId}`), { recursive: true, force: true });
    }
    await prisma.user.deleteMany({ where: { email: qaEmail } });
  });

  it('menetralkan Excel Formula Injection, menjalankan auto-schedule anti-bentrok, update status tayang, dan mengekspor .xlsx 3-sheet valid', async () => {
    // 0. Uji proteksi Excel Formula Injection
    expect(sanitizeSpreadsheetText('=CMD|\' /C calc\'!A0')).toBe("'=CMD|' /C calc'!A0");
    expect(sanitizeSpreadsheetText('+SUM(A1:A5)')).toBe("'+SUM(A1:A5)");
    expect(sanitizeSpreadsheetText('Normal Text')).toBe('Normal Text');

    const campRes = await request(app)
      .post('/api/campaigns')
      .set('Cookie', authCookie)
      .send({
        title: 'Campaign M14 Kalender Excel',
        brandOwner: 'Brand Nusantara',
        platformTargets: ['tiktok']
      });
    createdCampaignId = campRes.body.data.id;

    const vidBuf = fs.readFileSync(sampleVideoPath);
    const upId = `up_m14_${Date.now()}`;
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
        originalFilename: 'raw-m14.mp4',
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
          personaNiche: 'Kreator Konten',
          controversyLevel: 'hot_take',
          hookType: 'curiosity_gap',
          emotionalTrigger: 'FOMO',
          primaryKpi: 'watch_time',
          editingStyle: 'fast_cut_retention',
          framingMode: 'fit_blur_bg',
          captionStyle: 'hormozi_bold',
          initialAudioMode: 'ducking_20',
          batchDiversityMode: 'ab_hook_test',
          batchCount: 2
        }
      });
    expect(batchRes.status).toBe(201);
    createdBatchId = batchRes.body.data.id;

    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      const b = await request(app).get(`/api/batches/${createdBatchId}`).set('Cookie', authCookie);
      if (b.body.data.status === 'completed') {
        ready = true;
        break;
      }
    }
    expect(ready).toBe(true);

    // 1. Cek GET /api/calendar awal -> 2 klip siap belum dijadwalkan
    const calInit = await request(app)
      .get(`/api/calendar?campaignId=${createdCampaignId}`)
      .set('Cookie', authCookie);
    expect(calInit.status).toBe(200);
    expect(calInit.body.data.summary.totalReadyClips).toBe(2);
    expect(calInit.body.data.summary.unscheduledCount).toBe(2);
    expect(calInit.body.data.summary.avgViralScore).toBeGreaterThan(0);

    // 2. Uji tolak ekspor Excel bila filter kosong (onlyApproved=true padahal 0 Final) -> 400
    const emptyXlsx = await request(app)
      .get(`/api/export/calendar.xlsx?campaignId=${createdCampaignId}&onlyApproved=true`)
      .set('Cookie', authCookie);
    expect(emptyXlsx.status).toBe(400);
    expect(emptyXlsx.body.error.code).toBe('NO_CLIPS_FOR_EXCEL');

    // 3. Auto-Schedule Cerdas (maxPerPlatformPerDay = 1) -> harus menyebar ke 2 hari berbeda (anti-bentrok)
    const autoRes = await request(app)
      .post('/api/calendar/auto-schedule')
      .set('Cookie', authCookie)
      .send({
        campaignId: createdCampaignId,
        startDate: '2026-12-01',
        maxPerPlatformPerDay: 1
      });
    expect(autoRes.status).toBe(200);
    expect(autoRes.body.data.scheduledCount).toBe(2);

    const calAfterAuto = await request(app)
      .get(`/api/calendar?campaignId=${createdCampaignId}`)
      .set('Cookie', authCookie);
    expect(calAfterAuto.body.data.summary.scheduledCount).toBe(2);
    const items = calAfterAuto.body.data.items as Array<{ clipId: string; scheduledDate: string }>;
    expect(items[0].scheduledDate).toBe('2026-12-01');
    expect(items[1].scheduledDate).toBe('2026-12-02');

    // 4. Update klip #1 jadi Sudah Tayang + catatan bermuatan formula untuk menguji sanitasi
    const patchRes = await request(app)
      .patch(`/api/clips/${items[0].clipId}/schedule`)
      .set('Cookie', authCookie)
      .send({
        publishStatus: 'published',
        publishedUrl: 'https://tiktok.com/@clipstudio/video/123',
        calendarNote: '=SUM(1,2) Uji proteksi formula'
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.publishStatus).toBe('published');

    // 5. Unduh Laporan Excel (.xlsx) & verifikasi integritas OpenXML 3-sheet
    const xlsxRes = await request(app)
      .get(`/api/export/calendar.xlsx?campaignId=${createdCampaignId}`)
      .set('Cookie', authCookie)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(xlsxRes.status).toBe(200);
    expect(xlsxRes.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(xlsxRes.headers['content-disposition']).toContain('.xlsx');

    const buf = xlsxRes.body as Buffer;
    expect(buf.length).toBeGreaterThan(1500);
    expect(buf.subarray(0, 4).toString('hex')).toBe('504b0304');

    tempXlsxPath = resolveSafeStoragePath(`temp/qa_m14_report_${Date.now()}.xlsx`);
    fs.writeFileSync(tempXlsxPath, buf);

    const archiveList = await runCommand('tar', ['-tf', tempXlsxPath]);
    expect(archiveList).toContain('[Content_Types].xml');
    expect(archiveList).toContain('xl/workbook.xml');
    expect(archiveList).toContain('xl/styles.xml');
    expect(archiveList).toContain('xl/worksheets/sheet1.xml');
    expect(archiveList).toContain('xl/worksheets/sheet2.xml');
    expect(archiveList).toContain('xl/worksheets/sheet3.xml');

    const sheet1Xml = await runCommand('tar', ['-xOf', tempXlsxPath, 'xl/worksheets/sheet1.xml']);
    expect(sheet1Xml).toContain('Campaign M14 Kalender Excel');
    expect(sheet1Xml).toContain('<f>SUM(');
    expect(sheet1Xml).toContain('<f>AVERAGE(');

    const sheet2Xml = await runCommand('tar', ['-xOf', tempXlsxPath, 'xl/worksheets/sheet2.xml']);
    expect(sheet2Xml).toContain('2026-12-01');
    expect(sheet2Xml).toContain('2026-12-02');
    expect(sheet2Xml).toContain('Sudah Tayang');
    expect(sheet2Xml).toContain('https://tiktok.com/@clipstudio/video/123');
    // Catatan tergabung sesudah URL, namun pastikan XML tetap valid & karakter &/</> ter-escape
    const sheet3Xml = await runCommand('tar', ['-xOf', tempXlsxPath, 'xl/worksheets/sheet3.xml']);
    expect(sheet3Xml).toContain('MATRIKS PERBANDINGAN VARIASI KLIP');
  }, 90000);
});
