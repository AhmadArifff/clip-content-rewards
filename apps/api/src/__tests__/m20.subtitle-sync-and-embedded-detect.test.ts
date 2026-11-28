import { spawn } from 'node:child_process';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { EdlSchema, TargetConfigSchema, type EdlDocument } from '@clip/shared';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import { createApp } from '../app.js';
import {
  buildTimedCuesFromEdl,
  isSpokenWordToken
} from '../services/media/ass-subtitle.builder.js';
import { buildHeuristicMultiVariantEdls } from '../services/ai/edl-director.service.js';

const app = createApp();
const agent = request.agent(app);

const uniqueEmail = `qa-m20-${Date.now()}@clipstudio.local`;
let campaignId = '';
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
  const uploadId = `up_m20_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
    durationSec: dbAsset?.durationSec ?? 5
  };
}

describe('M20 Precision Subtitle Sync Engine & Smart Anti-Double-Caption Detector', () => {
  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();

    const hash = await bcrypt.hash('Password123!', 10);
    await prisma.user.create({
      data: { name: 'QA M20 Subtitle Tester', email: uniqueEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await agent.post('/api/auth/login').send({
      email: uniqueEmail,
      password: 'Password123!'
    });
    expect(loginRes.status).toBe(200);

    const campRes = await agent.post('/api/campaigns').send({
      title: 'US M20 Subtitle Precision & Anti-Double Test',
      brandOwner: 'Kitsch Holiday Labs',
      platformTargets: ['tiktok', 'youtube_shorts'],
      rewardNotes: 'Zero early subtitle drift and zero double subtitles'
    });
    expect(campRes.status).toBe(201);
    campaignId = campRes.body.data.id;
  });

  afterAll(async () => {
    for (const f of createdTempFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    if (campaignId) {
      await agent.delete(`/api/campaigns/${campaignId}`).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: uniqueEmail } });
  });

  it('menyaring token halusinasi Whisper, mengisolasi batas segmen/jeda hening, dan menyinkronkan speed + xfade tanpa subtitle muncul lebih awal', () => {
    expect(isSpokenWordToken('.')).toBe(false);
    expect(isSpokenWordToken('...')).toBe(false);
    expect(isSpokenWordToken('[Music]')).toBe(false);
    expect(isSpokenWordToken("I'm")).toBe(true);
    expect(isSpokenWordToken('70%')).toBe(true);

    // Reproduksi eksak bug produksi: Segmen 1 (Video 2 musik + halusinasi ".") diikuti Segmen 2 (Video 1 ucapan di detik 3.4s)
    const edl: EdlDocument = EdlSchema.parse({
      schemaVersion: '1.1',
      aspectRatio: '9:16',
      framingMode: 'fit_blur_bg',
      resolution: { width: 1080, height: 1920, fps: 30 },
      segments: [
        {
          mediaAssetId: 'vid-music-2',
          startSec: 1.0,
          endSec: 3.6,
          zoom: 1.05,
          cropX: 'center',
          transition: 'cut',
          transitionDurationSec: 0.3,
          speed: 1.05,
          motion: 'push_in'
        },
        {
          mediaAssetId: 'vid-talk-1',
          startSec: 0.0,
          endSec: 8.5,
          zoom: 1.0,
          cropX: 'center',
          transition: 'smoothleft',
          transitionDurationSec: 0.3,
          speed: 1.0,
          motion: 'none'
        },
        {
          mediaAssetId: 'vid-talk-1',
          startSec: 20.0,
          endSec: 26.0,
          zoom: 1.0,
          cropX: 'center',
          transition: 'dissolve',
          transitionDurationSec: 0.3,
          speed: 1.1,
          motion: 'none'
        }
      ],
      audio: {
        originalVolume: 1,
        muteOriginal: false,
        normalizeLufs: -14,
        intendedPlatformSound: 'none'
      },
      hookBanner: {
        enabled: true,
        text: 'Wait until you see how this unfolds',
        startSec: 0,
        endSec: 2.5,
        position: 'top_safe_zone'
      },
      captions: {
        enabled: true,
        style: 'hormozi_bold',
        fontFamily: 'Segoe UI',
        safeZonePreset: 'tiktok_9_16',
        verticalOffsetPct: 66,
        overrides: []
      }
    });

    const wordsByMediaId = {
      'vid-music-2': [{ word: '.', startSec: 0, endSec: 1.04 }],
      'vid-talk-1': [
        { word: "I'm", startSec: 3.4, endSec: 3.55 },
        { word: 'not', startSec: 3.56, endSec: 3.74 },
        { word: 'going', startSec: 3.76, endSec: 3.98 },
        { word: 'to', startSec: 4.0, endSec: 4.12 },
        { word: 'name', startSec: 4.14, endSec: 4.4 },
        { word: 'names.', startSec: 4.42, endSec: 4.78 },
        { word: 'Holiday', startSec: 21.0, endSec: 21.45 },
        { word: 'drop', startSec: 21.48, endSec: 21.82 },
        { word: 'is', startSec: 21.85, endSec: 22.0 },
        { word: 'live!', startSec: 22.02, endSec: 22.45 }
      ]
    };

    const cues = buildTimedCuesFromEdl(edl, wordsByMediaId, 16.0);
    expect(cues.length).toBeGreaterThanOrEqual(3);

    // Cue pertama HARUS mulai pada ~5.58s ((2.6/1.05) - 0.3 + 3.4 = 5.576s), BUKAN 0.00s!
    expect(cues[0].text).not.toContain('.');
    expect(cues[0].text).toBe("I'm not going");
    expect(cues[0].startSec).toBeGreaterThanOrEqual(5.4);
    expect(cues[0].startSec).toBeLessThanOrEqual(5.8);

    // Seluruh cue wajib monoton, tidak pernah terbalik (endSec > startSec), dan tidak saling tumpang tindih
    for (let i = 0; i < cues.length; i += 1) {
      expect(cues[i].endSec).toBeGreaterThan(cues[i].startSec);
      if (i > 0) {
        expect(cues[i].startSec).toBeGreaterThanOrEqual(cues[i - 1].endSec);
      }
    }
  });

  it('tidak membocorkan label demografi "(Young Creators & Professionals)" atau "(US)" ke Hook Banner', () => {
    const targetConfig = TargetConfigSchema.parse({
      platform: 'tiktok',
      countryCode: 'US',
      languageStyle: 'English (US Casual & Punchy)',
      ageGroup: '18-24',
      genderFocus: 'all',
      personaNiche: 'Young Creators & Professionals',
      controversyLevel: 'hot_take',
      hookType: 'curiosity_gap',
      emotionalTrigger: 'FOMO',
      primaryKpi: 'watch_time',
      editingStyle: 'fast_cut_retention',
      framingMode: 'fit_blur_bg',
      captionStyle: 'hormozi_bold',
      initialAudioMode: 'ducking_20',
      batchDiversityMode: 'distinct_moments',
      clipEndingMode: 'complete_story',
      editAssemblyMode: 'cinema_remix',
      colorGrade: 'viral_high_contrast',
      enableCinemaTransitions: true,
      batchCount: 5
    });

    const drafts = buildHeuristicMultiVariantEdls({
      mediaAssetId: 'v1',
      mediaDurationSec: 30,
      rawVideos: [
        { id: 'v1', durationSec: 30, transcript: null, silences: [] },
        { id: 'v2', durationSec: 12, transcript: null, silences: [] }
      ],
      rulebook: null,
      targetConfig,
      transcript: null,
      silences: []
    });

    for (const d of drafts) {
      expect(d.edl.hookBanner.text).not.toContain('Young Creators');
      expect(d.edl.hookBanner.text).not.toContain('(US)');
      expect(d.edl.hookBanner.text).not.toMatch(/\([^)]+\)/);
    }
  });

  it('otomatis melewati burn-in subtitle pada video sumber bersubtitle bawaan (anti-double) namun tetap merender subtitle video bersih', async () => {
    const f1 = await generateSyntheticMp4(`m20-embedded-${Date.now()}.mp4`, '0x1e3a8a', 6.0);
    const f2 = await generateSyntheticMp4(`m20-clean-${Date.now()}.mp4`, '0x065f46', 5.0);

    const mEmbedded = await uploadRawVideo(f1, 'already-subtitled-source.mp4');
    const mClean = await uploadRawVideo(f2, 'clean-talking-source.mp4');

    // Suntikkan transkrip kata pada KEDUA video
    await prisma.mediaAsset.update({
      where: { id: mEmbedded.id },
      data: {
        transcriptJson: JSON.stringify({
          mode: 'stt_word_level',
          language: 'en',
          fullText: 'Baked caption line should never duplicate',
          chunksProcessed: 1,
          words: [
            { word: 'BAKED_DO_NOT_DUPLICATE', startSec: 0.5, endSec: 1.5 },
            { word: 'EMBEDDED_LINE', startSec: 1.6, endSec: 2.8 }
          ]
        })
      }
    });
    await prisma.mediaAsset.update({
      where: { id: mClean.id },
      data: {
        transcriptJson: JSON.stringify({
          mode: 'stt_word_level',
          language: 'en',
          fullText: 'Clean raw footage gets synced caption',
          chunksProcessed: 1,
          words: [
            { word: 'CLEAN_SYNCED_WORD', startSec: 0.8, endSec: 1.8 },
            { word: 'VERIFIED_OK', startSec: 1.9, endSec: 2.9 }
          ]
        })
      }
    });

    // Tandai mEmbedded memiliki subtitle bawaan via endpoint PATCH /api/media/:mediaId/embedded-subtitle
    const flagRes = await agent
      .patch(`/api/media/${mEmbedded.id}/embedded-subtitle`)
      .send({ hasEmbeddedSubtitles: true });
    expect(flagRes.status).toBe(200);
    expect(flagRes.body.data.audioDiagnostic.hasEmbeddedSubtitles).toBe(true);
    expect(flagRes.body.data.audioDiagnostic.embeddedSubtitleSource).toBe('manual_override');

    // Jalankan batch Cinema Remix (menggabungkan mEmbedded + mClean dalam 1 klip!)
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
        colorGrade: 'viral_high_contrast',
        enableCinemaTransitions: true,
        batchCount: 1
      }
    });
    expect(startRes.status).toBe(201);
    const batchId = startRes.body.data.id as string;

    let status = 'queued';
    let clips: Array<{ id: string; activeVersion: { id: string } }> = [];
    for (let i = 0; i < 60; i += 1) {
      const poll = await agent.get(`/api/batches/${batchId}`);
      expect(poll.status).toBe(200);
      status = poll.body.data.status;
      clips = poll.body.data.clips;
      if (status === 'completed' || status === 'failed' || status === 'partial_success') break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(status).toBe('completed');
    expect(clips.length).toBe(1);

    const dbVer = await prisma.clipVersion.findUnique({ where: { id: clips[0].activeVersion.id } });
    expect(dbVer?.outputAssPath).toBeTruthy();
    const assText = fs.readFileSync(resolveSafeStoragePath(dbVer!.outputAssPath!), 'utf8');

    // Video bersubtitle bawaan WAJIB dilewati (0 double subtitle), sedangkan video bersih tetap dirender!
    expect(assText).not.toContain('BAKED_DO_NOT_DUPLICATE');
    expect(assText).not.toContain('EMBEDDED_LINE');
    expect(assText).toContain('CLEAN_SYNCED_WORD');
    expect(assText).toContain('VERIFIED_OK');
  }, 120_000);
});
