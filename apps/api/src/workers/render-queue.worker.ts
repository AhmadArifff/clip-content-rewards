import { EventEmitter } from 'node:events';
import {
  EdlSchema,
  type BriefRulebook,
  type PacingBlueprint,
  type SilenceInterval,
  type TargetConfig,
  type TranscriptPayload
} from '@clip/shared';
import { env } from '../config/env.js';
import { resolveSafeStoragePath } from '../config/storage.js';
import { batchRepository } from '../repositories/batch.repository.js';
import { pacingRepository } from '../repositories/pacing.repository.js';
import { planMultiVariantEdls } from '../services/ai/edl-director.service.js';
import { evaluateClipVersion } from '../services/ai/viral-evaluator.service.js';
import { brandKitService } from '../services/brand-kit.service.js';
import { mediaService } from '../services/media.service.js';
import { renderEdlToMp4, type RenderMediaSource } from '../services/media/edl-renderer.service.js';
import {
  detectEmbeddedSubtitlesForMedia,
  parseAudioDiagnosticSafe
} from '../services/media/embedded-caption-detector.service.js';
import { extractVideoStoryboards, type VideoStoryboard } from '../services/media/vision-storyboard.service.js';
import { analyzeSubjectFocusTrack } from '../services/media/vision-tracker.service.js';
import { getActiveKeyForRole } from '../services/ai/llm-json.adapter.js';

export interface BatchProgressEvent {
  batchId: string;
  clipId?: string;
  status: string;
  progressPct: number;
  stageLabel: string;
  errorMessage?: string | null;
  timestamp: string;
}

class LocalRenderQueueWorker {
  readonly bus = new EventEmitter();
  private activeWorkers = 0;
  private queue: Array<() => Promise<void>> = [];
  private cancelledBatches = new Set<string>();

  constructor() {
    this.bus.setMaxListeners(100);
  }

  emitProgress(event: BatchProgressEvent) {
    this.bus.emit(`batch:${event.batchId}`, event);
  }

  markBatchCancelled(batchId: string) {
    this.cancelledBatches.add(batchId);
    this.emitProgress({
      batchId,
      status: 'cancelled',
      progressPct: 100,
      stageLabel: 'Batch dibatalkan oleh pengguna',
      timestamp: new Date().toISOString()
    });
  }

  enqueueBatch(batchId: string, userId: string) {
    this.cancelledBatches.delete(batchId);
    this.queue.push(() => this.processBatch(batchId, userId));
    this.pump();
  }

  enqueueSingleClipRetry(batchId: string, clipId: string) {
    this.cancelledBatches.delete(batchId);
    this.queue.push(async () => {
      await this.renderExistingClip(batchId, clipId);
    });
    this.pump();
  }

  private pump() {
    while (this.activeWorkers < env.MAX_RENDER_CONCURRENCY && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;
      this.activeWorkers += 1;
      task()
        .catch((err) => {
          console.error('[RenderWorker] Task error:', err instanceof Error ? err.message : err);
        })
        .finally(() => {
          this.activeWorkers -= 1;
          this.pump();
        });
    }
  }

