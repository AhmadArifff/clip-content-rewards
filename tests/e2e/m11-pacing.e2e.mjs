import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SHOT_DIR = path.join(ROOT_DIR, 'scratch', 'e2e-m11');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const API_PORT = 4016;
const WEB_PORT = 3016;
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
  const refVideoPath = path.join(SHOT_DIR, 'ref-multicut-m11.mp4');
  const rawVideoPath = path.join(SHOT_DIR, 'raw-campaign-m11.mp4');

  await runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=1.5:size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'smptebars=duration=1.5:size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'rgbtestsrc=duration=1.5:size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'color=c=orange:duration=1.5:size=640x360:rate=30',
    '-filter_complex', '[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]',
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    refVideoPath
  ]);

  await runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=6:size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=6',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    rawVideoPath
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
  const qaEmail = `e2e-m11-${Date.now()}@clipstudio.local`;
  let createdQaUser = false;

  try {
    await waitForUrl(`${API_URL}/api/health`);
    await waitForUrl(`${WEB_URL}/login`);

    browser = await chromium.launch({ headless: true, executablePath: findLocalBrowserExecutable() });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const failed5xx = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 500) failed5xx.push(`${r.status()} ${r.url()}`); });

    // Setup akun QA sementara
    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#setup-name', 'QA M11 Pacing');
    await page.fill('#auth-email', qaEmail);
    await page.fill('#auth-password', 'PasswordKuat123!');
    createdQaUser = true;
    await Promise.all([
      page.waitForURL('**/settings/api-keys', { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

    // 1. Buka menu Ritme Referensi (/pacing) -> Upload & Analisis Video Multi-Cut
    await page.getByRole('link', { name: 'Ritme Referensi' }).click();
    await page.waitForURL('**/pacing', { timeout: 10000 });
    await page.fill('#pacing-name', 'Hook Viral Cepat M11');
    await page.setInputFiles('#pacing-file', refVideoPath);
    await page.getByRole('button', { name: 'Analisis & Ekstrak Ritme' }).click();

    await page.waitForSelector('text=Hook Viral Cepat M11', { timeout: 30000 });
    await page.waitForSelector('text=Visualisasi Pola Potongan Shot', { timeout: 10000 });
    await page.screenshot({ path: path.join(SHOT_DIR, 'm11-pacing-editing-room.png'), fullPage: true });
    console.log('[PASS] M11 Flow 1: Analisis video referensi multi-cut & visualisasi pola shot tampil');

    // 2. Switch Tema Editorial pada /pacing
    await page.getByRole('button', { name: 'Editorial' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, 'm11-pacing-editorial.png'), fullPage: true });

    // 3. Terapkan Profil Ritme ke Campaign Studio -> Generate 1 Variasi -> Cek Playbook BPM Kloning
    await page.getByRole('link', { name: 'Daftar Campaign' }).click();
    await page.waitForURL('**/campaigns', { timeout: 10000 });
    await page.getByRole('button', { name: 'Buat Campaign Baru' }).click();
    await page.fill('#camp-title', 'Campaign E2E Kloning Ritme M11');
    await Promise.all([
      page.waitForURL('**/campaigns/*/studio', { timeout: 15000 }),
      page.getByRole('button', { name: 'Simpan & Buka Studio' }).click()
    ]);

    await page.setInputFiles('#media-file', rawVideoPath);
    await page.waitForSelector('text=raw-campaign-m11.mp4', { timeout: 20000 });

    const pacingOptVal = await page.locator('#tg-pacing option').nth(1).getAttribute('value');
    assert.ok(pacingOptVal, 'Dropdown #tg-pacing harus berisi profil ritme yang baru dianalisis');
    await page.selectOption('#tg-pacing', pacingOptVal);
    await page.selectOption('#tg-audio', 'mute_for_platform_sound');
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
    await page.waitForSelector('text=Kloning ritme referensi aktif', { timeout: 10000 });
    await page.getByRole('tab', { name: /Playbook/i }).click();
    await page.waitForSelector('text=(Kloning Ritme Referensi)', { timeout: 10000 });
    console.log('[PASS] M11 Flow 2: Profil ritme diterapkan di Studio -> render multi-cut & BPM Playbook tersinkron');

    // 4. Kembali ke /pacing -> Tactile + Mobile 390px zero overflow -> Hapus profil
    await page.getByRole('button', { name: 'Tactile' }).click();
    await page.getByRole('link', { name: 'Kloning Ritme' }).click();
    await page.waitForURL('**/pacing', { timeout: 10000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(mobileOverflow, false, 'Mobile 390px pada halaman /pacing tidak boleh overflow horizontal');
    await page.screenshot({ path: path.join(SHOT_DIR, 'm11-pacing-mobile-tactile.png'), fullPage: true });

    await page.getByRole('button', { name: 'Hapus Hook Viral Cepat M11' }).click();
    await page.waitForSelector('text=Profil ritme referensi berhasil dihapus.', { timeout: 10000 });
    console.log('[PASS] M11 Flow 3: 3 Tema Switchable + Mobile 390px zero overflow + Hapus profil bersih');

    assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join('; ')}`);
    assert.equal(failed5xx.length, 0, `HTTP 5xx: ${failed5xx.join('; ')}`);
    console.log('[PASS] M11 Flow 4: 0 console errors & 0 HTTP 5xx');
  } finally {
    if (browser) await browser.close();
    apiProc.kill();
    webProc.kill();
    fs.rmSync(refVideoPath, { force: true });
    fs.rmSync(rawVideoPath, { force: true });

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
      console.log('[CLEANUP] Data QA M11, uploads & renders dibersihkan.');
    }
  }
}

run().catch((err) => {
  console.error('[E2E M11 FAILED]', err);
  process.exit(1);
});
