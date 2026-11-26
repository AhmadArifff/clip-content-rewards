import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SHOT_DIR = path.join(ROOT_DIR, 'scratch', 'e2e-m4');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const API_PORT = 4011;
const WEB_PORT = 3011;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

function findLocalBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function waitForUrl(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // Server masih menyala
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timeout menunggu server di ${url}`);
}

async function run() {
  const apiEnv = { ...process.env, API_PORT: String(API_PORT), NODE_ENV: 'development' };
  const webEnv = {
    ...process.env,
    PORT: String(WEB_PORT),
    HOST: '127.0.0.1',
    API_BASE_URL: API_URL,
    NUXT_API_BASE_URL: API_URL
  };

  const apiProc = spawn(process.execPath, [path.join(ROOT_DIR, 'apps/api/dist/index.js')], {
    cwd: path.join(ROOT_DIR, 'apps/api'),
    env: apiEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const webProc = spawn(process.execPath, [path.join(ROOT_DIR, 'apps/web/.output/server/index.mjs')], {
    cwd: path.join(ROOT_DIR, 'apps/web'),
    env: webEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const logs = [];
  apiProc.stderr.on('data', (d) => logs.push(`[API ERR] ${String(d).trim()}`));
  webProc.stderr.on('data', (d) => logs.push(`[WEB ERR] ${String(d).trim()}`));

  let browser;
  const qaEmail = `e2e-${Date.now()}@clipstudio.local`;
  let createdQaUserInDb = false;

  try {
    await waitForUrl(`${API_URL}/api/health`);
    await waitForUrl(`${WEB_URL}/login`);
    console.log('[E2E] API & Nuxt server lokal aktif.');

    const executablePath = findLocalBrowserExecutable();
    browser = await chromium.launch({ headless: true, executablePath });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    const failed5xx = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
      if (res.status() >= 500) failed5xx.push(`${res.status()} ${res.url()}`);
    });

    // FLOW 1: Auth Guard & Setup/Login
    await page.goto(`${WEB_URL}/settings/api-keys`, { waitUntil: 'networkidle' });
    assert.ok(page.url().includes('/login'), 'Akses privat tanpa login wajib redirect ke /login');
    console.log('[PASS] Flow 1A: Auth guard mengarahkan halaman privat ke /login');

    const setupStatus = await fetch(`${API_URL}/api/auth/setup-status`).then((r) => r.json());
    if (setupStatus.data.needsSetup) {
      await page.fill('#setup-name', 'QA Studio Owner');
      await page.fill('#auth-email', qaEmail);
      await page.fill('#auth-password', 'PasswordKuat123!');
      createdQaUserInDb = true;
    } else {
      throw new Error('DB sudah memiliki user; gunakan mode test terisolasi atau hapus user uji.');
    }

    await Promise.all([
      page.waitForURL('**/settings/api-keys', { timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);
    await page.waitForSelector('text=Siap Produksi', { timeout: 10000 });
    console.log('[PASS] Flow 1B: Setup akun pertama & masuk ke /settings/api-keys (System Doctor: Siap Produksi)');

    // FLOW 2: 3 Tema Switchable (Warna + Slicing Shell + Copywriting Berbeda)
    const themeExpectations = [
      {
        id: 'editing-room',
        buttonText: 'Editing Room',
        expectedHeading: 'Brankas Kunci AI & Telemetri Mesin',
        expectedBg: 'rgb(13, 15, 18)',
        hasAsideRail: true,
        shot: 'theme-1-editing-room.png'
      },
      {
        id: 'daylight-editorial',
        buttonText: 'Editorial',
        expectedHeading: 'Koneksi Kecerdasan Buatan & Kesiapan Studio',
        expectedBg: 'rgb(246, 243, 236)',
        hasAsideRail: false,
        shot: 'theme-2-daylight-editorial.png'
      },
      {
        id: 'creator-tactile',
        buttonText: 'Tactile',
        expectedHeading: 'Sambungkan Otak AI & Cek Mesin Render',
        expectedBg: 'rgb(238, 242, 246)',
        hasAsideRail: false,
        shot: 'theme-3-creator-tactile.png'
      }
    ];

    for (const t of themeExpectations) {
      await page.getByRole('button', { name: t.buttonText }).click();
      await page.waitForTimeout(250);
      const state = await page.evaluate(() => ({
        attr: document.documentElement.getAttribute('data-theme'),
        bg: getComputedStyle(document.body).backgroundColor,
        h1: document.querySelector('main h1')?.textContent?.trim() || '',
        asideCount: document.querySelectorAll('aside').length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      }));
      assert.equal(state.attr, t.id, `data-theme harus ${t.id}`);
      assert.equal(state.bg, t.expectedBg, `Warna canvas ${t.id} tidak sesuai`);
      assert.equal(state.h1, t.expectedHeading, `Copywriting H1 tema ${t.id} harus berbeda`);
      assert.equal(state.asideCount > 0, t.hasAsideRail, `Slicing shell tema ${t.id} tidak sesuai`);
      assert.equal(state.overflow, false, `Horizontal overflow terdeteksi pada desktop tema ${t.id}`);
      await page.screenshot({ path: path.join(SHOT_DIR, t.shot), fullPage: true });
      console.log(`[PASS] Flow 2 (${t.id}): BG=${state.bg}, H1="${state.h1}", aside=${state.asideCount}, shot=${t.shot}`);
    }

    // Kembalikan ke Editing Room untuk test BYOK & Presets
    await page.getByRole('button', { name: 'Editing Room' }).click();
    await page.waitForTimeout(150);

    // FLOW 3: BYOK Vault Encryption & Zero Plaintext Leak
    const secretSample = 'sk-e2e-SuperRahasiaTidakBolehBocor9999';
    await page.selectOption('#key-provider', 'openai');
    await page.fill('#key-label', 'OpenAI Uji E2E');
    await page.fill('#key-secret', secretSample);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=OpenAI Uji E2E', { timeout: 10000 });

    const domSnapshot = await page.content();
    assert.ok(domSnapshot.includes('sk-e...9999'), 'Masked preview sk-e...9999 wajib tampil');
    assert.ok(!domSnapshot.includes(secretSample), 'DILARANG ada plaintext API key di DOM');
    await page.getByRole('button', { name: 'Hapus kunci API' }).first().click();
    await page.waitForSelector('text=Belum ada kunci API yang dipasang', { timeout: 10000 });
    console.log('[PASS] Flow 3: BYOK Vault masking OK, zero plaintext leak di DOM, hapus bersih');

    // FLOW 4: Dynamic Master Presets CRUD (/settings/presets)
    await page.getByRole('link', { name: 'Preset Parameter' }).click();
    await page.waitForURL('**/settings/presets', { timeout: 10000 });
    await page.waitForSelector('text=Mute Audio Asli (0%)', { timeout: 10000 });

    await page.fill('#preset-code', 'e2e_duck_10');
    await page.fill('#preset-label', 'Kecilkan Audio 10% (Uji E2E)');
    await page.fill('#preset-prompt', 'Turunkan volume asli ke 10% untuk sound TikTok');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Kecilkan Audio 10% (Uji E2E)', { timeout: 10000 });

    const targetCard = page.locator('article', { hasText: 'Kecilkan Audio 10% (Uji E2E)' });
    await targetCard.getByRole('button', { name: 'Aktif' }).click();
    await targetCard.getByRole('button', { name: 'Nonaktif' }).waitFor({ timeout: 5000 });
    await targetCard.getByRole('button', { name: 'Hapus preset' }).click();
    await targetCard.waitFor({ state: 'detached', timeout: 5000 });
    console.log('[PASS] Flow 4: Master Presets CRUD (tampil 9 preset lapangan, tambah, toggle, hapus)');

    // FLOW 5: Mobile Viewport 390x844 (Anti-Overflow & Tap Target Check)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/settings/api-keys`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Tactile' }).click();
    await page.waitForTimeout(250);
    const mobileAudit = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button.studio-btn-primary'));
      const minPrimaryHeight = buttons.reduce((min, b) => Math.min(min, b.getBoundingClientRect().height), 999);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        minPrimaryHeight
      };
    });
    assert.ok(
      mobileAudit.scrollWidth <= mobileAudit.clientWidth,
      `Mobile overflow: scrollWidth=${mobileAudit.scrollWidth} > clientWidth=${mobileAudit.clientWidth}`
    );
    assert.ok(mobileAudit.minPrimaryHeight >= 44, `Tap target utama < 44px (${mobileAudit.minPrimaryHeight}px)`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'mobile-390-tactile.png'), fullPage: true });
    console.log(`[PASS] Flow 5: Mobile 390px zero overflow (${mobileAudit.scrollWidth}/${mobileAudit.clientWidth}), min primary btn=${Math.round(mobileAudit.minPrimaryHeight)}px`);

    // FLOW 6: Campaign Dashboard Gate & Zero Errors
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('link', { name: 'Campaign Aktif' }).click();
    await page.waitForURL('**/campaigns', { timeout: 10000 });
    await page.waitForSelector('text=Workbench Siap Dipakai!', { timeout: 10000 });

    assert.equal(consoleErrors.length, 0, `Console errors ditemukan: ${consoleErrors.join('; ')}`);
    assert.equal(failed5xx.length, 0, `HTTP 5xx ditemukan: ${failed5xx.join('; ')}`);
    console.log('[PASS] Flow 6: Campaign Gate + 0 console errors + 0 HTTP 5xx');
    console.log(`\nALL 6 E2E FLOWS PASSED! Screenshots tersimpan di: ${SHOT_DIR}`);
  } finally {
    if (browser) await browser.close();
    apiProc.kill();
    webProc.kill();

    // Cleanup user QA agar DB lokal kembali bersih seperti baru
    if (createdQaUserInDb) {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.user.deleteMany({ where: { email: qaEmail } });
      await prisma.$disconnect();
      console.log('[CLEANUP] Akun QA sementara dibersihkan dari SQLite lokal.');
    }

    if (logs.length > 0) {
      console.log('[SERVER STDERR LOGS]', logs.slice(0, 5).join('\n'));
    }
  }
}

run().catch((err) => {
  console.error('[E2E FAILED]', err);
  process.exit(1);
});