  private buildMediaSources(batch: NonNullable<Awaited<ReturnType<typeof batchRepository.findBatchById>>>): {
    rawVideos: Array<
      RenderMediaSource & {
        originalFilename: string;
        transcript: TranscriptPayload | null;
        silences: SilenceInterval[];
        audioDiagnosticJson: string | null;
        embeddedSubtitleCheckedAt: string | null;
      }
    >;
    watermarkPathById: Map<string, string>;
    primaryRaw: RenderMediaSource;
    primarySilences: SilenceInterval[];
    primaryTranscript: TranscriptPayload | null;
  } {
    const rawVideos: Array<
      RenderMediaSource & {
        originalFilename: string;
        transcript: TranscriptPayload | null;
        silences: SilenceInterval[];
        audioDiagnosticJson: string | null;
        embeddedSubtitleCheckedAt: string | null;
      }
    > = [];
    const watermarkPathById = new Map<string, string>();
    let primarySilences: SilenceInterval[] = [];
    let primaryTranscript: TranscriptPayload | null = null;

    for (const m of batch.campaign.mediaAssets) {
      if (m.assetType === 'watermark') {
        watermarkPathById.set(m.id, m.filePath);
        continue;
      }
      if (m.assetType === 'raw_video') {
        const transcript = m.transcriptJson ? (JSON.parse(m.transcriptJson) as TranscriptPayload) : null;
        const silences = m.silencesJson ? (JSON.parse(m.silencesJson) as SilenceInterval[]) : [];
        const audioDiag = parseAudioDiagnosticSafe(m.audioDiagnosticJson, m.hasAudio);
        if (rawVideos.length === 0) {
          primaryTranscript = transcript;
          primarySilences = silences;
        }
        rawVideos.push({
          id: m.id,
          originalFilename: m.originalFilename,
          filePath: m.filePath,
          durationSec: m.durationSec ?? 5,
          hasAudio: m.hasAudio,
          words: transcript?.words ?? [],
          hasEmbeddedSubtitles: Boolean(audioDiag.hasEmbeddedSubtitles),
          audioDiagnosticJson: m.audioDiagnosticJson,
          embeddedSubtitleCheckedAt: audioDiag.embeddedSubtitleCheckedAt ?? null,
          transcript,
          silences
        });
      }
    }

    if (rawVideos.length === 0) {
      throw new Error('Tidak ditemukan video mentah utama pada campaign ini.');
    }

    return {
      rawVideos,
      watermarkPathById,
      primaryRaw: rawVideos[0],
      primarySilences,
      primaryTranscript
    };
  }

