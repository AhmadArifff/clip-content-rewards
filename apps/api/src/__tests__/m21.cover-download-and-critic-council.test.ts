import { spawn } from 'node:child_process';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { EdlSchema, TargetConfigSchema } from '@clip/shared';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import { createApp } from '../app.js';
import { probeMediaAsset } from '../services/media/media-probe.service.js';
import { verifyAndDiffEdlPatch } from '../services/ai/edl-patcher.service.js';

const app = createApp();
const agent = request.agent(app);

const uniqueEmail = `qa-m21-${Date.now()}@clipstudio.local`;
let campaignId = '';
let clipId = '';
let activeVersionId = '';
const createdTempFiles: string[] = [];

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg gagal (${code})`))));
  });
}

async function generateSyntheticMp4(filename: string, color: string, durationSec: number): Promise<string> {
  ensureStorageDirectories();
  const absPath = resolveSafeStoragePath(`temp/${filename}`);
  await runFfmpeg([
    '-y',
    '-f', 'lavfi', '-i', `color=c=${color}:s=720x1280:d=${durationSec}:r=30`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-shortest',
    absPath
  ]);
  createdTempFiles.push(absPath);
  return absPath;
}

async function uploadRawVideo(absPath: string, originalFilename: string): Promise<string> {
  const buf = fs.readFileSync(absPath);
  const uploadId = `up_m21_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cRes = await agent
    .post(`/api/campaigns/${campaignId}/media/chunk`)
    .field('uploadId', uploadId)
    .field('chunkIndex', '0')
    .attach('chunk', buf, originalFilename);
  expect(cRes.status).toBe(200);

  const compRes = await agent.post(`/api/campaigns/${campaignId}/media/complete`).send({
    uploadId,
    originalFilename,
    mimeType: 'video/mp4',
    totalChunks: 1,
    assetType: 'raw_video'
  });
  expect(compRes.status).toBe(201);
  return compRes.body.data.id as string;
}

