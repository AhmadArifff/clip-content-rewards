<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type {
  AudioDiagnostic,
  BriefRulebook,
  MediaAssetType,
  PlatformTarget,
  SilenceInterval,
  TranscriptPayload
} from '@clip/shared';
import {
  ArrowLeft,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Film,
  Volume2,
  VolumeX,
  FileAudio,
  Trash2,
  Image as ImageIcon
} from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import { apiRequest } from '~/composables/useApi';
import { useChunkedUploader } from '~/composables/useChunkedUploader';
import { useThemeStore } from '~/stores/theme';

interface MediaAssetItem {
  id: string;
  assetType: MediaAssetType;
  originalFilename: string;
  fileSizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  loudnessLufs: number | null;
  audioDiagnostic: AudioDiagnostic | null;
  silences: SilenceInterval[];
  transcript: TranscriptPayload | null;
  status: string;
  errorMessage: string | null;
}

interface CampaignDetail {
  id: string;
  title: string;
  brandOwner: string;
  platformTargets: PlatformTarget[];
  rewardNotes: string;
  status: string;
  brief: {
    id: string;
    sourceType: string;
    originalFilename: string | null;
    rawText: string;
    rulebook: BriefRulebook | null;
    confirmedByUser: boolean;
  } | null;
  mediaAssets: MediaAssetItem[];
}

const route = useRoute();
const themeStore = useThemeStore();
const uploader = useChunkedUploader();

const campaignId = computed(() => String(route.params.id));
const detail = ref<CampaignDetail | null>(null);
const loading = ref(false);
const notice = ref<{ type: 'ok' | 'err' | 'warn'; text: string } | null>(null);

// Brief Upload & Editable Rulebook State
const pastedBriefText = ref('');
const selectedBriefFile = ref<File | null>(null);
const parsingBrief = ref(false);
const savingRulebook = ref(false);

const editGoal = ref('');
const editMinSec = ref(15);
const editMaxSec = ref(60);
const editTone = ref('');
const editDosText = ref('');
const editDontsText = ref('');
const editHashtagsText = ref('');
const editMentionsText = ref('');

// Media Upload State
const selectedAssetType = ref<MediaAssetType>('raw_video');
const transcribingId = ref<string | null>(null);

const rawVideos = computed(() => (detail.value?.mediaAssets ?? []).filter((m) => m.assetType === 'raw_video'));
const supportingAssets = computed(() => (detail.value?.mediaAssets ?? []).filter((m) => m.assetType !== 'raw_video'));
const isReadyForM6 = computed(() => Boolean(detail.value?.brief?.confirmedByUser && rawVideos.value.length > 0));

function syncEditableRulebook(rulebook: BriefRulebook | null) {
  if (!rulebook) return;
  editGoal.value = rulebook.campaignGoal;
  editMinSec.value = rulebook.durationRules.minSec;
  editMaxSec.value = rulebook.durationRules.maxSec;
  editTone.value = rulebook.brandTone;
  editDosText.value = rulebook.mandatoryDos.join('\n');
  editDontsText.value = rulebook.strictDonts.join('\n');
  editHashtagsText.value = rulebook.requiredHashtags.join(', ');
  editMentionsText.value = rulebook.requiredMentions.join(', ');
}

function formatSizeMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(sec: number | null): string {
  if (!sec) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function audioModeLabel(mode: AudioDiagnostic['recommendedAudioMode']): string {
  if (mode === 'mute_for_platform_sound') return 'Saran: Mute Asli (0%) + Sound TikTok/YT';
  if (mode === 'ducking_20') return 'Saran: Kecilkan Asli (20%) + Musik Platform';
  return 'Saran: Original Normalized (-14 LUFS)';
}

async function fetchDetail() {
  loading.value = true;
  try {
    const res = await apiRequest<CampaignDetail>(`/api/campaigns/${campaignId.value}`);
    detail.value = res.data;
    if (res.data?.brief) {
      pastedBriefText.value = res.data.brief.rawText;
      syncEditableRulebook(res.data.brief.rulebook);
    }
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal memuat detail campaign.' };
  } finally {
    loading.value = false;
  }
}

function onBriefFileSelected(ev: Event) {
  const input = ev.target as HTMLInputElement;
  selectedBriefFile.value = input.files?.[0] ?? null;
}

async function handleParseBrief() {
  parsingBrief.value = true;
  notice.value = null;
  try {
    const form = new FormData();
    if (selectedBriefFile.value) {
      form.append('file', selectedBriefFile.value);
    } else if (pastedBriefText.value.trim()) {
      form.append('pastedText', pastedBriefText.value.trim());
    } else {
      notice.value = { type: 'err', text: 'Pilih berkas .pdf/.docx/.doc atau tempel teks brief terlebih dahulu.' };
      return;
    }

    const res = await fetch(`/api/campaigns/${campaignId.value}/brief/upload`, {
      method: 'POST',
      credentials: 'include',
      body: form
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) {
      throw new Error(payload.error?.message || 'Gagal mengekstrak brief.');
    }

    notice.value = {
      type: payload.data.isLikelyScannedPdf ? 'warn' : 'ok',
      text: payload.data.note || 'Aturan brief berhasil diekstrak.'
    };
    selectedBriefFile.value = null;
    await fetchDetail();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal mengekstrak dokumen brief.' };
  } finally {
    parsingBrief.value = false;
  }
}

async function handleConfirmRulebook() {
  savingRulebook.value = true;
  notice.value = null;
  try {
    const rulebook: BriefRulebook = {
      campaignGoal: editGoal.value.trim() || 'Konten siap upload sesuai brief',
      targetPlatforms: detail.value?.platformTargets?.length ? detail.value.platformTargets : ['tiktok'],
      durationRules: {
        minSec: Number(editMinSec.value) || 15,
        maxSec: Math.max(Number(editMaxSec.value) || 60, (Number(editMinSec.value) || 15) + 5),
        idealSec: Math.round(((Number(editMinSec.value) || 15) + (Number(editMaxSec.value) || 60)) / 2)
      },
      mandatoryDos: editDosText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      strictDonts: editDontsText.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      requiredHashtags: editHashtagsText.value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
      requiredMentions: editMentionsText.value.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
      brandTone: editTone.value.trim() || 'Natural & Enerjik'
    };

    await apiRequest(`/api/campaigns/${campaignId.value}/brief`, {
      method: 'PATCH',
      body: JSON.stringify({
        rawText: pastedBriefText.value || undefined,
        rulebook,
        confirmedByUser: true
      })
    });
    notice.value = { type: 'ok', text: 'Aturan brief dikonfirmasi dan siap menjadi acuan AI Director.' };
    await fetchDetail();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal menyimpan aturan brief.' };
  } finally {
    savingRulebook.value = false;
  }
}

async function onMediaFileSelected(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  notice.value = null;
  try {
    await uploader.uploadMediaFile({
      campaignId: campaignId.value,
      file,
      assetType: selectedAssetType.value
    });
    notice.value = { type: 'ok', text: `Berkas "${file.name}" berhasil diunggah dan diverifikasi FFprobe.` };
    await fetchDetail();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal mengunggah media.' };
  } finally {
    input.value = '';
  }
}

async function handleTranscribe(mediaId: string) {
  transcribingId.value = mediaId;
  notice.value = null;
  try {
    await apiRequest(`/api/media/${mediaId}/transcribe`, { method: 'POST' });
    notice.value = { type: 'ok', text: 'Transkripsi kata per detik berhasil dibuat dan disimpan lokal.' };
    await fetchDetail();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal menjalankan transkripsi.' };
  } finally {
    transcribingId.value = null;
  }
}

async function handleDeleteMedia(mediaId: string) {
  try {
    await apiRequest(`/api/media/${mediaId}`, { method: 'DELETE' });
    notice.value = { type: 'ok', text: 'Berkas media dihapus.' };
    await fetchDetail();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal menghapus media.' };
  }
}

onMounted(fetchDetail);
</script>

<template>
  <StudioShell>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1">
          <NuxtLink to="/campaigns" class="inline-flex items-center gap-1.5 text-xs font-semibold studio-muted hover:underline">
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>Kembali ke Daftar Campaign</span>
          </NuxtLink>
          <h1 class="studio-heading text-2xl md:text-3xl font-bold">
            {{ detail?.title || 'Memuat Studio Campaign...' }}
          </h1>
          <p v-if="detail?.brandOwner || detail?.rewardNotes" class="text-xs studio-muted">
            {{ [detail?.brandOwner, detail?.rewardNotes].filter(Boolean).join(' | ') }}
          </p>
        </div>

        <span
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap"
          :class="isReadyForM6 ? 'studio-badge-ok' : 'studio-badge-warn'"
        >
          <CheckCircle2 v-if="isReadyForM6" class="w-4 h-4" />
          <AlertTriangle v-else class="w-4 h-4" />
          <span>{{ isReadyForM6 ? 'Bahan Lengkap (Siap Generator M6)' : 'Lengkapi Brief & Video Mentah' }}</span>
        </span>
      </div>

      <div
        v-if="notice"
        class="p-3.5 rounded text-sm font-medium"
        :class="
          notice.type === 'ok'
            ? 'studio-badge-ok'
            : notice.type === 'warn'
              ? 'studio-badge-warn'
              : 'studio-badge-err'
        "
        role="status"
      >
        {{ notice.text }}
      </div>

      <div v-if="loading && !detail" class="text-sm studio-muted py-8">Memuat ruang kerja campaign...</div>

      <div v-else-if="detail" class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- ===============================================================
             KOLOM KIRI: TAHAP 1 - DOKUMEN BRIEF & EDITABLE RULEBOOK
             =============================================================== -->
        <section class="lg:col-span-6 studio-card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="studio-heading text-lg font-bold">1. Dokumen Brief Campaign</h2>
              <p class="text-xs studio-muted">Unggah berkas .pdf / .docx / .doc atau tempel isi brief langsung.</p>
            </div>
            <span
              v-if="detail.brief?.confirmedByUser"
              class="px-2 py-0.5 text-xs font-semibold rounded studio-badge-ok whitespace-nowrap"
            >
              Terkonfirmasi
            </span>
          </div>

          <div class="space-y-3 p-3.5 rounded" style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color);">
            <div class="space-y-1">
              <label for="brief-file" class="block text-xs font-semibold">Unggah File Brief (.pdf, .docx, .doc, .txt)</label>
              <input
                id="brief-file"
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                class="studio-input text-xs"
                @change="onBriefFileSelected"
              />
            </div>

            <div class="space-y-1">
              <label for="brief-paste" class="block text-xs font-semibold">Atau Tempel Teks Brief Langsung</label>
              <textarea
                id="brief-paste"
                v-model="pastedBriefText"
                rows="4"
                placeholder="Tempel persyaratan brief: durasi wajib, hashtag wajib #..., larangan, dan CTA..."
                class="studio-input text-xs"
              />
            </div>

            <button
              type="button"
              class="studio-btn-primary w-full"
              :disabled="parsingBrief"
              @click="handleParseBrief"
            >
              <Upload class="w-4 h-4" />
              <span>{{ parsingBrief ? 'Mengekstrak Aturan Brief...' : 'Ekstrak Aturan Brief Otomatis' }}</span>
            </button>
          </div>

          <!-- Editable Brief Rulebook -->
          <form
            v-if="detail.brief?.rulebook"
            class="space-y-3 pt-2"
            style="border-top: 1px solid var(--border-color);"
            @submit.prevent="handleConfirmRulebook"
          >
            <h3 class="studio-heading text-base font-bold">Ringkasan Aturan Brief (Bisa Disunting)</h3>

            <div class="space-y-1">
              <label for="rb-goal" class="block text-xs font-semibold">Tujuan Utama Campaign</label>
              <input id="rb-goal" v-model="editGoal" type="text" required class="studio-input text-xs" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div class="space-y-1">
                <label for="rb-min" class="block text-xs font-semibold">Durasi Min (detik)</label>
                <input id="rb-min" v-model.number="editMinSec" type="number" min="5" class="studio-input text-xs" />
              </div>
              <div class="space-y-1">
                <label for="rb-max" class="block text-xs font-semibold">Durasi Maks (detik)</label>
                <input id="rb-max" v-model.number="editMaxSec" type="number" min="10" class="studio-input text-xs" />
              </div>
              <div class="space-y-1">
                <label for="rb-tone" class="block text-xs font-semibold">Gaya Bahasa / Tone</label>
                <input id="rb-tone" v-model="editTone" type="text" class="studio-input text-xs" />
              </div>
            </div>

            <div class="space-y-1">
              <label for="rb-dos" class="block text-xs font-semibold">Syarat Wajib / Do's (1 baris per poin)</label>
              <textarea id="rb-dos" v-model="editDosText" rows="3" class="studio-input text-xs" />
            </div>

            <div class="space-y-1">
              <label for="rb-donts" class="block text-xs font-semibold">Larangan Keras / Don'ts (1 baris per poin)</label>
              <textarea id="rb-donts" v-model="editDontsText" rows="2" class="studio-input text-xs" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div class="space-y-1">
                <label for="rb-tags" class="block text-xs font-semibold">Hashtag Wajib</label>
                <input id="rb-tags" v-model="editHashtagsText" type="text" placeholder="#BrandX, #Promo" class="studio-input font-mono text-xs" />
              </div>
              <div class="space-y-1">
                <label for="rb-mentions" class="block text-xs font-semibold">Mention Wajib</label>
                <input id="rb-mentions" v-model="editMentionsText" type="text" placeholder="@brandx" class="studio-input font-mono text-xs" />
              </div>
            </div>

            <button type="submit" class="studio-btn-primary w-full" :disabled="savingRulebook">
              <CheckCircle2 class="w-4 h-4" />
              <span>{{ savingRulebook ? 'Menyimpan...' : 'Konfirmasi Aturan Brief' }}</span>
            </button>
          </form>
        </section>

        <!-- ===============================================================
             KOLOM KANAN: TAHAP 2 - VIDEO MENTAH, AUDIO DIAGNOSTIC & ASSETS
             =============================================================== -->
        <section
          class="lg:col-span-6 space-y-4"
          :class="themeStore.current === 'daylight-editorial' ? 'studio-card-editorial pt-5' : 'studio-card p-5'"
        >
          <div>
            <h2 class="studio-heading text-lg font-bold">2. Video Mentah & Supporting Assets</h2>
            <p class="text-xs studio-muted">
              Mendukung unggahan bertahap hingga 2 GB (video panjang otomatis dipecah saat transkripsi).
            </p>
          </div>

          <div class="p-3.5 rounded space-y-3" style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color);">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div class="space-y-1">
                <label for="media-type" class="block text-xs font-semibold">Jenis Berkas</label>
                <select id="media-type" v-model="selectedAssetType" class="studio-input text-xs">
                  <option value="raw_video">Video Mentah Utama (.mp4/.mov)</option>
                  <option value="watermark">Logo / Watermark (.png/.webp)</option>
                  <option value="outro">Bumper Outro (.mp4)</option>
                  <option value="broll">Video B-Roll Tambahan (.mp4)</option>
                </select>
              </div>
              <div class="space-y-1">
                <label for="media-file" class="block text-xs font-semibold">Pilih Berkas Lokal</label>
                <input
                  id="media-file"
                  type="file"
                  :accept="selectedAssetType === 'watermark' ? '.png,.jpg,.jpeg,.webp' : '.mp4,.mov,.mkv,.webm'"
                  :disabled="uploader.uploading.value"
                  class="studio-input text-xs"
                  @change="onMediaFileSelected"
                />
              </div>
            </div>

            <div v-if="uploader.uploading.value" class="space-y-1.5">
              <div class="flex justify-between text-xs font-mono">
                <span>{{ uploader.stageText.value }}</span>
                <span>{{ uploader.progressPct.value }}%</span>
              </div>
              <div class="h-2 w-full rounded overflow-hidden" style="background: var(--bg-surface);">
                <div
                  class="h-full transition-all"
                  :style="{ width: `${uploader.progressPct.value}%`, backgroundColor: 'var(--accent-bg)' }"
                />
              </div>
            </div>
          </div>

          <!-- Daftar Video Mentah + Audio Diagnostic -->
          <div class="space-y-3">
            <h3 class="studio-heading text-base font-bold">Video Mentah ({{ rawVideos.length }})</h3>

            <p v-if="rawVideos.length === 0" class="text-xs studio-muted py-4 text-center">
              Belum ada video mentah diunggah. Pilih berkas MP4/MOV di atas untuk memulai pemeriksaan otomatis.
            </p>

            <article
              v-for="vid in rawVideos"
              :key="vid.id"
              class="p-4 rounded space-y-3"
              style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color);"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="font-bold text-sm truncate flex items-center gap-1.5">
                    <Film class="w-4 h-4 shrink-0" style="color: var(--accent-bg);" />
                    <span class="truncate">{{ vid.originalFilename }}</span>
                  </p>
                  <p class="font-mono text-[11px] studio-muted mt-0.5">
                    {{ formatDuration(vid.durationSec) }} | {{ vid.width }}x{{ vid.height }} @ {{ vid.fps ?? 30 }}fps | {{ formatSizeMb(vid.fileSizeBytes) }} | {{ vid.silences.length }} jeda hening
                  </p>
                </div>
                <button type="button" class="studio-btn-secondary" aria-label="Hapus media" @click="handleDeleteMedia(vid.id)">
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>

              <!-- Audio Diagnostic Card -->
              <div
                v-if="vid.audioDiagnostic"
                class="p-3 rounded text-xs space-y-1"
                style="background: var(--bg-surface); border: 1px solid var(--border-color);"
              >
                <div class="flex flex-wrap items-center justify-between gap-1.5">
                  <span class="font-bold inline-flex items-center gap-1">
                    <Volume2 v-if="vid.hasAudio" class="w-3.5 h-3.5" style="color: var(--accent-bg);" />
                    <VolumeX v-else class="w-3.5 h-3.5" style="color: var(--status-warn-fg);" />
                    <span>Diagnosa Audio</span>
                  </span>
                  <span class="px-2 py-0.5 rounded font-semibold studio-badge-ok">
                    {{ audioModeLabel(vid.audioDiagnostic.recommendedAudioMode) }}
                  </span>
                </div>
                <p class="studio-muted leading-relaxed">{{ vid.audioDiagnostic.reason }}</p>
              </div>

              <!-- Transkrip Status & Tombol STT -->
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs studio-muted">
                  <template v-if="vid.transcript?.mode === 'stt_word_level'">
                    Transkrip siap: {{ vid.transcript.words.length }} kata ({{ vid.transcript.chunksProcessed }} chunk)
                  </template>
                  <template v-else-if="vid.transcript?.mode === 'visual_only'">
                    Mode Visual-Only (tanpa dialog)
                  </template>
                  <template v-else>
                    Belum ditranskrip kata per detik
                  </template>
                </span>
                <button
                  v-if="vid.hasAudio"
                  type="button"
                  class="studio-btn-secondary text-xs"
                  :disabled="transcribingId === vid.id"
                  @click="handleTranscribe(vid.id)"
                >
                  <FileAudio class="w-4 h-4" />
                  <span>{{ transcribingId === vid.id ? 'Mentranskrip...' : 'Transkrip Kata (AI)' }}</span>
                </button>
              </div>

              <p
                v-if="vid.transcript?.fullText"
                class="text-xs studio-muted p-2.5 rounded max-h-24 overflow-y-auto"
                style="background: var(--bg-surface);"
              >
                {{ vid.transcript.fullText }}
              </p>
            </article>
          </div>

          <!-- Supporting Assets (Watermark / Outro / B-Roll) -->
          <div v-if="supportingAssets.length > 0" class="space-y-2 pt-2" style="border-top: 1px solid var(--border-color);">
            <h3 class="studio-heading text-sm font-bold">Supporting Assets ({{ supportingAssets.length }})</h3>
            <div class="space-y-2">
              <div
                v-for="ast in supportingAssets"
                :key="ast.id"
                class="p-2.5 rounded flex items-center justify-between gap-2 text-xs"
                style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <ImageIcon class="w-4 h-4 shrink-0" style="color: var(--accent-bg);" />
                  <span class="font-semibold truncate">{{ ast.originalFilename }}</span>
                  <span class="font-mono uppercase text-[10px] px-1.5 py-0.5 rounded studio-badge-ok">{{ ast.assetType }}</span>
                </div>
                <button type="button" class="studio-btn-secondary" aria-label="Hapus asset" @click="handleDeleteMedia(ast.id)">
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </StudioShell>
</template>
