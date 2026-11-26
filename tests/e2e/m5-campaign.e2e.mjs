import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SHOT_DIR = path.join(ROOT_DIR, 'scratch', 'e2e-m5');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const API_PORT = 4012;
const WEB_PORT = 3012;
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
  const sampleVideoPath = path.join(SHOT_DIR, 'sample-raw-m5.mp4');
  await runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
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
  const qaEmail = `e2e-m5-${Date.now()}@clipstudio.local`;
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

    // Setup/Login QA user
    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#setup-name', 'QA M5 Owner');
    await page.fill('#auth-email', qaEmail);
    await page.fill('#auth-password', 'PasswordKuat123!');
    createdQaUser = true;
    await Promise.all([
      page.waitForURL('**/settings/api-keys', { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

    // 1. Buka /campaigns & Buat Campaign Baru
    await page.getByRole('link', { name: 'Antrean Campaign' }).click();
    await page.waitForURL('**/campaigns', { timeout: 10000 });
    await page.getByRole('button', { name: 'Buat Campaign Baru' }).click();
    await page.fill('#camp-title', 'Campaign E2E Promo TikTok');
    await page.fill('#camp-brand', 'Brand E2E');
    await page.fill('#camp-reward', 'Rp 20.000 / 10k views');
    await Promise.all([
      page.waitForURL('**/campaigns/*/studio', { timeout: 15000 }),
      page.getByRole('button', { name: 'Simpan & Buka Studio' }).click()
    ]);
    console.log('[PASS] M5 Flow 1: Create Campaign & masuk halaman Studio');

    // 2. Tempel & Ekstrak Brief -> Konfirmasi Rulebook
    await page.fill(
      '#brief-paste',
      'Campaign TikTok & YouTube Shorts Brand E2E.\nDurasi wajib 20-45 detik.\nWajib sertakan #BrandE2E dan @brande2e serta CTA link di bio.\nDilarang klaim palsu.'
    );
    await page.getByRole('button', { name: 'Ekstrak Aturan Brief Otomatis' }).click();
    await page.waitForSelector('#rb-goal', { timeout: 10000 });
    const tagsVal = await page.inputValue('#rb-tags');
    assert.ok(tagsVal.includes('#BrandE2E'), `Hashtag #BrandE2E harus terekstrak (got: ${tagsVal})`);

    await page.getByRole('button', { name: 'Konfirmasi Aturan Brief' }).click();
    await page.waitForSelector('text=Terkonfirmasi', { timeout: 10000 });
    console.log('[PASS] M5 Flow 2: Ekstraksi Brief otomatis & konfirmasi Editable Rulebook');

    // 3. Chunked Upload Video Uji Nyata -> Verifikasi Audio Diagnostic & Badge Siap M6
    await page.setInputFiles('#media-file', sampleVideoPath);
    await page.waitForSelector('text=sample-raw-m5.mp4', { timeout: 20000 });
    await page.waitForSelector('text=Diagnosa Audio', { timeout: 10000 });
    await page.waitForSelector('text=Bahan Lengkap (Siap Generator M6)', { timeout: 10000 });
    await page.screenshot({ path: path.join(SHOT_DIR, 'm5-studio-editing-room.png'), fullPage: true });
    console.log('[PASS] M5 Flow 3: Chunked Upload MP4 nyata + FFprobe + Audio Diagnostic + Siap M6');

    // 4. Switch ke Tema Editorial & Tactile + Mobile 390px Check
    await page.getByRole('button', { name: 'Editorial' }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOT_DIR, 'm5-studio-editorial.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Tactile' }).click();
    await page.waitForTimeout(200);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(mobileOverflow, false, 'Mobile 390px di M5 Studio tidak boleh horizontal overflow');
    await page.screenshot({ path: path.join(SHOT_DIR, 'm5-studio-mobile-tactile.png'), fullPage: true });
    console.log('[PASS] M5 Flow 4: 3 Tema Switchable + Mobile 390px zero overflow');

    assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join('; ')}`);
    assert.equal(failed5xx.length, 0, `HTTP 5xx: ${failed5xx.join('; ')}`);
    console.log('[PASS] M5 Flow 5: 0 console errors & 0 HTTP 5xx');
  } finally {
    if (browser) await browser.close();
    apiProc.kill();
    webProc.kill();
    fs.rmSync(sampleVideoPath, { force: true });

    if (createdQaUser) {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const user = await prisma.user.findUnique({ where: { email: qaEmail }, include: { campaigns: true } });
      if (user) {
        for (const c of user.campaigns) {
          fs.rmSync(path.join(ROOT_DIR, 'storage', 'uploads', c.id), { recursive: true, force: true });
        }
        await prisma.user.delete({ where: { id: user.id } });
      }
      await prisma.$disconnect();
      console.log('[CLEANUP] Data QA M5 & berkas upload dibersihkan.');
    }
  }
}

run().catch((err) => {
  console.error('[E2E M5 FAILED]', err);
  process.exit(1);
});
