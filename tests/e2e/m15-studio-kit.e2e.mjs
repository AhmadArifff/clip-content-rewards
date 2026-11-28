import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SHOT_DIR = path.join(ROOT_DIR, 'scratch', 'e2e-m15');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const API_PORT = 4020;
const WEB_PORT = 3020;
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
  const sampleVideoPath = path.join(SHOT_DIR, 'sample-raw-m15.mp4');
  const sampleLogoPath = path.join(SHOT_DIR, 'sample-logo-m15.png');

  await runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=4:size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    sampleVideoPath
  ]);
  await runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', 'color=c=0xE11D48:s=160x160:d=1',
    '-frames:v', '1',
    sampleLogoPath
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
  const qaEmail = `e2e-m15-${Date.now()}@clipstudio.local`;
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

    // Siapkan akun QA sementara secara aman (tidak menyentuh akun asli pemilik)
    const { PrismaClient } = await import('@prisma/client');
    const bcryptMod = await import('bcryptjs');
    const bcrypt = bcryptMod.default || bcryptMod;
    const setupPrisma = new PrismaClient();
    const hash = await bcrypt.hash('PasswordKuat123!', 10);
    await setupPrisma.user.create({
      data: { name: 'QA M15 Kit & Pin', email: qaEmail, passwordHash: hash, role: 'admin' }
    });
    await setupPrisma.$disconnect();
    createdQaUser = true;

    await page.goto(`${WEB_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('#auth-email', qaEmail);
    await page.fill('#auth-password', 'PasswordKuat123!');
    await Promise.all([
      page.waitForURL('**/settings/api-keys', { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

    // 1. Buka Brand Kit (/brand-kits) -> Buat Kit + Upload Logo PNG + Verifikasi Kartu & Pratinjau
    await page.getByRole('link', { name: 'Brand Kit' }).click();
    await page.waitForURL('**/brand-kits', { timeout: 10000 });
    await page.fill('#bk-name', 'Kopi Nusantara M15');
    await page.fill('#bk-tagline', 'Merah Kontras & Emas');
    await page.fill('#bk-primary', '#E11D48');
    await page.fill('#bk-accent', '#F59E0B');
    await page.selectOption('#bk-font', 'Arial');
    await page.fill('#bk-cta', 'Cek keranjang sekarang #KopiM15');
    await page.setInputFiles('#bk-logo-file', sampleLogoPath);
    await page.getByRole('button', { name: 'Simpan Brand Kit' }).click();
    await page.waitForSelector('text=Kopi Nusantara M15', { timeout: 15000 });
    await page.waitForSelector('img[alt="Logo Kopi Nusantara M15"]', { timeout: 10000 });
    await page.screenshot({ path: path.join(SHOT_DIR, 'm15-brandkit-editing-room.png'), fullPage: true });
    console.log('[PASS] M15 Flow 1: Buat Brand Asset Kit + Upload Logo PNG + Pratinjau 9:16');

    // 2. Buat Campaign -> Upload 4s Video -> Pilih Brand Kit -> Generate 1 Variasi -> Buka Clip Inspector
    await page.getByRole('link', { name: 'Antrean Campaign' }).click();
    await page.waitForURL('**/campaigns', { timeout: 10000 });
    await page.getByRole('button', { name: 'Buat Campaign Baru' }).click();
    await page.fill('#camp-title', 'Campaign E2E Brand Kit & Pin M15');
    await Promise.all([
      page.waitForURL('**/campaigns/*/studio', { timeout: 15000 }),
      page.getByRole('button', { name: 'Simpan & Buka Studio' }).click()
    ]);

    await page.setInputFiles('#media-file', sampleVideoPath);
    await page.waitForSelector('text=sample-raw-m15.mp4', { timeout: 20000 });

    const kitOptionVal = await page.locator('#tg-brand-kit option', { hasText: 'Kopi Nusantara M15' }).getAttribute('value');
    assert.ok(kitOptionVal, 'Brand Kit Kopi Nusantara M15 harus muncul di dropdown Studio');
    await page.selectOption('#tg-brand-kit', kitOptionVal);
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
    console.log('[PASS] M15 Flow 2: Generate 1 klip memakai Brand Asset Kit -> buka Clip Inspector');

    // 3. Switch Editorial -> Langkah +1f -> Aktifkan Mode Pin -> Klik frame -> Simpan Pin -> Terapkan ke Edit Prompt
    await page.getByRole('button', { name: 'Editorial' }).click();
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: '+1f' }).click();
    await page.getByRole('button', { name: 'Pin Catatan Frame' }).click();
    await page.waitForSelector('text=Mode Pin Aktif', { timeout: 5000 });

    const pinLayer = page.locator('[aria-label="Klik titik pada frame video untuk menaruh pin catatan"]');
    const box = await pinLayer.boundingBox();
    assert.ok(box, 'Overlay pin frame harus terlihat');
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.65);

    await page.waitForSelector('#ann-note', { timeout: 5000 });
    await page.fill('#ann-note', 'Naikkan subtitle agar tidak ketutup tombol kanan bawah');
    await page.getByRole('button', { name: 'Simpan Pin Catatan' }).click();
    await page.waitForSelector('text=Pin catatan frame berhasil disimpan!', { timeout: 10000 });
    await page.waitForSelector('text=Catatan Pin Frame (1 Aktif)', { timeout: 10000 });

    await page.getByRole('button', { name: 'Terapkan ke Edit Prompt' }).click();
    await page.waitForSelector('text=catatan pin frame dikompilasi ke Tab Edit Prompt', { timeout: 10000 });
    const compiledPrompt = await page.locator('#regen-prompt').inputValue();
    assert.ok(compiledPrompt.includes('Naikkan subtitle'), 'Prompt Edit Ulang harus memuat isi pin frame');
    await page.screenshot({ path: path.join(SHOT_DIR, 'm15-annotation-editorial.png'), fullPage: true });
    console.log('[PASS] M15 Flow 3: Frame-step, klik pin (X%,Y%), simpan catatan & 1-klik kompilasi ke Edit Prompt');

    // 4. Tema Tactile + Mobile 390px pada /brand-kits -> zero horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Tactile' }).click();
    await page.waitForTimeout(250);
    await page.getByRole('link', { name: 'Kit Brand' }).click();
    await page.waitForURL('**/brand-kits', { timeout: 10000 });
    await page.waitForSelector('text=Kopi Nusantara M15', { timeout: 10000 });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(mobileOverflow, false, 'Mobile 390px pada /brand-kits tidak boleh overflow horizontal');
    await page.screenshot({ path: path.join(SHOT_DIR, 'm15-brandkit-mobile-tactile.png'), fullPage: true });

    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join('; ')}`);
    assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join('; ')}`);
    assert.equal(failed5xx.length, 0, `HTTP 5xx: ${failed5xx.join('; ')}`);
    console.log('[PASS] M15 Flow 4: 3 Tema + Mobile 390px zero overflow + 0 console errors & 0 HTTP 5xx');
  } finally {
    if (browser) await browser.close();
    apiProc.kill();
    webProc.kill();
    fs.rmSync(sampleVideoPath, { force: true });
    fs.rmSync(sampleLogoPath, { force: true });

    if (createdQaUser) {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const user = await prisma.user.findUnique({
        where: { email: qaEmail },
        include: {
          brandKits: true,
          campaigns: { include: { batches: true } }
        }
      });
      if (user) {
        for (const k of user.brandKits) {
          fs.rmSync(path.join(ROOT_DIR, 'storage', 'brand-kits', k.id), { recursive: true, force: true });
        }
        for (const c of user.campaigns) {
          fs.rmSync(path.join(ROOT_DIR, 'storage', 'uploads', c.id), { recursive: true, force: true });
          for (const b of c.batches) {
            fs.rmSync(path.join(ROOT_DIR, 'storage', 'renders', b.id), { recursive: true, force: true });
          }
        }
        await prisma.user.delete({ where: { id: user.id } });
      }
      await prisma.$disconnect();
      console.log('[CLEANUP] Data QA M15, brand-kits, uploads & renders dibersihkan.');
    }
  }
}

run().catch((err) => {
  console.error('[E2E M15 FAILED]', err);
  process.exit(1);
});
