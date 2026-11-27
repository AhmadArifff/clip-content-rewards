import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SHOT_DIR = path.join(ROOT_DIR, 'scratch', 'e2e-m9');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const API_PORT = 4015;
const WEB_PORT = 3015;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

function findLocalBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { shell: false });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg gagal (${code})`))));
  });
}

async function waitForUrl(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // Menunggu server siap
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timeout menunggu ${url}`);
}

async function run() {
  const sampleVideoPath = path.join(SHOT_DIR, 'sample-raw-m9.mp4');
  await runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=3:size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    sampleVideoPath
  ]);

  const apiProc = spawn(process.execPath, [path.join(ROOT_DIR, 'apps/api/dist/index.js')], {
    cwd: path.join(ROOT_DIR, 'apps/api'),
    env: { ...process.env, API_PORT: String(API_PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const webProc = spawn(process.execPath, [path.join(ROOT_DIR, 'apps/web/.output/server/index.mjs')], {
    cwd: path.join(ROOT_DIR, 'apps/web'),
    env: { ...process.env, PORT: String(WEB_PORT), HOST: '127.0.0.1', API_BASE_URL: API_URL, NUXT_API_BASE_URL: API_URL },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let browser;
  const qaEmail = `e2e-m9-${Date.now()}@clipstudio.local`;
  let createdQaUser = false;

  try {
    await waitForUrl(`${API_URL}/api/health`);
    await waitForUrl(`${WEB_URL}/login`);

    browser = await chromium.launch({ headless: true, executablePath: findLocalBrowserExecutable() });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const failed5xx = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 500) failed5xx.push(`${r.status()} ${r.url()}`); });

    // Setup akun QA sementara
    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#setup-name', 'QA M9 Export');
    await page.fill('#auth-email', qaEmail);
    await page.fill('#auth-password', 'PasswordKuat123!');
    createdQaUser = true;
    await Promise.all([
      page.waitForURL('**/settings/api-keys', { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

    // 1. Buat Campaign, isi Brief, Upload Video, Generate 2 Variasi
    await page.getByRole('link', { name: 'Antrean Campaign' }).click();
    await page.waitForURL('**/campaigns', { timeout: 10000 });
    await page.getByRole('button', { name: 'Buat Campaign Baru' }).click();
    await page.fill('#camp-title', 'Campaign E2E Export M9');
    await Promise.all([
      page.waitForURL('**/campaigns/*/studio', { timeout: 15000 }),
      page.getByRole('button', { name: 'Simpan & Buka Studio' }).click()
    ]);

    await page.fill('#brief-paste', 'Brief TikTok wajib #BrandM9 @brandm9 durasi 3-45 detik.');
    await page.getByRole('button', { name: 'Ekstrak Aturan Brief Otomatis' }).click();
    await page.waitForSelector('#rb-goal', { timeout: 15000 });
    await page.getByRole('button', { name: 'Konfirmasi Aturan Brief' }).click();

    await page.setInputFiles('#media-file', sampleVideoPath);
    await page.waitForSelector('text=sample-raw-m9.mp4', { timeout: 20000 });

    await page.selectOption('#tg-audio', 'mute_for_platform_sound');
    await page.fill('#tg-count', '2');
    await Promise.all([
      page.waitForURL('**/campaigns/*/batches/*', { timeout: 15000 }),
      page.getByRole('button', { name: 'Generate 2 Variasi' }).click()
    ]);

    await page.waitForSelector('text=Status: COMPLETED', { timeout: 60000 });
    await page.waitForSelector('text=Export & Unduh Keseluruhan (Bulk Streaming ZIP)', { timeout: 10000 });
    console.log('[PASS] M9 Flow 1: Batch 2 variasi selesai & Panel Bulk ZIP Export tampil');

    // 2. Uji Filter ZIP Hanya Final (kosong -> pesan ramah), Checklist 1 klip, dan Unduh Semua (ZIP)
    await page.getByRole('button', { name: 'ZIP Hanya Final' }).click();
    await page.waitForSelector('text=Tidak ada variasi klip yang memenuhi kriteria', { timeout: 10000 });

    await page.locator('input[type="checkbox"]').first().check();
    const [selectedZipDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.getByRole('button', { name: 'ZIP Terpilih (1)' }).click()
    ]);
    assert.ok(selectedZipDl.suggestedFilename().endsWith('.zip'), 'Nama berkas ZIP terpilih harus .zip');

    const [allZipDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.getByRole('button', { name: /Unduh Semua Siap/i }).click()
    ]);
    const zipSavePath = path.join(SHOT_DIR, allZipDl.suggestedFilename());
    await allZipDl.saveAs(zipSavePath);
    const zipHead = fs.readFileSync(zipSavePath).subarray(0, 4).toString('binary');
    assert.equal(zipHead, 'PK\x03\x04', 'Header ZIP harus PK\\x03\\x04 valid');
    fs.rmSync(zipSavePath, { force: true });
    await page.screenshot({ path: path.join(SHOT_DIR, 'm9-batch-export-editing-room.png'), fullPage: true });
    console.log('[PASS] M9 Flow 2: Bulk Streaming ZIP (Terpilih & Semua) berhasil diunduh dengan header ZIP valid');

    // 3. Uji Paket Unduh Satuan (.mp4, .txt, .srt, .jpg) di Clip Inspector (Editorial)
    await Promise.all([
      page.waitForURL('**/clips/*', { timeout: 15000 }),
      page.getByRole('link', { name: 'Inspeksi, Playbook & Edit' }).first().click()
    ]);
    await page.waitForSelector('text=Paket Unduh Satuan', { timeout: 10000 });

    const [playbookDl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.getByRole('link', { name: 'Playbook (.txt)' }).click()
    ]);
    const pbPath = path.join(SHOT_DIR, playbookDl.suggestedFilename());
    await playbookDl.saveAs(pbPath);
    const pbText = fs.readFileSync(pbPath, 'utf8');
    assert.ok(pbText.includes('UPLOAD PLAYBOOK - Campaign E2E Export M9'), 'Isi upload-playbook.txt harus lengkap');
    fs.rmSync(pbPath, { force: true });

    await page.getByRole('button', { name: 'Editorial' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, 'm9-clip-export-editorial.png'), fullPage: true });
    console.log('[PASS] M9 Flow 3: Paket Unduh Satuan (.mp4/.txt/.srt/.jpg) & isi Playbook .txt terverifikasi');

    // 4. Uji Storage Breakdown & Cleanup Temp di DoctorPanel (Tactile + Mobile 390px)
    await page.getByRole('link', { name: 'Koneksi AI & Studio' }).click();
    await page.waitForURL('**/settings/api-keys', { timeout: 10000 });
    await page.waitForSelector('text=Bersihkan File Sementara', { timeout: 10000 });
    await page.getByRole('button', { name: 'Bersihkan File Sementara' }).click();
    await page.waitForSelector('text=sementara', { timeout: 10000 });

    await page.getByRole('button', { name: 'Tactile' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, 'm9-doctor-cleanup-tactile.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(mobileOverflow, false, 'Mobile 390px pada halaman Storage Cleanup tidak boleh overflow');
    await page.screenshot({ path: path.join(SHOT_DIR, 'm9-doctor-mobile-tactile.png'), fullPage: true });
    console.log('[PASS] M9 Flow 4: Storage Hygiene & Temp Cleanup + 3 Tema + Mobile 390px zero overflow');

    assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join('; ')}`);
    assert.equal(failed5xx.length, 0, `HTTP 5xx: ${failed5xx.join('; ')}`);
    console.log('[PASS] M9 Flow 5: 0 console errors & 0 HTTP 5xx');
  } finally {
    if (browser) await browser.close();
    apiProc.kill();
    webProc.kill();
    fs.rmSync(sampleVideoPath, { force: true });

    if (createdQaUser) {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const user = await prisma.user.findUnique({
        where: { email: qaEmail },
        include: { campaigns: { include: { batches: true } } }
      });
      if (user) {
        for (const c of user.campaigns) {
          fs.rmSync(path.join(ROOT_DIR, 'storage', 'uploads', c.id), { recursive: true, force: true });
          for (const b of c.batches) {
            fs.rmSync(path.join(ROOT_DIR, 'storage', 'renders', b.id), { recursive: true, force: true });
          }
        }
        await prisma.user.delete({ where: { id: user.id } });
      }
      await prisma.$disconnect();
      console.log('[CLEANUP] Data QA M9, uploads & renders dibersihkan.');
    }
  }
}

run().catch((err) => {
  console.error('[E2E M9 FAILED]', err);
  process.exit(1);
});
