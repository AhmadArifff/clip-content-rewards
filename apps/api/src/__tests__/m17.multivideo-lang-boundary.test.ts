import { spawn } from 'node:child_process';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { env } from '../config/env.js';
import { initDatabaseAndRecoverJobs, prisma } from '../config/prisma.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import { createApp } from '../app.js';
import {
  resolveContentLanguage,
  snapSegmentToSpeechBoundary
} from '../services/ai/content-language.helper.js';
import { buildHeuristicMultiVariantEdls } from '../services/ai/edl-director.service.js';
import { buildDeterministicEvaluation } from '../services/ai/viral-evaluator.service.js';

const app = createApp();
const agent = request.agent(app);

const uniqueEmail = `qa-m17-${Date.now()}@clipstudio.local`;
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
    '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:d=${durationSec}:r=24`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durationSec}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-shortest',
    absPath
  ]);
  createdTempFiles.push(absPath);
  return absPath;
}

async function uploadRawVideoToCampaign(absPath: string, originalFilename: string): Promise<string> {
  const buf = fs.readFileSync(absPath);
  const uploadId = `up_m17_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const chunkRes = await agent
    .post(`/api/campaigns/${campaignId}/media/chunk`)
    .field('uploadId', uploadId)
    .field('chunkIndex', '0')
    .attach('chunk', buf, originalFilename);
  expect(chunkRes.status).toBe(200);

  const completeRes = await agent
    .post(`/api/campaigns/${campaignId}/media/complete`)
    .send({
      uploadId,
      originalFilename,
      mimeType: 'video/mp4',
      totalChunks: 1,
      assetType: 'raw_video'
    });
  expect(completeRes.status).toBe(201);
  return completeRes.body.data.id as string;
}

describe('M17 Multi-Video Anti-Cut Director, Geo-Language Lock & Safe-Zone Verification', () => {
  beforeAll(async () => {
    ensureStorageDirectories();
    await initDatabaseAndRecoverJobs();
    const hash = await bcrypt.hash('Password123!', 10);
    await prisma.user.create({
      data: { name: 'QA M17 Tester', email: uniqueEmail, passwordHash: hash, role: 'admin' }
    });
    const loginRes = await agent.post('/api/auth/login').send({
      email: uniqueEmail,
      password: 'Password123!'
    });
    expect(loginRes.status).toBe(200);

    const campRes = await agent.post('/api/campaigns').send({
      title: 'US Holiday Multi-Video Campaign M17',
      brandOwner: 'NorthPole Labs',
      platformTargets: ['tiktok', 'youtube_shorts'],
      rewardNotes: 'English US audience only'
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

  it('snapSegmentToSpeechBoundary mencegah potongan di tengah kalimat dan mendukung mode full_source', () => {
    const words = [
      { word: 'Hey', startSec: 0.2, endSec: 0.5 },
      { word: 'everyone,', startSec: 0.5, endSec: 1.0 },
      { word: 'watch', startSec: 1.1, endSec: 1.4 },
      { word: 'this', startSec: 1.4, endSec: 1.7 },
      { word: 'tip.', startSec: 1.7, endSec: 2.2 },
      { word: 'Now', startSec: 36.8, endSec: 37.2 },
      { word: 'here', startSec: 37.2, endSec: 37.6 },
      { word: 'is', startSec: 37.6, endSec: 37.9 },
      { word: 'the', startSec: 37.9, endSec: 38.2 },
      { word: 'big', startSec: 38.2, endSec: 38.6 },
      { word: 'punchline', startSec: 38.6, endSec: 39.4 },
      { word: 'at', startSec: 39.4, endSec: 39.7 },
      { word: 'the', startSec: 39.7, endSec: 40.0 },
      { word: 'end!', startSec: 40.0, endSec: 40.6 }
    ];

    const snapped = snapSegmentToSpeechBoundary({
      startSec: 0,
      endSec: 38.0,
      mediaDurationSec: 52.0,
      words,
      silences: [],
      mode: 'complete_story',
      maxAllowedEndSec: 48.0
    });
    expect(snapped.endSec).toBeGreaterThanOrEqual(40.6);
    expect(snapped.snappedEnd).toBe(true);

    const tailCompleted = snapSegmentToSpeechBoundary({
      startSec: 0,
      endSec: 38.0,
      mediaDurationSec: 43.0,
      words: [],
      silences: [],
      mode: 'complete_story',
      maxAllowedEndSec: 45.0
    });
    expect(tailCompleted.endSec).toBe(43.0);
    expect(tailCompleted.completedToTail).toBe(true);

    const full = snapSegmentToSpeechBoundary({
      startSec: 5,
      endSec: 20,
      mediaDurationSec: 58.4,
      words,
      silences: [],
      mode: 'full_source'
    });
    expect(full.startSec).toBe(0);
    expect(full.endSec).toBe(58.4);
  });

  it('resolveContentLanguage & part_series mengunci 100% Bahasa Inggris untuk target US/Global', () => {
    const langUs = resolveContentLanguage({ countryCode: 'US', languageStyle: 'Bahasa Indonesia Santai' });
    expect(langUs.code).toBe('en');
    expect(langUs.label).toContain('English');

    const langId = resolveContentLanguage({ countryCode: 'ID', languageStyle: 'Bahasa Indonesia Santai' });
    expect(langId.code).toBe('id');

    const drafts = buildHeuristicMultiVariantEdls({
      mediaAssetId: 'vid-long-1',
      mediaDurationSec: 46,
      rawVideos: [{ id: 'vid-long-1', durationSec: 46, transcript: null, silences: [] }],
      rulebook: null,
      targetConfig: {
        platform: 'youtube_shorts',
        countryCode: 'US',
        languageStyle: 'English (US Casual & Punchy)',
        ageGroup: '18-24',
        genderFocus: 'all',
        personaNiche: 'Tech Creators',
        controversyLevel: 'bold_opinion',
        hookType: 'curiosity_gap',
        emotionalTrigger: 'Curiosity',
        primaryKpi: 'watch_time',
        editingStyle: 'fast_cut_retention',
        framingMode: 'fit_blur_bg',
        captionStyle: 'hormozi_bold',
        initialAudioMode: 'ducking_20',
        batchDiversityMode: 'distinct_moments',
        clipEndingMode: 'part_series',
        batchCount: 2
      },
      silences: []
    });

    expect(drafts.length).toBe(2);
    expect(drafts[0].angleTitle).toContain('Part 1');
    expect(drafts[0].edl.complianceOverlays.ctaText).toContain('Part 2');
    expect(drafts[1].angleTitle).toContain('Part 2');
    expect(drafts[1].edl.segments[0].startSec).toBeGreaterThanOrEqual(drafts[0].edl.segments[0].endSec - 0.5);

    const { playbook } = buildDeterministicEvaluation({
      edl: drafts[0].edl,
      actualDurationSec: 23,
      rulebook: null,
      targetConfig: {
        platform: 'tiktok',
        countryCode: 'US',
        languageStyle: 'English (US Casual & Punchy)',
        ageGroup: '18-24',
        genderFocus: 'all',
        personaNiche: 'Kreator & Pekerja Muda',
        controversyLevel: 'hot_take',
        hookType: 'curiosity_gap',
        emotionalTrigger: 'Curiosity',
        primaryKpi: 'watch_time',
        editingStyle: 'fast_cut_retention',
        framingMode: 'fit_blur_bg',
        captionStyle: 'hormozi_bold',
        initialAudioMode: 'ducking_20',
        batchDiversityMode: 'distinct_moments',
        clipEndingMode: 'part_series',
        batchCount: 2
      },
      angleTitle: drafts[0].angleTitle,
      hookSummary: drafts[0].hookSummary
    });

    const pubText = [
      ...playbook.titleOptions,
      playbook.captionDescription,
      ...playbook.hashtags.niche,
      ...playbook.hashtags.broad,
      ...playbook.engagementToolkit.pinnedComments
    ].join(' ');
    expect(pubText).not.toMatch(/tiktokindonesia|belajarbareng|tipskonten|Ikuti dan simpan|Jangan lewatkan|Menurut kamu/i);
    expect(playbook.hashtags.broad).toContain('#fyp');
    expect(playbook.hashtags.broad).toContain('#viral');
  });

  it('menggunakan SELURUH 3 video mentah yang diunggah pada batch 3 variasi target US tanpa bocor teks Indonesia di ASS & Playbook', async () => {
    const f1 = await generateSyntheticMp4(`m17-raw-1-${Date.now()}.mp4`, '0x1d4ed8', 3.5);
    const f2 = await generateSyntheticMp4(`m17-raw-2-${Date.now()}.mp4`, '0x047857', 4.0);
    const f3 = await generateSyntheticMp4(`m17-raw-3-${Date.now()}.mp4`, '0xb45309', 3.8);

    const id1 = await uploadRawVideoToCampaign(f1, 'raw-video-1.mp4');
    const id2 = await uploadRawVideoToCampaign(f2, 'raw-video-2.mp4');
    const id3 = await uploadRawVideoToCampaign(f3, 'raw-video-3.mp4');

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
        initialAudioMode: 'mute_for_platform_sound',
        batchDiversityMode: 'distinct_moments',
        clipEndingMode: 'complete_story',
        batchCount: 3
      }
    });
    expect(startRes.status).toBe(201);
    const batchId = startRes.body.data.id as string;

    let batchStatus = 'queued';
    let detailBody: {
      clips: Array<{
        id: string;
        angleTitle: string;
        hookSummary: string;
        activeVersion: {
          id: string;
          edl: { segments: Array<{ mediaAssetId: string }> };
        };
      }>;
    } | null = null;

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const poll = await agent.get(`/api/batches/${batchId}`);
      expect(poll.status).toBe(200);
      batchStatus = poll.body.data.status;
      detailBody = poll.body.data;
      if (batchStatus === 'completed' || batchStatus === 'failed' || batchStatus === 'partial_success') break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(batchStatus).toBe('completed');
    expect(detailBody?.clips.length).toBe(3);

    const usedMediaIds = new Set(
      (detailBody?.clips ?? []).flatMap((c) => c.activeVersion.edl.segments.map((s) => s.mediaAssetId))
    );
    expect(usedMediaIds.has(id1)).toBe(true);
    expect(usedMediaIds.has(id2)).toBe(true);
    expect(usedMediaIds.has(id3)).toBe(true);
    expect(usedMediaIds.size).toBe(3);

    for (const clip of detailBody?.clips ?? []) {
      expect(clip.angleTitle).not.toMatch(/Angle Sudut|Angle Hook Langsung|Angle Poin Cepat/i);
      const clipRes = await agent.get(`/api/clips/${clip.id}`);
      expect(clipRes.status).toBe(200);
      const activeVer = clipRes.body.data.versions[0];
      const pb = activeVer.uploadPlaybook;
      const pbText = [
        ...pb.titleOptions,
        pb.captionDescription,
        ...pb.hashtags.niche,
        ...pb.hashtags.broad,
        ...pb.engagementToolkit.pinnedComments
      ].join(' ');
      expect(pbText).not.toMatch(/tiktokindonesia|belajarbareng|Ikuti dan simpan|Jangan lewatkan|Kebanyakan orang/i);

      const dbVer = await prisma.clipVersion.findUnique({ where: { id: activeVer.id } });
      expect(dbVer?.outputAssPath).toBeTruthy();
      const assRaw = fs.readFileSync(resolveSafeStoragePath(dbVer!.outputAssPath!), 'utf8');
      expect(assRaw).not.toMatch(/Ikuti dan simpan|Kebanyakan orang|Cek detail sekarang/i);
      expect(assRaw).toContain(',70,215,565,1');
    }
  }, 90_000);
});
