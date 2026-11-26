import crypto from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BriefRulebookSchema,
  EdlPatchSchema,
  EdlSchema,
  TargetConfigSchema,
  UploadPlaybookSchema,
  ViralScoreCritiqueSchema
} from '@clip/shared';
import { createApp } from '../app.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import { decryptSecret, encryptSecret, maskApiKey, sanitizeSecretFromText } from '../utils/crypto.js';

describe('M4 Security, Shared Contracts & Core API', () => {
  const app = createApp();
  let authCookie = '';
  const uniqueEmail = `qa-${Date.now()}@clipstudio.local`;
  const testSecretKey = 'sk-proj-superSecretLiveKey9988776655';

  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();
  });

  it('mengenkripsi dan mendekripsi AES-256-GCM serta menolak authTag yang diubah', () => {
    const hexKey = crypto.randomBytes(32).toString('hex');
    const encrypted = encryptSecret(testSecretKey, hexKey);
    expect(encrypted.encryptedKey).not.toContain(testSecretKey);
    expect(decryptSecret(encrypted, hexKey)).toBe(testSecretKey);

    const tampered = { ...encrypted, authTag: '0'.repeat(32) };
    expect(() => decryptSecret(tampered, hexKey)).toThrow();
  });

  it('mem-masking API key dan mensanitasi kebocoran secret pada pesan log', () => {
    expect(maskApiKey('AIzaSyD998877661234')).toBe('AIza...1234');
    const sanitized = sanitizeSecretFromText(
      `Request failed with Bearer ${testSecretKey} and ?key=${testSecretKey}`,
      [testSecretKey]
    );
    expect(sanitized).not.toContain(testSecretKey);
    expect(sanitized).toContain('[REDACTED]');
  });

  it('memblokir path traversal di luar direktori storage/', () => {
    expect(() => resolveSafeStoragePath('../../etc/passwd')).toThrow('PATH_TRAVERSAL_BLOCKED');
    expect(() => resolveSafeStoragePath('uploads/../../../.env')).toThrow('PATH_TRAVERSAL_BLOCKED');
    expect(resolveSafeStoragePath('uploads/sample.mp4')).toContain('storage');
  });

  it('memvalidasi 6 kontrak Zod bersama (@clip/shared)', () => {
    expect(BriefRulebookSchema.parse({
      campaignGoal: 'Promo produk',
      targetPlatforms: ['tiktok'],
      durationRules: { minSec: 20, maxSec: 45 },
      mandatoryDos: ['Tambahkan CTA'],
      strictDonts: ['Klaim medis'],
      requiredHashtags: ['#BrandX'],
      requiredMentions: ['@brandx'],
      brandTone: 'Enerjik'
    }).campaignGoal).toBe('Promo produk');

    expect(TargetConfigSchema.parse({
      platform: 'tiktok',
      countryCode: 'ID',
      languageStyle: 'Santai',
      ageGroup: '18-24',
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
      batchCount: 5
    }).framingMode).toBe('fit_blur_bg');

    const edl = EdlSchema.parse({
      aspectRatio: '9:16',
      framingMode: 'fit_blur_bg',
      resolution: { width: 1080, height: 1920, fps: 30 },
      segments: [{ mediaAssetId: 'm1', startSec: 2, endSec: 25 }],
      audio: { originalVolume: 0.15, muteOriginal: false, normalizeLufs: -14, intendedPlatformSound: 'tiktok_trending_overlay' },
      hookBanner: { enabled: true, text: 'Hook kuat', startSec: 0, endSec: 3 },
      captions: { enabled: true, style: 'hormozi_bold', safeZonePreset: 'tiktok_9_16' }
    });
    expect(edl.schemaVersion).toBe('1.1');

    expect(EdlPatchSchema.parse({
      humanSummary: 'Mute audio asli untuk sound TikTok',
      audioPatch: { muteOriginal: true, originalVolume: 0 }
    }).audioPatch?.muteOriginal).toBe(true);

    expect(ViralScoreCritiqueSchema.parse({
      totalScore: 88,
      briefComplianceStatus: 'pass',
      dimensions: {
        hookStrength: { score: 90, note: 'Hook langsung tajam' },
        retentionPacing: { score: 86, note: 'Cut rapat' },
        briefCompliance: { score: 100, note: 'Semua syarat terpenuhi' },
        audienceFit: { score: 85, note: 'Cocok Gen-Z ID' },
        engagementTrigger: { score: 82, note: 'Memicu komentar' },
        audioSafeZone: { score: 90, note: 'Safe-zone aman' }
      },
      briefChecklist: [{ rule: 'Durasi 20-45s', status: 'pass', evidence: 'Durasi 23 detik' }],
      projectedImpact: {
        firstThreeSeconds: 'Retensi awal tinggi',
        midRetention: 'Stabil',
        commentSharePotential: 'Tinggi',
        audienceReactionSummary: 'Audiens ID 18-24 tertarik berdiskusi'
      },
      critiques: [{ id: 'c1', timestampSec: 1.5, severity: 'medium', issue: 'Volume asli masih keras', suggestedRegeneratePrompt: 'Kecilkan audio asli ke 15%' }]
    }).totalScore).toBe(88);

    expect(UploadPlaybookSchema.parse({
      audioMusicGuide: {
        renderedAudioState: 'Original 15%',
        recommendedMusicVibe: 'Phonk / Upbeat Lo-Fi',
        bpmRange: '118-126 BPM',
        platformMixingInstruction: 'Atur Added Sound TikTok 85%'
      },
      titleOptions: ['Judul 1', 'Judul 2', 'Judul 3'],
      captionDescription: 'Caption siap pakai #BrandX',
      hashtags: { mandatory: ['#BrandX'], niche: ['#clipper'], broad: ['#fyp'] },
      optimalSchedule: { timezone: 'Asia/Jakarta', bestDays: ['Selasa', 'Kamis'], bestTimeSlots: ['19:00-21:00 WIB'], rationale: 'Jam pulang kerja/kuliah' },
      engagementToolkit: { pinnedComments: ['Setuju atau tidak?'], first15MinChecklist: ['Balas 5 komentar pertama'], coverFrameSec: 2.0 }
    }).titleOptions.length).toBe(3);
  });

  it('melindungi endpoint privat dari akses tanpa sesi dan mengelola Auth + BYOK tanpa kebocoran plaintext', async () => {
    const unauthRes = await request(app).get('/api/api-keys');
    expect(unauthRes.status).toBe(401);

    const statusRes = await request(app).get('/api/auth/setup-status');
    expect(statusRes.status).toBe(200);

    // Pastikan user uji siap login (via setup jika kosong, atau buat langsung di DB bila sudah ada user)
    if (statusRes.body.data.needsSetup) {
      const setupRes = await request(app).post('/api/auth/setup').send({
        name: 'QA Owner',
        email: uniqueEmail,
        password: 'PasswordKuat123!'
      });
      expect(setupRes.status).toBe(201);
      authCookie = setupRes.headers['set-cookie'][0];
    } else {
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.default.hash('PasswordKuat123!', 10);
      await prisma.user.create({
        data: { name: 'QA Runner', email: uniqueEmail, passwordHash, role: 'admin' }
      });
      const loginRes = await request(app).post('/api/auth/login').send({
        email: uniqueEmail,
        password: 'PasswordKuat123!'
      });
      expect(loginRes.status).toBe(200);
      authCookie = loginRes.headers['set-cookie'][0];
    }

    const createKeyRes = await request(app)
      .post('/api/api-keys')
      .set('Cookie', authCookie)
      .send({
        provider: 'openai',
        role: 'brain',
        label: 'QA Key Uji',
        apiKey: testSecretKey,
        defaultModel: 'gpt-4o-mini'
      });

    expect(createKeyRes.status).toBe(201);
    expect(JSON.stringify(createKeyRes.body)).not.toContain(testSecretKey);
    expect(createKeyRes.body.data.maskedPreview).toBe('sk-p...6655');

    const createdId = createKeyRes.body.data.id as string;
    const listRes = await request(app).get('/api/api-keys').set('Cookie', authCookie);
    expect(listRes.status).toBe(200);
    expect(JSON.stringify(listRes.body)).not.toContain(testSecretKey);

    const doctorRes = await request(app).get('/api/system/doctor').set('Cookie', authCookie);
    expect(doctorRes.status).toBe(200);
    expect(doctorRes.body.data.ffmpeg.available).toBe(true);
    expect(doctorRes.body.data.ffprobe.available).toBe(true);
    expect(doctorRes.body.data.database.walMode.toLowerCase()).toBe('wal');

    const presetsRes = await request(app).get('/api/presets').set('Cookie', authCookie);
    expect(presetsRes.status).toBe(200);
    expect(presetsRes.body.data.length).toBeGreaterThanOrEqual(20);

    // Cleanup data uji agar DB lokal tetap bersih
    await request(app).delete(`/api/api-keys/${createdId}`).set('Cookie', authCookie);
    await prisma.user.delete({ where: { email: uniqueEmail } });
  });
});
