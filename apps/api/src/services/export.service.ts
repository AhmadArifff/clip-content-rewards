import fs from 'node:fs';
import type {
  EdlDocument,
  ServiceResult,
  TargetConfig,
  UploadPlaybook
} from '@clip/shared';
import { resolveSafeStoragePath } from '../config/storage.js';
import { batchRepository } from '../repositories/batch.repository.js';

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function slugifyFilename(input: string, maxLen = 40): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (cleaned || 'clip').slice(0, maxLen);
}

export function formatUploadPlaybookText(params: {
  campaignTitle: string;
  angleTitle: string;
  versionNumber: number;
  viralScoreTotal: number | null;
  briefCompliance: string | null;
  actualDurationSec: number | null;
  targetConfig: TargetConfig | null;
  edl: EdlDocument | null;
  playbook: UploadPlaybook | null;
}): string {
  const {
    campaignTitle,
    angleTitle,
    versionNumber,
    viralScoreTotal,
    briefCompliance,
    actualDurationSec,
    targetConfig,
    edl,
    playbook
  } = params;

  const lines: string[] = [
    '============================================================',
    `UPLOAD PLAYBOOK - ${campaignTitle}`,
    '============================================================',
    `Variasi Klip   : ${angleTitle} (v${versionNumber})`,
    `Platform       : ${(targetConfig?.platform ?? 'tiktok').toUpperCase()}`,
    `Target Audiens : ${targetConfig?.countryCode ?? 'ID'} | Usia ${targetConfig?.ageGroup ?? '18-24'} | ${targetConfig?.personaNiche ?? '-'}`,
    `Skor Viral     : ${viralScoreTotal ?? '-'}/100 | Kepatuhan Brief: ${(briefCompliance ?? 'warn').toUpperCase()}`,
    `Durasi Aktual  : ${actualDurationSec ? `${actualDurationSec.toFixed(1)} detik` : '-'}`,
    `Mode Framing   : ${edl?.framingMode ?? '-'}`,
    ''
  ];

  if (!playbook) {
    lines.push('Upload Playbook belum tersedia untuk versi ini.');
    return lines.join('\n');
  }

  const allTags = Array.from(
    new Set([
      ...playbook.hashtags.mandatory,
      ...playbook.hashtags.niche,
      ...playbook.hashtags.broad
    ])
  ).join(' ');

  lines.push(
    '--- 1. PANDUAN AUDIO & BACKSOUND MUSIK ---',
    `Kondisi Audio Video : ${playbook.audioMusicGuide.renderedAudioState}`,
    `Vibe Musik Disaran  : ${playbook.audioMusicGuide.recommendedMusicVibe} (${playbook.audioMusicGuide.bpmRange})`,
    `Instruksi Mixing    : ${playbook.audioMusicGuide.platformMixingInstruction}`,
    '',
    '--- 2. OPSI JUDUL / HOOK UPLOAD ---',
    ...playbook.titleOptions.map((t, i) => `${i + 1}. ${t}`),
    '',
    '--- 3. CAPTION & DESKRIPSI SIAP TEMPEL ---',
    playbook.captionDescription,
    '',
    '--- 4. HASHTAG BERTINGKAT ---',
    `Wajib Brief : ${playbook.hashtags.mandatory.join(' ') || '-'}`,
    `Niche       : ${playbook.hashtags.niche.join(' ') || '-'}`,
    `Broad       : ${playbook.hashtags.broad.join(' ') || '-'}`,
    `Gabungan    : ${allTags}`,
    '',
    '--- 5. JADWAL TAYANG OPTIMAL ---',
    `Zona Waktu   : ${playbook.optimalSchedule.timezone}`,
    `Hari Terbaik : ${playbook.optimalSchedule.bestDays.join(', ')}`,
    `Jam Tayang   : ${playbook.optimalSchedule.bestTimeSlots.join(' | ')}`,
    `Alasan       : ${playbook.optimalSchedule.rationale}`,
    '',
    '--- 6. TOOLKIT INTERAKSI 15 MENIT PERTAMA ---',
    `Rekomendasi Cover Frame: Detik ${playbook.engagementToolkit.coverFrameSec.toFixed(1)}s`,
    'Pinned Comment:',
    ...playbook.engagementToolkit.pinnedComments.map((c, i) => `  ${i + 1}. ${c}`),
    'Checklist Pasca-Upload:',
    ...playbook.engagementToolkit.first15MinChecklist.map((s) => `  - ${s}`),
    ''
  );

  return lines.join('\n');
}

