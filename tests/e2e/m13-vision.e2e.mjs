import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SHOT_DIR = path.join(ROOT_DIR, 'scratch', 'e2e-m13');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const API_PORT = 4018;
const WEB_PORT = 3018;
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
  const sampleVideoPath = path.join(SHOT_DIR, 'sample-two-speakers-m13.mp4');
  await runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', "color=c=0x101828:s=1280x720:d=6:r=30,drawbox=x=110:y=140:w=220:h=260:color=0xE4B08E:t=fill:enable='lt(t,3)',drawbox=x=950:y=140:w=220:h=260:color=0xE4B08E:t=fill:enable='gte(t,3)'",
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6',
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
  const qaEmail = `e2e-m13-${Date.now()}@clipstudio.local`;
  let createdQaUser = false;

  try {
    await waitForUrl(`${API_URL}/api/health`);
    await waitForUrl(`${WEB_URL}/login`);

    browser = await chromium.launch({ headless: true, executablePath: findLocalBrowserExecutable() });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const failed5xx = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('status of 401')) {
        consoleErrors.push(m.text());
      }
    });
    page.on('response', (r) => { if (r.status() >= 500) failed5xx.push(`${r.status()} ${r.url()}`); });

    // Buat akun QA sementara secara aman tanpa menyentuh akun asli pemilik studio
    const { PrismaClient } = await import('@prisma/client');
    const bcryptMod = await import('bcryptjs');
    const bcrypt = bcryptMod.default || bcryptMod;
    const setupPrisma = new PrismaClient();
    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await setupPrisma.user.create({
      data: { name: 'QA M13 Vision', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    await setupPrisma.$disconnect();
    createdQaUser = true;

    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    try {
      await page.waitForSelector('#auth-email', { timeout: 15000 });
    } catch (e) {
      const htmlSnippet = (await page.content()).slice(0, 600);
      console.error('[DIAG] URL:', page.url(), 'pageErrors:', pageErrors, 'consoleErrors:', consoleErrors, 'html:', htmlSnippet);
      throw e;
    }
    await page.fill('#auth-email', qaEmail);
    await page.fill('#auth-password', 'PasswordKuat123!');
    await Promise.all([
      page.waitForURL('**/settings/api-keys', { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

    // 1. Buat Campaign, Upload 6s Video 2-Pembicara, Generate 1 Variasi, Buka Clip Inspector
    await page.getByRole('link', { name: 'Antrean Campaign' }).click();
    await page.waitForURL('**/campaigns', { timeout: 10000 });
    await page.getByRole('button', { name: 'Buat Campaign Baru' }).click();
    await page.fill('#camp-title', 'Campaign E2E Smart Auto-Track M13');
    await Promise.all([
      page.waitForURL('**/campaigns/*/studio', { timeout: 15000 }),
      page.getByRole('button', { name: 'Simpan & Buka Studio' }).click()
    ]);

    await page.setInputFiles('#media-file', sampleVideoPath);
    await page.waitForSelector('text=sample-two-speakers-m13.mp4', { timeout: 20000 });

    await page.fill('#tg-count', '1');
    await Promise.all([
      page.waitForURL('**/campaigns/*/batches/*', { timeout: 15000 }),
      page.getByRole('button', { name: 'Generate 1 Variasi' }).click()
    ]);

    await page.waitForSelector('text=Status: COMPLETED', { timeout: 60000 });
    await Promise.all([
      page.waitForURL('**/clips/*', { timeout: 15000 }),
      page.getByRole('link', { name: 'Inspeksi, Playbook & Edit' }).first().click()
    ]);
    await page.waitForSelector('text=Skor Potensi Viral (v1)', { timeout: 15000 });
    console.log('[PASS] M13 Flow 1: Klip v1 siap dibuka di Clip Inspector');

    // 2. Pindai 6 Kandidat Cover -> Verifikasi badge TOP -> Klik kandidat -> Pastikan cover diperbarui
    await page.getByRole('button', { name: 'Pindai 6 Kandidat Cover' }).click();
    await page.waitForSelector('text=TOP', { timeout: 20000 });
    await page.waitForSelector('img[alt*="Kandidat cover detik"]', { timeout: 10000 });
    const candCount = await page.locator('img[alt*="Kandidat cover detik"]').count();
    assert.equal(candCount, 6, 'Harus menampilkan tepat 6 thumbnail kandidat cover');

    // Klik kandidat ke-2 untuk menetapkan cover baru
    await page.locator('button[title*="Pilih frame detik"]').nth(1).click();
    await page.waitForSelector('text=Sampul cover v1 diperbarui dari detik', { timeout: 15000 });
    await page.screenshot({ path: path.join(SHOT_DIR, 'm13-cover-editing-room.png'), fullPage: true });
    console.log('[PASS] M13 Flow 2: Pindai 6 kandidat cover + badge TOP + simpan cover frame baru');

    // 3. Switch Editorial -> Buka Tab Timeline Visual -> Belah Segmen -> Auto-Deteksi Fokus Subjek -> Render v2
    await page.getByRole('button', { name: 'Editorial' }).click();
    await page.waitForTimeout(250);
    await page.getByRole('tab', { name: /Timeline Visual|Timeline/i }).click();
    await page.waitForSelector('text=Visual Multi-Track Timeline', { timeout: 10000 });

    await page.getByRole('button', { name: 'Belah Segmen' }).click();
    await page.waitForSelector('text=2 Segmen', { timeout: 5000 });

    await page.getByRole('button', { name: 'Auto-Deteksi Fokus Subjek' }).click();
    await page.waitForSelector('text=Framing diset ke Smart Auto-Track 9:16', { timeout: 20000 });

    const framingVal = await page.locator('#tl-framing').inputValue();
    assert.equal(framingVal, 'auto_face_track', 'Mode framing harus otomatis berpindah ke auto_face_track');
    await page.screenshot({ path: path.join(SHOT_DIR, 'm13-autotrack-editorial.png'), fullPage: true });

    await page.getByRole('button', { name: 'Render Timeline ke v2' }).click();
    await page.waitForSelector('text=Versi v2 selesai dirender dari Visual Timeline', { timeout: 45000 });
    await page.waitForSelector('text=Framing: auto_face_track', { timeout: 10000 });
    console.log('[PASS] M13 Flow 3: Belah 2 segmen -> Auto-Deteksi Fokus Subjek -> Render v2 auto_face_track');

    // 4. Tema Tactile + Mobile 390px zero horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Tactile' }).click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: 'Pindai 6 Kandidat Cover' }).click();
    await page.waitForSelector('text=TOP', { timeout: 20000 });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(mobileOverflow, false, 'Mobile 390px pada halaman M13 tidak boleh overflow horizontal');
    await page.screenshot({ path: path.join(SHOT_DIR, 'm13-vision-mobile-tactile.png'), fullPage: true });

    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join('; ')}`);
    assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join('; ')}`);
    assert.equal(failed5xx.length, 0, `HTTP 5xx: ${failed5xx.join('; ')}`);
    console.log('[PASS] M13 Flow 4: 3 Tema + Mobile 390px zero overflow + 0 console errors & 0 HTTP 5xx');
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
      console.log('[CLEANUP] Data QA M13, uploads & renders dibersihkan.');
    }
  }
}

run().catch((err) => {
  console.error('[E2E M13 FAILED]', err);
  process.exit(1);
});