describe('M21 HD & YT 16:9 Cover Download, Multi-Persona Critic Council & Anti-Hallucination Re-Editor', () => {
  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('Password123!', 10);
    await prisma.user.create({
      data: { name: 'QA M21 Critic Tester', email: uniqueEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await agent.post('/api/auth/login').send({
      email: uniqueEmail,
      password: 'Password123!'
    });
    expect(loginRes.status).toBe(200);

    const campRes = await agent.post('/api/campaigns').send({
      title: 'US M21 Cover & Critic Council QA',
      brandOwner: 'Kitsch Labs',
      platformTargets: ['tiktok', 'youtube_shorts'],
      rewardNotes: 'Verify cover HD/YT16x9 download and anti-hallucination critic prompt re-editor'
    });
    expect(campRes.status).toBe(201);
    campaignId = campRes.body.data.id;

    const f1 = await generateSyntheticMp4(`m21-src1-${Date.now()}.mp4`, '0x1d4ed8', 6.0);
    const f2 = await generateSyntheticMp4(`m21-src2-${Date.now()}.mp4`, '0x047857', 5.0);
    await uploadRawVideo(f1, 'main-story.mp4');
    await uploadRawVideo(f2, 'broll-action.mp4');

    const startRes = await agent.post(`/api/campaigns/${campaignId}/batches`).send({
      targetConfig: {
        platform: 'tiktok',
        countryCode: 'US',
        languageStyle: 'English (US Casual & Punchy)',
        ageGroup: '18-24',
        genderFocus: 'all',
        personaNiche: 'Holiday Creators',
        controversyLevel: 'hot_take',
        hookType: 'curiosity_gap',
        emotionalTrigger: 'Curiosity',
        primaryKpi: 'watch_time',
        editingStyle: 'fast_cut_retention',
        framingMode: 'fit_blur_bg',
        captionStyle: 'hormozi_bold',
        captionOverlapMode: 'auto_skip_embedded',
        initialAudioMode: 'original_normalized',
        batchDiversityMode: 'distinct_moments',
        clipEndingMode: 'complete_story',
        editAssemblyMode: 'cinema_remix',
        colorGrade: 'natural',
        enableCinemaTransitions: true,
        batchCount: 1
      }
    });
    expect(startRes.status).toBe(201);
    const batchId = startRes.body.data.id as string;

    for (let i = 0; i < 60; i += 1) {
      const poll = await agent.get(`/api/batches/${batchId}`);
      expect(poll.status).toBe(200);
      if (poll.body.data.status === 'completed') {
        clipId = poll.body.data.clips[0].id;
        activeVersionId = poll.body.data.clips[0].activeVersion.id;
        break;
      }
      if (poll.body.data.status === 'failed') {
        throw new Error('Batch setup M21 gagal dirender');
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(clipId).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    for (const f of createdTempFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    if (campaignId) {
      await agent.delete(`/api/campaigns/${campaignId}`).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: uniqueEmail } });
  });

  it('memindai 6 kandidat cover lalu mengunduh kandidat dalam format HD asli (1080x1920) dan Thumbnail YouTube 16:9 (1280x720)', async () => {
    const scanRes = await agent.get(`/api/clips/${clipId}/cover-candidates?versionId=${activeVersionId}`);
    expect(scanRes.status).toBe(200);
    expect(scanRes.body.data.candidates.length).toBe(6);
    const cand = scanRes.body.data.candidates[2];
    expect(cand.downloadHdUrl).toContain('download=1&format=hd');
    expect(cand.downloadYtUrl).toContain('download=1&format=yt16x9');

    // 1. Unduh kandidat Full HD (1080x1920)
    const hdRes = await agent.get(cand.downloadHdUrl).buffer(true);
    expect(hdRes.status).toBe(200);
    expect(hdRes.headers['content-type']).toBe('image/jpeg');
    expect(hdRes.headers['content-disposition']).toContain('attachment;');
    expect(hdRes.headers['content-disposition']).toContain('-hd.jpg');
    expect(hdRes.body.length).toBeGreaterThan(2000);

    const hdTmpRel = `temp/m21-verify-hd-${Date.now()}.jpg`;
    const hdTmpAbs = resolveSafeStoragePath(hdTmpRel);
    fs.writeFileSync(hdTmpAbs, hdRes.body);
    createdTempFiles.push(hdTmpAbs);
    const hdProbe = await probeMediaAsset(hdTmpRel, 'watermark');
    expect(hdProbe.width).toBe(1080);
    expect(hdProbe.height).toBe(1920);

    // 2. Unduh kandidat Thumbnail YouTube 16:9 (1280x720)
    const ytRes = await agent.get(cand.downloadYtUrl).buffer(true);
    expect(ytRes.status).toBe(200);
    expect(ytRes.headers['content-type']).toBe('image/jpeg');
    expect(ytRes.headers['content-disposition']).toContain('attachment;');
    expect(ytRes.headers['content-disposition']).toContain('1280x720.jpg');
    expect(ytRes.body.length).toBeGreaterThan(2000);

    const ytTmpRel = `temp/m21-verify-yt-${Date.now()}.jpg`;
    const ytTmpAbs = resolveSafeStoragePath(ytTmpRel);
    fs.writeFileSync(ytTmpAbs, ytRes.body);
    createdTempFiles.push(ytTmpAbs);
    const ytProbe = await probeMediaAsset(ytTmpRel, 'watermark');
    expect(ytProbe.width).toBe(1280);
    expect(ytProbe.height).toBe(720);
  }, 60_000);

  it('menjalankan bedah Dewan Kritikus AI multi-role (Matriks Target + Roger Ebert + Pauline Kael) bebas em-dash dengan solusi eksekusi nyata', async () => {
    const revRes = await agent.post(`/api/clips/${clipId}/critic-review`).send({
      versionId: activeVersionId,
      roleIds: ['target_matrix', 'roger_ebert', 'pauline_kael'],
      focusNote: 'Cek apakah 3 detik awal kurang tajam dan warnanya terlalu datar'
    });
    expect(revRes.status).toBe(200);
    const data = revRes.body.data;
    expect(data.rolesUsed).toEqual(['target_matrix', 'roger_ebert', 'pauline_kael']);
    expect(data.perspectives.length).toBe(3);
    expect(data.combinedSynthesis.length).toBeGreaterThan(20);
    expect(data.suggestedPrompt.length).toBeGreaterThan(15);
    expect(JSON.stringify(data)).not.toContain('\u2014');

    // Validasi menolak > 3 role sekaligus agar tetap fokus & hemat token
    const tooMany = await agent.post(`/api/clips/${clipId}/critic-review`).send({
      roleIds: ['general_audience', 'target_matrix', 'roger_ebert', 'pauline_kael']
    });
    expect(tooMany.status).toBe(422);
  });

  it('memverifikasi penjaga anti-halusinasi EDL Patch (tolak ID palsu, tolak no-op, & terapkan colorGrade + speed + mute nyata ke v2)', async () => {
    const targetConfig = TargetConfigSchema.parse({
      platform: 'tiktok',
      countryCode: 'US',
      languageStyle: 'English (US Casual & Punchy)',
      ageGroup: '18-24',
      genderFocus: 'all',
      personaNiche: 'Holiday Creators',
      controversyLevel: 'hot_take',
      hookType: 'curiosity_gap',
      emotionalTrigger: 'Curiosity',
      primaryKpi: 'watch_time',
      editingStyle: 'fast_cut_retention',
      framingMode: 'fit_blur_bg',
      captionStyle: 'hormozi_bold',
      initialAudioMode: 'original_normalized',
      batchCount: 1
    });

    const baseEdl = EdlSchema.parse({
      schemaVersion: '1.1',
      aspectRatio: '9:16',
      framingMode: 'fit_blur_bg',
      resolution: { width: 1080, height: 1920, fps: 30 },
      segments: [{ mediaAssetId: 'real-vid-1', startSec: 0, endSec: 5, zoom: 1, cropX: 'center' }],
      audio: { originalVolume: 1, muteOriginal: false, normalizeLufs: -14, intendedPlatformSound: 'none' },
      hookBanner: { enabled: true, text: 'Watch this', startSec: 0, endSec: 2, position: 'top_safe_zone' },
      captions: { enabled: true, style: 'hormozi_bold', fontFamily: 'Segoe UI', safeZonePreset: 'tiktok_9_16', verticalOffsetPct: 66, overrides: [] },
      colorGrade: 'natural'
    });

    // Uji unit verifier: memulihkan mediaAssetId halusinasi & mendeteksi clamp durasi
    const hallucinatedEdl = EdlSchema.parse({
      ...baseEdl,
      colorGrade: 'moody_cinema',
      segments: [{ mediaAssetId: 'FAKE_HALLUCINATED_ID', startSec: 0, endSec: 99, zoom: 1.15, cropX: 'center', speed: 1.15 }]
    });
    const verified = verifyAndDiffEdlPatch({
      beforeEdl: baseEdl,
      afterEdl: hallucinatedEdl,
      availableSources: [{ id: 'real-vid-1', originalFilename: 'main-story.mp4', durationSec: 6.0 }],
      targetConfig
    });
    expect(verified.sanitizedEdl.segments[0].mediaAssetId).toBe('real-vid-1');
    expect(verified.sanitizedEdl.segments[0].endSec).toBeLessThanOrEqual(6.0);
    expect(verified.hallucinationWarnings.length).toBeGreaterThanOrEqual(2);
    expect(verified.hasEffectiveChange).toBe(true);
    expect(verified.appliedChanges.some((c) => c.field === 'colorGrade' && c.after === 'moody_cinema')).toBe(true);

    // Uji API Zero Silent No-Op Guard: prompt tidak jelas yang tidak mengubah EDL harus ditolak 422 (bukan render kloningan!)
    const noopRes = await agent.post(`/api/clips/${clipId}/regenerate`).send({
      userPrompt: 'tolong buat video ini terasa lebih magis dan menakjubkan secara filosofis saja',
      presetCodes: []
    });
    expect(noopRes.status).toBe(422);
    expect(noopRes.body.error.code).toBe('PATCH_NO_EFFECTIVE_CHANGE');

    // Uji Dry-Run Preview Patch + Regenerate nyata ke v2 (colorGrade moody_cinema + speed 1.15x + mute 0%)
    const concretePrompt = 'Ubah colorGrade ke moody_cinema, percepat 1.15x dengan push_in, dan mute suara asli ke 0%.';
    const prevRes = await agent.post(`/api/clips/${clipId}/preview-patch`).send({
      userPrompt: concretePrompt,
      presetCodes: []
    });
    expect(prevRes.status).toBe(200);
    expect(prevRes.body.data.hasEffectiveChange).toBe(true);
    expect(prevRes.body.data.appliedChanges.some((c: { field: string }) => c.field === 'colorGrade')).toBe(true);
    expect(prevRes.body.data.appliedChanges.some((c: { field: string }) => c.field === 'audio')).toBe(true);

    const regenRes = await agent.post(`/api/clips/${clipId}/regenerate`).send({
      userPrompt: concretePrompt,
      presetCodes: []
    });
    expect(regenRes.status).toBe(201);
    expect(regenRes.body.data.newVersionNumber).toBe(2);
    expect(regenRes.body.data.appliedChanges.length).toBeGreaterThanOrEqual(3);
    expect(regenRes.body.data.clip.activeVersion.edl.colorGrade).toBe('moody_cinema');
    expect(regenRes.body.data.clip.activeVersion.edl.audio.muteOriginal).toBe(true);
  }, 120_000);
});