export interface BatchExportClipEntry {
  folderName: string;
  clipId: string;
  angleTitle: string;
  versionNumber: number;
  viralScoreTotal: number | null;
  briefCompliance: string | null;
  isApproved: boolean;
  actualDurationSec: number | null;
  audioLabel: string;
  bestScheduleSlot: string;
  videoAbsPath: string;
  srtAbsPath: string | null;
  coverAbsPath: string | null;
  playbookText: string;
}

export interface BatchExportPlan {
  zipFilename: string;
  summaryMarkdown: string;
  entries: BatchExportClipEntry[];
}

export type SingleDownloadResult =
  | { kind: 'file'; absPath: string; filename: string; contentType: string }
  | { kind: 'buffer'; buffer: Buffer; filename: string; contentType: string };

export const exportService = {
  async resolveSingleClipDownload(
    userId: string,
    clipId: string,
    type: 'mp4' | 'playbook' | 'srt' | 'cover',
    versionId?: string
  ): Promise<ServiceResult<SingleDownloadResult>> {
    const clip = await batchRepository.findClipForUser(clipId, userId);
    if (!clip) {
      return {
        ok: false,
        code: 'CLIP_NOT_FOUND',
        message: 'Klip video tidak ditemukan.',
        statusCode: 404
      };
    }

    const ver =
      (versionId ? clip.versions.find((v) => v.id === versionId) : null) ??
      clip.versions.find((v) => v.id === clip.activeVersionId) ??
      clip.versions[0];

    if (!ver) {
      return {
        ok: false,
        code: 'VERSION_NOT_FOUND',
        message: 'Versi hasil render klip belum tersedia.',
        statusCode: 404
      };
    }

    const slug = slugifyFilename(clip.angleTitle, 32);
    const prefix = `clip-${String(clip.sequenceIndex).padStart(2, '0')}-${slug}-v${ver.versionNumber}`;

    if (type === 'playbook') {
      const targetConfig = safeJson<TargetConfig | null>(clip.batch.targetConfigJson, null);
      const edl = safeJson<EdlDocument | null>(ver.edlJson, null);
      const playbook = safeJson<UploadPlaybook | null>(ver.uploadPlaybookJson, null);
      const txt = formatUploadPlaybookText({
        campaignTitle: clip.batch.campaign.title,
        angleTitle: clip.angleTitle,
        versionNumber: ver.versionNumber,
        viralScoreTotal: ver.viralScoreTotal,
        briefCompliance: ver.briefCompliance,
        actualDurationSec: ver.actualDurationSec,
        targetConfig,
        edl,
        playbook
      });
      return {
        ok: true,
        data: {
          kind: 'buffer',
          buffer: Buffer.from(txt, 'utf8'),
          filename: `${prefix}-upload-playbook.txt`,
          contentType: 'text/plain; charset=utf-8'
        }
      };
    }

    if (type === 'srt') {
      if (ver.outputSrtPath) {
        const absPath = resolveSafeStoragePath(ver.outputSrtPath);
        if (fs.existsSync(absPath)) {
          return {
            ok: true,
            data: {
              kind: 'file',
              absPath,
              filename: `${prefix}-subtitles.srt`,
              contentType: 'application/x-subrip; charset=utf-8'
            }
          };
        }
      }
      return {
        ok: true,
        data: {
          kind: 'buffer',
          buffer: Buffer.from('', 'utf8'),
          filename: `${prefix}-subtitles.srt`,
          contentType: 'application/x-subrip; charset=utf-8'
        }
      };
    }

    const relPath = type === 'mp4' ? ver.outputVideoPath : ver.coverImagePath;
    if (!relPath) {
      return {
        ok: false,
        code: 'FILE_NOT_READY',
        message: 'Berkas hasil render yang diminta belum tersedia.',
        statusCode: 404
      };
    }

    const absPath = resolveSafeStoragePath(relPath);
    if (!fs.existsSync(absPath)) {
      return {
        ok: false,
        code: 'FILE_MISSING_ON_DISK',
        message: 'Berkas tidak ditemukan di penyimpanan lokal.',
        statusCode: 404
      };
    }

    return {
      ok: true,
      data: {
        kind: 'file',
        absPath,
        filename: type === 'mp4' ? `${prefix}.mp4` : `${prefix}-cover.jpg`,
        contentType: type === 'mp4' ? 'video/mp4' : 'image/jpeg'
      }
    };
  },

  async prepareBatchZipExport(
    userId: string,
    batchId: string,
    options: {
      filter: 'all' | 'approved' | 'high_score' | 'selected';
      minScore?: number;
      clipIds?: string[];
    }
  ): Promise<ServiceResult<BatchExportPlan>> {
    const batch = await batchRepository.findBatchDetailForUser(batchId, userId);
    if (!batch) {
      return {
        ok: false,
        code: 'BATCH_NOT_FOUND',
        message: 'Batch generate tidak ditemukan.',
        statusCode: 404
      };
    }

    const targetConfig = safeJson<TargetConfig | null>(batch.targetConfigJson, null);
    const minScore = options.minScore ?? 80;
    const selectedSet = new Set(options.clipIds ?? []);

    const matched: Array<{
      clip: (typeof batch.clips)[number];
      ver: (typeof batch.clips)[number]['versions'][number];
      videoAbsPath: string;
    }> = [];

    for (const clip of batch.clips) {
      if (clip.status !== 'ready') continue;
      const ver = clip.versions.find((v) => v.id === clip.activeVersionId) ?? clip.versions[0];
      if (!ver?.outputVideoPath) continue;

      const videoAbsPath = resolveSafeStoragePath(ver.outputVideoPath);
      if (!fs.existsSync(videoAbsPath)) continue;

      if (options.filter === 'approved' && !clip.isApproved) continue;
      if (options.filter === 'high_score' && (ver.viralScoreTotal ?? 0) < minScore) continue;
      if (options.filter === 'selected' && !selectedSet.has(clip.id)) continue;

      matched.push({ clip, ver, videoAbsPath });
    }

    if (matched.length === 0) {
      return {
        ok: false,
        code: 'NO_MATCHING_CLIPS_FOR_EXPORT',
        message: 'Tidak ada variasi klip yang memenuhi kriteria filter export yang dipilih.',
        statusCode: 400
      };
    }

    matched.sort((a, b) => {
      const sa = a.ver.viralScoreTotal ?? -1;
      const sb = b.ver.viralScoreTotal ?? -1;
      if (sb !== sa) return sb - sa;
      return a.clip.sequenceIndex - b.clip.sequenceIndex;
    });

    const entries: BatchExportClipEntry[] = matched.map(({ clip, ver, videoAbsPath }, idx) => {
      const scorePad = String(ver.viralScoreTotal ?? 0).padStart(2, '0');
      const folderName = `${String(idx + 1).padStart(2, '0')}-score-${scorePad}-${slugifyFilename(clip.angleTitle, 28)}-v${ver.versionNumber}`;
      const edl = safeJson<EdlDocument | null>(ver.edlJson, null);
      const playbook = safeJson<UploadPlaybook | null>(ver.uploadPlaybookJson, null);

      const audioLabel = edl?.audio.muteOriginal
        ? 'Mute 0% (Sound Platform)'
        : edl && edl.audio.originalVolume < 0.9
          ? `Ducking ${Math.round(edl.audio.originalVolume * 100)}%`
          : 'Original 100%';

      const srtAbsPath = ver.outputSrtPath ? resolveSafeStoragePath(ver.outputSrtPath) : null;
      const coverAbsPath = ver.coverImagePath ? resolveSafeStoragePath(ver.coverImagePath) : null;

      return {
        folderName,
        clipId: clip.id,
        angleTitle: clip.angleTitle,
        versionNumber: ver.versionNumber,
        viralScoreTotal: ver.viralScoreTotal,
        briefCompliance: ver.briefCompliance,
        isApproved: clip.isApproved,
        actualDurationSec: ver.actualDurationSec,
        audioLabel,
        bestScheduleSlot: playbook
          ? `${playbook.optimalSchedule.bestTimeSlots.join(' / ')} (${playbook.optimalSchedule.timezone})`
          : '-',
        videoAbsPath,
        srtAbsPath: srtAbsPath && fs.existsSync(srtAbsPath) ? srtAbsPath : null,
        coverAbsPath: coverAbsPath && fs.existsSync(coverAbsPath) ? coverAbsPath : null,
        playbookText: formatUploadPlaybookText({
          campaignTitle: batch.campaign.title,
          angleTitle: clip.angleTitle,
          versionNumber: ver.versionNumber,
          viralScoreTotal: ver.viralScoreTotal,
          briefCompliance: ver.briefCompliance,
          actualDurationSec: ver.actualDurationSec,
          targetConfig,
          edl,
          playbook
        })
      };
    });

    const today = new Date().toISOString().slice(0, 10);
    const campSlug = slugifyFilename(batch.campaign.title, 32).replace(/^campaign-/, '') || 'export';
    const zipFilename = `campaign-${campSlug}-${today}.zip`;

    const summaryLines: string[] = [
      `# Ringkasan Export Campaign & Jadwal Upload: ${batch.campaign.title}`,
      '',
      `- **Tanggal Export:** ${today}`,
      `- **Platform Target:** ${(targetConfig?.platform ?? 'tiktok').toUpperCase()}`,
      `- **Target Audiens:** ${targetConfig?.countryCode ?? 'ID'} | Usia ${targetConfig?.ageGroup ?? '18-24'} | ${targetConfig?.personaNiche ?? '-'}`,
      `- **Filter Export:** ${options.filter} (${entries.length} variasi klip)`,
      '',
      '## Daftar Folder & Rekomendasi Jadwal Tayang',
      '',
      '| No | Folder | Variasi | Versi | Skor Viral | Brief | Final | Audio | Jadwal Optimal |',
      '| :-: | :--- | :--- | :-: | :-: | :-: | :-: | :--- | :--- |',
      ...entries.map(
        (e, i) =>
          `| ${i + 1} | \`${e.folderName}/\` | ${e.angleTitle} | v${e.versionNumber} | **${e.viralScoreTotal ?? '-'}/100** | ${(e.briefCompliance ?? 'warn').toUpperCase()} | ${e.isApproved ? 'YA' : 'Belum'} | ${e.audioLabel} | ${e.bestScheduleSlot} |`
      ),
      '',
      '## Panduan Cepat Eksekusi Upload',
      '',
      '1. Buka folder variasi dengan skor tertinggi terlebih dahulu.',
      '2. Baca `upload-playbook.txt` untuk mengecek apakah audio asli sudah di-mute (0%) atau ducking agar setting volume Trending Sound di aplikasi TikTok/YouTube tidak bertabrakan.',
      '3. Tempel caption, hashtag wajib campaign, dan sematkan salah satu Pinned Comment dalam 2 menit pertama setelah tayang.',
      ''
    ];

    return {
      ok: true,
      data: {
        zipFilename,
        summaryMarkdown: summaryLines.join('\n'),
        entries
      }
    };
  }
};
