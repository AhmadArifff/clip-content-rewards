import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.js';
import { ensureStorageDirectories, resolveSafeStoragePath } from '../config/storage.js';
import {
  compactTextForTokenBudget,
  generateStructuredJsonWithByok,
  getGeminiWaterfallModels
} from '../services/ai/llm-json.adapter.js';
import {
  interpolatePhraseToWords,
  transcribeMediaWithAutoChunking
} from '../services/ai/stt.adapter.js';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.FFMPEG_PATH, args, { shell: false });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg gagal (${code})`))));
  });
}

describe('M16 Free-Tier AI Quota Manager, Gemini Model Waterfall & Gemini Native Audio STT', () => {
  let sampleVideoRelPath = '';
  let sampleVideoAbsPath = '';

  beforeAll(async () => {
    ensureStorageDirectories();
    sampleVideoRelPath = `temp/qa_m16_audio_${Date.now()}.mp4`;
    sampleVideoAbsPath = resolveSafeStoragePath(sampleVideoRelPath);
    await runFfmpeg([
      '-y',
      '-f', 'lavfi', '-i', 'color=c=0x111827:s=320x180:d=2:r=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k',
      sampleVideoAbsPath
    ]);
  }, 20000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    fs.rmSync(sampleVideoAbsPath, { force: true });
  });

  it('mengompres teks brief panjang ke batas aman sambil mempertahankan baris aturan wajib, #hashtag, dan @mention', () => {
    const filler = Array.from({ length: 120 }, (_, i) => `Paragraf pengantar latar belakang umum nomor ${i + 1} tentang sejarah perusahaan yang cukup panjang.`).join('\n');
    const raw = `${filler}\nWajib durasi 20-45 detik di TikTok.\nGunakan hashtag #BrandGratis dan mention @brandgratis.`;
    const compacted = compactTextForTokenBudget(raw, 1200);

    expect(compacted.length).toBeLessThanOrEqual(1200);
    expect(compacted).toContain('#BrandGratis');
    expect(compacted).toContain('@brandgratis');
    expect(compacted).toContain('20-45 detik');
  });

  it('menjalankan Gemini Model Waterfall otomatis (pro -> flash -> flash-lite) saat menerima HTTP 429', async () => {
    expect(getGeminiWaterfallModels('gemini-2.5-pro')).toEqual([
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ]);
    expect(getGeminiWaterfallModels('gemini-2.5-flash')).toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite'
    ]);

    const calledUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.includes('gemini-2.5-pro')) {
        return new Response('Rate limit exceeded', { status: 429 });
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true,"note":"waterfall berhasil"}' }] } }],
          usageMetadata: { totalTokenCount: 120 }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const result = await generateStructuredJsonWithByok({
      key: {
        id: 'k1',
        provider: 'gemini',
        defaultModel: 'gemini-2.5-pro',
        rawApiKey: 'AIzaTestFakeFreeKey123456'
      },
      systemPrompt: 'Kembalikan JSON',
      userPrompt: 'Tes waterfall',
      minGapMs: 0,
      retryDelayMs: 5
    });

    expect(result.usedModel).toBe('gemini-2.5-flash');
    expect(result.tokensUsed).toBe(120);
    expect(result.json).toEqual({ ok: true, note: 'waterfall berhasil' });
    expect(calledUrls.some((u) => u.includes('gemini-2.5-pro'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('gemini-2.5-flash'))).toBe(true);
  });

  it('menginterpolasi segmen frasa menjadi word timestamps dan menjalankan Gemini Native Audio STT', async () => {
    const words = interpolatePhraseToWords(
      [
        { startSec: 0, endSec: 1.0, text: 'Stop scroll sekarang' },
        { startSec: 1.0, endSec: 2.0, text: 'Cek fitur gratis' }
      ],
      2.0
    );
    expect(words.length).toBe(6);
    expect(words[0].word).toBe('Stop');
    expect(words[5].endSec).toBeLessThanOrEqual(2.0);

    let capturedMime = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const parsedBody = JSON.parse(String(init?.body ?? '{}')) as {
        contents?: Array<{ parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> }>;
      };
      const inline = parsedBody.contents?.[0]?.parts?.find((p) => p.inlineData)?.inlineData;
      capturedMime = inline?.mimeType ?? '';
      expect((inline?.data ?? '').length).toBeGreaterThan(200);

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      language: 'id',
                      segments: [
                        { startSec: 0.0, endSec: 1.0, text: 'Halo kreator lokal' },
                        { startSec: 1.0, endSec: 1.9, text: 'Ini gratis seratus persen' }
                      ]
                    })
                  }
                ]
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const transcript = await transcribeMediaWithAutoChunking({
      mediaId: 'm16test',
      mediaRelativePath: sampleVideoRelPath,
      durationSec: 2,
      sttKey: {
        id: 'k2',
        provider: 'gemini',
        defaultModel: 'gemini-2.5-flash',
        rawApiKey: 'AIzaTestFakeFreeKey123456'
      }
    });

    expect(capturedMime).toBe('audio/mp3');
    expect(transcript.mode).toBe('stt_word_level');
    expect(transcript.provider).toBe('gemini');
    expect(transcript.language).toBe('id');
    expect(transcript.words.length).toBe(7);
    expect(transcript.fullText).toContain('Halo kreator lokal');
  }, 20000);
});