  private async processBatch(batchId: string, userId: string) {
    const batch = await batchRepository.findBatchById(batchId);
    if (!batch) return;

    const batchJob = await batchRepository.createRenderJob({
      jobType: 'generate_batch',
      entityId: batchId,
      payloadJson: JSON.stringify({ batchId }),
      stageLabel: 'Merancang variasi EDL oleh AI Director...'
    });

    await batchRepository.updateBatch(batchId, { status: 'processing' });
    await batchRepository.updateRenderJob(batchJob.id, {
      status: 'processing',
      progressPct: 10,
      startedAt: new Date()
    });
    this.emitProgress({
      batchId,
      status: 'processing',
      progressPct: 10,
      stageLabel: 'Merancang variasi EDL oleh AI Director...',
      timestamp: new Date().toISOString()
    });

    try {
      const targetConfig = JSON.parse(batch.targetConfigJson) as TargetConfig;
      const rulebook = batch.campaign.brief?.parsedRulebookJson
        ? (JSON.parse(batch.campaign.brief.parsedRulebookJson) as BriefRulebook)
        : null;

      let mediaBundle = this.buildMediaSources(batch);

      // M19: Auto-Transcribe otomatis (Groq Whisper / Gemini STT gratis) jika video ber-audio belum punya transkrip kata
      const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
      const [activeBrainKey, activeSttKey] = await Promise.all([
        getActiveKeyForRole(userId, 'brain'),
        getActiveKeyForRole(userId, 'stt')
      ]);

      if (!isTestEnv && (activeSttKey || activeBrainKey?.provider === 'gemini')) {
        const untranscribed = mediaBundle.rawVideos.filter((v) => v.hasAudio && v.words.length === 0);
        if (untranscribed.length > 0) {
          for (let tIdx = 0; tIdx < untranscribed.length; tIdx += 1) {
            const rawVid = untranscribed[tIdx];
            this.emitProgress({
              batchId,
              status: 'processing',
              progressPct: 6 + Math.round((tIdx / untranscribed.length) * 3),
              stageLabel: `Auto-transkrip video #${tIdx + 1}/${untranscribed.length} (${rawVid.originalFilename})...`,
              timestamp: new Date().toISOString()
            });
            await mediaService.transcribeAsset(userId, rawVid.id).catch(() => {});
          }
          const refreshedBatch = await batchRepository.findBatchById(batchId);
          if (refreshedBatch) {
            mediaBundle = this.buildMediaSources(refreshedBatch);
          }
        }
      }

      // M19 & M20: Ekstrak storyboard visual 3x2 untuk Gemini Vision Director & deteksi subtitle bawaan (anti-double)
      let storyboards: VideoStoryboard[] = [];
      const shouldCheckEmbeddedSub =
        !isTestEnv &&
        activeBrainKey?.provider === 'gemini' &&
        (targetConfig.captionOverlapMode ?? 'auto_skip_embedded') !== 'force_show';
      const uncheckedEmbeddedVideos = shouldCheckEmbeddedSub
        ? mediaBundle.rawVideos.filter((v) => !v.embeddedSubtitleCheckedAt)
        : [];

      if (
        !isTestEnv &&
        activeBrainKey?.provider === 'gemini' &&
        ((targetConfig.editAssemblyMode ?? 'cinema_remix') === 'cinema_remix' || uncheckedEmbeddedVideos.length > 0)
      ) {
        this.emitProgress({
          batchId,
          status: 'processing',
          progressPct: 9,
          stageLabel: `Mengekstrak storyboard visual dari ${mediaBundle.rawVideos.length} video untuk Gemini Vision AI...`,
          timestamp: new Date().toISOString()
        });
        storyboards = await extractVideoStoryboards(
          mediaBundle.rawVideos.map((v) => ({
            id: v.id,
            originalFilename: v.originalFilename,
            filePath: v.filePath,
            durationSec: v.durationSec
          })),
          Math.max(4, mediaBundle.rawVideos.length)
        );
      }

      // M20: Deteksi subtitle tertanam (burned-in) otomatis 1x per video menggunakan storyboard yang sama (0 FFmpeg ekstra)
      if (uncheckedEmbeddedVideos.length > 0) {
        const sbByMediaId = new Map(storyboards.map((s) => [s.mediaAssetId, s]));
        for (let sIdx = 0; sIdx < uncheckedEmbeddedVideos.length; sIdx += 1) {
          const vid = uncheckedEmbeddedVideos[sIdx];
          this.emitProgress({
            batchId,
            status: 'processing',
            progressPct: 10,
            stageLabel: `Memeriksa subtitle bawaan video #${sIdx + 1}/${uncheckedEmbeddedVideos.length} (${vid.originalFilename})...`,
            timestamp: new Date().toISOString()
          });
          await detectEmbeddedSubtitlesForMedia({
            userId,
            media: {
              id: vid.id,
              originalFilename: vid.originalFilename,
              filePath: vid.filePath,
              durationSec: vid.durationSec,
              hasAudio: vid.hasAudio,
              audioDiagnosticJson: vid.audioDiagnosticJson
            },
            preloadedStoryboard: sbByMediaId.get(vid.id) ?? null
          }).catch(() => {});
        }
        const refreshedBatchAfterSub = await batchRepository.findBatchById(batchId);
        if (refreshedBatchAfterSub) {
          mediaBundle = this.buildMediaSources(refreshedBatchAfterSub);
        }
      }

      let pacingBlueprint: PacingBlueprint | null = null;
      if (targetConfig.referencePacingId) {
        const refRow = await pacingRepository.findByIdForUser(targetConfig.referencePacingId, userId);
        if (refRow?.pacingBlueprintJson) {
          try {
            pacingBlueprint = JSON.parse(refRow.pacingBlueprintJson) as PacingBlueprint;
          } catch {
            pacingBlueprint = null;
          }
        }
      }

      const planned = await planMultiVariantEdls({
        userId,
        mediaAssetId: mediaBundle.primaryRaw.id,
        mediaDurationSec: mediaBundle.primaryRaw.durationSec,
        rawVideos: mediaBundle.rawVideos.map((v) => ({
          id: v.id,
          originalFilename: v.originalFilename,
          durationSec: v.durationSec,
          transcript: v.transcript,
          silences: v.silences
        })),
        storyboards,
        rulebook,
        targetConfig,
        transcript: mediaBundle.primaryTranscript,
        silences: mediaBundle.primarySilences,
        pacingBlueprint
      });

      await batchRepository.updateBatch(batchId, { actualTokens: planned.tokensUsed });

      // Terapkan identitas visual Brand Asset Kit (warna ASS, font, posisi watermark, CTA) jika dipilih
      if (targetConfig.brandKitId) {
        const kit = await brandKitService.findRawForUser(userId, targetConfig.brandKitId);
        if (kit) {
          for (const draft of planned.drafts) {
            draft.edl.supportingOverlays = {
              ...draft.edl.supportingOverlays,
              brandKitId: kit.id,
              brandPrimaryColorHex: kit.primaryColorHex,
              brandAccentColorHex: kit.accentColorHex,
              watermarkPosition: kit.defaultWatermarkPos as 'top_left_safe' | 'top_right_safe' | 'bottom_left_safe',
              watermarkOpacity: kit.defaultWatermarkOpacity
            };
            draft.edl.captions.fontFamily = kit.captionFontFamily;
            if (kit.defaultCtaTemplate?.trim()) {
              draft.edl.complianceOverlays.ctaText = kit.defaultCtaTemplate.trim().slice(0, 110);
            }
          }
        }
      }

      // Jika mode Smart Auto-Track 9:16 aktif, analisis koordinat fokus subjek/wajah per video sumber secara akurat
      if (targetConfig.framingMode === 'auto_face_track') {
        try {
          this.emitProgress({
            batchId,
            status: 'processing',
            progressPct: 13,
            stageLabel: 'Memindai posisi subjek/wajah untuk Smart Auto-Track 9:16...',
            timestamp: new Date().toISOString()
          });
          const rawById = new Map(mediaBundle.rawVideos.map((v) => [v.id, v]));
          const segRefsByMedia = new Map<
            string,
            Array<{ draftIdx: number; segIdx: number; startSec: number; endSec: number }>
          >();

          planned.drafts.forEach((draft, draftIdx) => {
            draft.edl.segments.forEach((seg, segIdx) => {
              const bucket = segRefsByMedia.get(seg.mediaAssetId) ?? [];
              bucket.push({ draftIdx, segIdx, startSec: seg.startSec, endSec: seg.endSec });
              segRefsByMedia.set(seg.mediaAssetId, bucket);
            });
          });

          for (const [mediaId, refs] of segRefsByMedia.entries()) {
            const mediaItem = rawById.get(mediaId) ?? mediaBundle.primaryRaw;
            const absPath = resolveSafeStoragePath(mediaItem.filePath);
            const tracked = await analyzeSubjectFocusTrack(
              absPath,
              refs.map((r) => ({ startSec: r.startSec, endSec: r.endSec }))
            );
            refs.forEach((ref, idx) => {
              const res = tracked[idx];
              if (!res) return;
              const seg = planned.drafts[ref.draftIdx].edl.segments[ref.segIdx];
              planned.drafts[ref.draftIdx].edl.segments[ref.segIdx] = {
                ...seg,
                focusX: res.focusX,
                cropX: res.cropX
              };
            });
          }
        } catch {
          // Fallback aman ke crop tengah jika analisis vision gagal pada video tertentu
        }
      }

      const createdClips: Array<{ clipId: string; versionId: string; sequenceIndex: number }> = [];
      for (const draft of planned.drafts) {
        const clip = await batchRepository.createClip({
          batchId,
          sequenceIndex: draft.sequenceIndex,
          angleTitle: draft.angleTitle,
          hookSummary: draft.hookSummary,
          status: 'queued'
        });
        const ver = await batchRepository.createClipVersion({
          clipId: clip.id,
          versionNumber: 1,
          edlJson: JSON.stringify(draft.edl)
        });
        await batchRepository.updateClip(clip.id, { activeVersionId: ver.id });
        createdClips.push({ clipId: clip.id, versionId: ver.id, sequenceIndex: draft.sequenceIndex });
      }

      let successCount = 0;
      let failCount = 0;

      for (let idx = 0; idx < createdClips.length; idx += 1) {
        if (this.cancelledBatches.has(batchId)) {
          await batchRepository.updateBatch(batchId, { status: 'cancelled' });
          await batchRepository.updateRenderJob(batchJob.id, {
            status: 'cancelled',
            stageLabel: 'Batch dibatalkan',
            finishedAt: new Date()
          });
          return;
        }

        const item = createdClips[idx];
        const basePct = 15 + Math.round((idx / createdClips.length) * 80);
        this.emitProgress({
          batchId,
          clipId: item.clipId,
          status: 'processing',
          progressPct: basePct,
          stageLabel: `Merender Variasi #${item.sequenceIndex} dari ${createdClips.length} (FFmpeg lokal)...`,
          timestamp: new Date().toISOString()
        });

        const ok = await this.renderExistingClip(batchId, item.clipId);
        if (ok) successCount += 1;
        else failCount += 1;
      }

      const finalStatus =
        successCount === createdClips.length
          ? 'completed'
          : successCount > 0
            ? 'partial_success'
            : 'failed';

      await batchRepository.updateBatch(batchId, { status: finalStatus });
      await batchRepository.updateRenderJob(batchJob.id, {
        status: finalStatus === 'failed' ? 'failed' : 'completed',
        progressPct: 100,
        stageLabel:
          finalStatus === 'completed'
            ? `Selesai merender ${successCount} variasi siap tinjau!`
            : `Selesai parsial: ${successCount} berhasil, ${failCount} gagal`,
        finishedAt: new Date()
      });

      this.emitProgress({
        batchId,
        status: finalStatus,
        progressPct: 100,
        stageLabel:
          finalStatus === 'completed'
            ? `Selesai merender ${successCount} variasi siap tinjau!`
            : `Selesai parsial: ${successCount} berhasil, ${failCount} gagal`,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menjalankan batch generate.';
      await batchRepository.updateBatch(batchId, { status: 'failed' });
      await batchRepository.updateRenderJob(batchJob.id, {
        status: 'failed',
        progressPct: 100,
        stageLabel: 'Batch gagal',
        errorMessage: message,
        finishedAt: new Date()
      });
      this.emitProgress({
        batchId,
        status: 'failed',
        progressPct: 100,
        stageLabel: 'Batch gagal',
        errorMessage: message,
        timestamp: new Date().toISOString()
      });
    }
  }

  private async renderExistingClip(batchId: string, clipId: string): Promise<boolean> {
    const batch = await batchRepository.findBatchById(batchId);
    if (!batch) return false;
    const clip = batch.clips.find((c) => c.id === clipId);
    if (!clip) return false;

    const activeVer = clip.versions.find((v) => v.id === clip.activeVersionId) ?? clip.versions[0];
    if (!activeVer) return false;

    const job = await batchRepository.createRenderJob({
      jobType: 'render_clip',
      entityId: clipId,
      payloadJson: JSON.stringify({ batchId, clipId, versionId: activeVer.id }),
      stageLabel: `Rendering Variasi #${clip.sequenceIndex}...`
    });

    await batchRepository.updateClip(clipId, { status: 'processing', errorMessage: null });
    await batchRepository.updateRenderJob(job.id, { status: 'processing', progressPct: 25, startedAt: new Date() });

    try {
      const mediaBundle = this.buildMediaSources(batch);
      const edl = EdlSchema.parse(JSON.parse(activeVer.edlJson));
      const wmId = edl.supportingOverlays.watermarkAssetId;
      let watermarkRelPath = wmId ? mediaBundle.watermarkPathById.get(wmId) ?? null : null;
      if (!watermarkRelPath && edl.supportingOverlays.brandKitId) {
        const kit = await brandKitService.findRawForUser(batch.campaign.userId, edl.supportingOverlays.brandKitId);
        watermarkRelPath = kit?.logoFilePath ?? null;
      }

      const targetConfig = JSON.parse(batch.targetConfigJson) as TargetConfig;
      const rendered = await renderEdlToMp4({
        batchId,
        clipId,
        versionNumber: activeVer.versionNumber,
        edl,
        sources: mediaBundle.rawVideos,
        watermarkRelPath,
        skipEmbeddedSubtitles: (targetConfig.captionOverlapMode ?? 'auto_skip_embedded') !== 'force_show'
      });

      const rulebook = batch.campaign.brief?.parsedRulebookJson
        ? (JSON.parse(batch.campaign.brief.parsedRulebookJson) as BriefRulebook)
        : null;

      let pacingBlueprint: PacingBlueprint | null = null;
      if (targetConfig.referencePacingId) {
        const refRow = await pacingRepository.findByIdForUser(targetConfig.referencePacingId, batch.campaign.userId);
        if (refRow?.pacingBlueprintJson) {
          try {
            pacingBlueprint = JSON.parse(refRow.pacingBlueprintJson) as PacingBlueprint;
          } catch {
            pacingBlueprint = null;
          }
        }
      }

      const { evaluation, playbook } = await evaluateClipVersion({
        userId: batch.campaign.userId,
        edl: rendered.clampedEdl,
        actualDurationSec: rendered.actualDurationSec,
        rulebook,
        targetConfig,
        angleTitle: clip.angleTitle,
        hookSummary: clip.hookSummary ?? '',
        pacingBlueprint
      });

      await batchRepository.updateClipVersion(activeVer.id, {
        edlJson: JSON.stringify(rendered.clampedEdl),
        outputVideoPath: rendered.outputVideoRelPath,
        outputSrtPath: rendered.outputSrtRelPath,
        outputAssPath: rendered.outputAssRelPath,
        coverImagePath: rendered.coverImageRelPath,
        actualDurationSec: rendered.actualDurationSec,
        viralScoreTotal: evaluation.totalScore,
        briefCompliance: evaluation.briefComplianceStatus,
        scoreBreakdownJson: JSON.stringify(evaluation.dimensions),
        impactCritiqueJson: JSON.stringify({
          briefChecklist: evaluation.briefChecklist,
          projectedImpact: evaluation.projectedImpact,
          critiques: evaluation.critiques
        }),
        uploadPlaybookJson: JSON.stringify(playbook),
        renderDurationMs: rendered.renderDurationMs
      });

      await batchRepository.updateClip(clipId, { status: 'ready', errorMessage: null });
      await batchRepository.updateRenderJob(job.id, {
        status: 'completed',
        progressPct: 100,
        stageLabel: 'Video selesai dirender',
        finishedAt: new Date()
      });

      this.emitProgress({
        batchId,
        clipId,
        status: 'clip_ready',
        progressPct: 100,
        stageLabel: `Variasi #${clip.sequenceIndex} selesai (${rendered.actualDurationSec.toFixed(1)}s)`,
        timestamp: new Date().toISOString()
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Render FFmpeg gagal';
      await batchRepository.updateClip(clipId, { status: 'failed', errorMessage: msg });
      await batchRepository.updateRenderJob(job.id, {
        status: 'failed',
        progressPct: 100,
        stageLabel: 'Gagal render',
        errorMessage: msg,
        finishedAt: new Date()
      });
      this.emitProgress({
        batchId,
        clipId,
        status: 'clip_failed',
        progressPct: 100,
        stageLabel: `Variasi #${clip.sequenceIndex} gagal`,
        errorMessage: msg,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }
}

export const renderQueueWorker = new LocalRenderQueueWorker();
