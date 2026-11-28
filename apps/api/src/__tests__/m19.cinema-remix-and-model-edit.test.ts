import { spawn } from 'node:child_process';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import { createApp } from '../app.js';
import { probeMediaAsset } from '../services/media/media-probe.service.js';
import { extractVideoStoryboards } from '../services/media/vision-storyboard.service.js';

const app = createApp();
const agent = request.agent(app);

const uniqueEmail = `qa-m19-${Date.now()}@clipstudio.local`;
let campaignId = '';
let createdKeyId = '';
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

async function uploadRawVideo(absPath: string, originalFilename: string): Promise<{ id: string; filePath: string; durationSec: number }> {
  const buf = fs.readFileSync(absPath);
  const uploadId = `up_m19_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
  const assetId = compRes.body.data.id as string;
  const dbAsset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  return {
    id: assetId,
    filePath: dbAsset!.filePath,
    durationSec: dbAsset?.durationSec ?? 4
  };
}

describe('M19 AI Multimodal Cinema Remix Engine, FFmpeg Cinema VFX & Editable BYOK Model', () => {
  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('Password123!', 10);
    await prisma.user.create({
      data: { name: 'QA M19 Cinema Tester', email: uniqueEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await agent.post('/api/auth/login').send({
      email: uniqueEmail,
      password: 'Password123!'
    });
    expect(loginRes.status).toBe(200);

    const campRes = await agent.post('/api/campaigns').send({
      title: 'US Cinema Multi-Video Remix M19',
      brandOwner: 'Kitsch Holiday Labs',
      platformTargets: ['tiktok', 'youtube_shorts'],
      rewardNotes: 'Combine all 3 raw videos into cinematic movie edits'
    });
    expect(campRes.status).toBe(201);
    campaignId = campRes.body.data.id;
  });

  afterAll(async () => {
    for (const f of createdTempFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    if (createdKeyId) {
      await agent.delete(`/api/api-keys/${createdKeyId}`).catch(() => {});
    }
    if (campaignId) {
      await agent.delete(`/api/campaigns/${campaignId}`).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: uniqueEmail } });
  });

  it('memungkinkan edit nama model pada kunci API tersimpan (mis. gemini-3.5-flash) tanpa membocorkan secret', async () => {
    const createRes = await agent.post('/api/api-keys').send({
      provider: 'gemini',
      role: 'brain',
      label: 'Gemini Free Studio',
      apiKey: 'AIzaSyDummyTestSecretKeyForM19UnitTest123456',
      defaultModel: 'gemini-2.5-flash'
    });
    expect(createRes.status).toBe(201);
    createdKeyId = createRes.body.data.id;

    // Nonaktifkan kunci dummy agar tidak memicu jaringan nyata pada test batch lokal di bawah
    const patchRes = await agent.patch(`/api/api-keys/${createdKeyId}`).send({
      label: 'Gemini 3.5 Flash Experiment',
      defaultModel: 'gemini-3.5-flash',
      isActive: false
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.defaultModel).toBe('gemini-3.5-flash');
    expect(patchRes.body.data.label).toBe('Gemini 3.5 Flash Experiment');
    expect(patchRes.body.data.lastTestOk).toBeNull();
    expect(JSON.stringify(patchRes.body)).not.toContain('AIzaSyDummyTestSecretKeyForM19UnitTest123456');
  });

  it('mengekstrak storyboard contact-sheet lokal gratis & merender Cinema AI Remix menggabungkan 3 video dengan xfade, acrossfade, color grading & motion', async () => {
    const f1 = await generateSyntheticMp4(`m19-vid1-${Date.now()}.mp4`, '0x1d4ed8', 7.0);
    const f2 = await generateSyntheticMp4(`m19-vid2-${Date.now()}.mp4`, '0x047857', 4.5);
    const f3 = await generateSyntheticMp4(`m19-vid3-${Date.now()}.mp4`, '0xb45309', 4.5);

    const m1 = await uploadRawVideo(f1, 'holiday-main.mp4');
    const m2 = await uploadRawVideo(f2, 'holiday-bts-1.mp4');
    const m3 = await uploadRawVideo(f3, 'holiday-bts-2.mp4');

    // 1. Verifikasi Vision Storyboard Extractor 100% lokal gratis
    const storyboards = await extractVideoStoryboards([
      { id: m1.id, originalFilename: 'holiday-main.mp4', filePath: m1.filePath, durationSec: m1.durationSec },
      { id: m2.id, originalFilename: 'holiday-bts-1.mp4', filePath: m2.filePath, durationSec: m2.durationSec },
      { id: m3.id, originalFilename: 'holiday-bts-2.mp4', filePath: m3.filePath, durationSec: m3.durationSec }
    ]);
    expect(storyboards.length).toBe(3);
    for (const sb of storyboards) {
      expect(sb.mimeType).toBe('image/jpeg');
      expect(sb.frameTimestampsSec.length).toBe(6);
      expect(Buffer.from(sb.dataBase64, 'base64').length).toBeGreaterThan(1000);
    }

    // 2. Render batch Cinema AI Remix (2 variasi, masing-masing WAJIB menggabungkan multi-video dengan xfade + colorGrade + speed + motion!)
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
        initialAudioMode: 'ducking_20',
        batchDiversityMode: 'distinct_moments',
        clipEndingMode: 'complete_story',
        editAssemblyMode: 'cinema_remix',
        colorGrade: 'warm_holiday_film',
        enableCinemaTransitions: true,
        batchCount: 2
      }
    });
    expect(startRes.status).toBe(201);
    const batchId = startRes.body.data.id as string;

    let status = 'queued';
    let clips: Array<{
      id: string;
      angleTitle: string;
      status: string;
      activeVersion: {
        id: string;
        edl: {
          colorGrade?: string;
          directorMode?: string;
          directorNote?: string;
          segments: Array<{ mediaAssetId: string; transition?: string; motion?: string; speed?: number }>;
        };
      };
    }> = [];

    for (let i = 0; i < 90; i += 1) {
      const poll = await agent.get(`/api/batches/${batchId}`);
      expect(poll.status).toBe(200);
      status = poll.body.data.status;
      clips = poll.body.data.clips;
      if (status === 'completed' || status === 'failed' || status === 'partial_success') break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(status).toBe('completed');
    expect(clips.length).toBe(2);

    for (const clip of clips) {
      expect(clip.status).toBe('ready');
      const edl = clip.activeVersion.edl;
      expect(edl.colorGrade).toBe('warm_holiday_film');
      expect(edl.directorMode).toBeTruthy();
      expect(edl.directorNote).toBeTruthy();

      // Setiap klip Cinema Remix WAJIB menggabungkan >= 2 sumber video berbeda & memiliki transisi xfade!
      const uniqueSourcesInClip = new Set(edl.segments.map((s) => s.mediaAssetId));
      expect(uniqueSourcesInClip.size).toBeGreaterThanOrEqual(3);
      expect(edl.segments.length).toBeGreaterThanOrEqual(4);
      expect(edl.segments.some((s, idx) => idx > 0 && s.transition && s.transition !== 'cut')).toBe(true);

      // Verifikasi fisik MP4 hasil render FFmpeg 8.1.2 dengan xfade + acrossfade + warm_holiday_film + zoompan
      const dbVer = await prisma.clipVersion.findUnique({ where: { id: clip.activeVersion.id } });
      expect(dbVer?.outputVideoPath).toBeTruthy();
      const probed = await probeMediaAsset(dbVer!.outputVideoPath!, 'raw_video');
      expect(probed.width).toBe(1080);
      expect(probed.height).toBe(1920);
      expect(probed.hasAudio).toBe(true);
      expect(probed.durationSec ?? 0).toBeGreaterThan(5);
    }
  }, 150_000);
});
