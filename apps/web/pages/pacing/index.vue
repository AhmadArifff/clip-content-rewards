<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { PacingBlueprint, PacingShot } from '@clip/shared';
import {
  Activity,
  Upload,
  Trash2,
  ShieldCheck,
  Music2,
  Scissors,
  Clock,
  Sparkles
} from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import { apiRequest } from '~/composables/useApi';
import { useThemeCopy } from '~/composables/useThemeCopy';
import { useThemeStore } from '~/stores/theme';

interface ReferencePacingProfileItem {
  id: string;
  name: string;
  sourceFilename: string;
  durationSec: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  shotCount: number;
  avgShotDurationSec: number;
  cutsPerMinute: number;
  estimatedBpm: number;
  energyCurve: string;
  blueprint: PacingBlueprint | null;
  createdAt: string;
}

const copy = useThemeCopy();
const themeStore = useThemeStore();

const profiles = ref<ReferencePacingProfileItem[]>([]);
const loading = ref(false);
const analyzing = ref(false);
const deletingId = ref<string | null>(null);
const profileName = ref('');
const selectedFile = ref<File | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const errorMsg = ref('');
const noticeMsg = ref('');

function energyLabel(curve: string): string {
  if (curve === 'hook_burst_build') return 'Hook Burst (Cepat di Awal)';
  if (curve === 'climax_drop') return 'Climax Drop (Nanjak di Akhir)';
  if (curve === 'calm_story') return 'Storytelling Tenang';
  return 'Fast Steady (Ritmis Konsisten)';
}

function shotRoleColor(role: PacingShot['role']): string {
  if (role === 'hook') return 'var(--accent-bg)';
  if (role === 'climax') return 'var(--status-warn-fg)';
  if (role === 'outro') return 'var(--status-ok-fg)';
  return 'var(--border-strong)';
}

function shotWidthPct(shot: PacingShot, totalDur: number): number {
  const safeTotal = Math.max(0.5, totalDur);
  return Math.max(4, Math.round((shot.durationSec / safeTotal) * 1000) / 10);
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
}

async function fetchProfiles() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<ReferencePacingProfileItem[]>('/api/pacing-profiles');
    profiles.value = res.data ?? [];
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memuat pustaka ritme referensi.';
  } finally {
    loading.value = false;
  }
}

async function handleAnalyze() {
  errorMsg.value = '';
  noticeMsg.value = '';

  if (!selectedFile.value) {
    errorMsg.value = 'Pilih 1 berkas video referensi (.mp4, .mov, .mkv, atau .webm) terlebih dahulu.';
    return;
  }

  analyzing.value = true;
  try {
    const form = new FormData();
    form.append('file', selectedFile.value);
    if (profileName.value.trim()) {
      form.append('name', profileName.value.trim());
    }

    const response = await fetch('/api/pacing-profiles/analyze', {
      method: 'POST',
      credentials: 'include',
      body: form
    });

    const payload = (await response.json()) as {
      success: boolean;
      data: ReferencePacingProfileItem | null;
      error: { message?: string } | null;
    };

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error?.message || 'Gagal menganalisis video referensi.');
    }

    profileName.value = '';
    selectedFile.value = null;
    if (fileInputEl.value) fileInputEl.value.value = '';

    noticeMsg.value = `Ritme "${payload.data.name}" diekstrak (${payload.data.shotCount} shot, ~${payload.data.estimatedBpm} BPM). Berkas video referensi sementara telah dihapus otomatis.`;
    await fetchProfiles();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menganalisis video referensi.';
  } finally {
    analyzing.value = false;
  }
}

async function handleDelete(id: string) {
  deletingId.value = id;
  errorMsg.value = '';
  try {
    await apiRequest(`/api/pacing-profiles/${id}`, { method: 'DELETE' });
    profiles.value = profiles.value.filter((p) => p.id !== id);
    noticeMsg.value = 'Profil ritme referensi berhasil dihapus.';
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menghapus profil ritme.';
  } finally {
    deletingId.value = null;
  }
}

onMounted(fetchProfiles);
</script>

<template>
  <StudioShell>
    <div class="space-y-6 min-w-0">
      <div class="space-y-1">
        <h1 class="studio-heading text-2xl md:text-3xl font-bold">{{ copy.pacingTitle }}</h1>
        <p class="text-sm studio-muted max-w-3xl">{{ copy.pacingSubtitle }}</p>
      </div>

      <div v-if="errorMsg" class="p-3.5 rounded text-sm font-medium studio-badge-err">{{ errorMsg }}</div>
      <div v-if="noticeMsg" class="p-3.5 rounded text-sm font-medium studio-badge-ok">{{ noticeMsg }}</div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- KOLOM KIRI: Form Upload & Ekstraksi Video Referensi -->
        <section class="lg:col-span-5 studio-card p-5 space-y-4">
          <div class="flex items-center gap-2">
            <Upload class="w-5 h-5" style="color: var(--accent-bg);" />
            <h2 class="studio-heading text-base font-bold">Analisis Video Viral Referensi</h2>
          </div>

          <div class="space-y-1.5">
            <label for="pacing-name" class="block text-xs font-semibold">Nama Profil Ritme (Opsional)</label>
            <input
              id="pacing-name"
              v-model="profileName"
              type="text"
              class="studio-input text-sm"
              placeholder="Contoh: Hook Cepat TikTok 1.4s / Cut"
            />
          </div>

          <div class="space-y-1.5">
            <label for="pacing-file" class="block text-xs font-semibold">Berkas Video Referensi (.mp4 / .mov / .mkv / .webm)</label>
            <input
              id="pacing-file"
              ref="fileInputEl"
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.mkv,.webm"
              class="studio-input text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold"
              @change="onFileChange"
            />
          </div>

          <!-- Guardrail Style-Only Cloning -->
          <div
            class="p-3.5 rounded text-xs space-y-1"
            style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
          >
            <div class="font-bold inline-flex items-center gap-1.5">
              <ShieldCheck class="w-4 h-4" style="color: var(--status-ok-fg);" />
              <span>Jaminan Style-Only Cloning (Aman Hak Cipta)</span>
            </div>
            <p class="studio-muted leading-relaxed">
              Sistem hanya mengekstrak angka durasi shot, ritme potongan, kurva energi, dan estimasi BPM. Berkas video referensi langsung dihapus otomatis setelah dianalisis dan tidak pernah disalin ke hasil akhir.
            </p>
          </div>

          <button
            type="button"
            class="studio-btn-primary w-full"
            :disabled="analyzing || !selectedFile"
            @click="handleAnalyze"
          >
            <Sparkles class="w-4 h-4" />
            <span>{{ analyzing ? 'Menganalisis Ritme FFmpeg...' : 'Analisis & Ekstrak Ritme' }}</span>
          </button>
        </section>

        <!-- KOLOM KANAN: Daftar Profil Ritme Tersimpan -->
        <section class="lg:col-span-7 space-y-4 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <h2 class="studio-heading text-base font-bold inline-flex items-center gap-1.5">
              <Activity class="w-4 h-4" />
              <span>Pustaka Profil Ritme Tersimpan ({{ profiles.length }})</span>
            </h2>
            <NuxtLink to="/campaigns" class="text-xs font-semibold hover:underline" style="color: var(--accent-bg);">
              Terapkan di Studio Campaign ->
            </NuxtLink>
          </div>

          <div v-if="loading && profiles.length === 0" class="studio-card p-6 text-center text-sm studio-muted">
            Memuat daftar profil ritme referensi...
          </div>

          <div v-else-if="profiles.length === 0" class="studio-card p-6 text-center space-y-2">
            <p class="studio-heading font-bold text-base">Belum Ada Profil Ritme Referensi</p>
            <p class="text-xs studio-muted max-w-md mx-auto">
              Unggah 1 video pendek viral referensi di sebelah kiri untuk mengekstrak pola ritme potongannya dan menggunakannya berulang kali pada campaign mana pun.
            </p>
          </div>

          <div v-else class="space-y-4">
            <article
              v-for="item in profiles"
              :key="item.id"
              class="studio-card p-4 md:p-5 space-y-3"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="space-y-0.5 min-w-0">
                  <h3 class="studio-heading text-base font-bold break-words">{{ item.name }}</h3>
                  <p class="text-xs studio-muted break-words">
                    Sumber analisis: {{ item.sourceFilename }} ({{ item.durationSec.toFixed(1) }}s)
                  </p>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <span
                    class="px-2.5 py-1 rounded font-mono text-xs font-bold inline-flex items-center gap-1"
                    style="background: var(--accent-soft-bg); color: var(--accent-soft-fg);"
                  >
                    <Music2 class="w-3.5 h-3.5" />
                    <span>{{ item.estimatedBpm }} BPM</span>
                  </span>

                  <button
                    type="button"
                    class="studio-btn-secondary !min-h-[38px] !px-2.5 text-xs"
                    :disabled="deletingId === item.id"
                    :aria-label="`Hapus ${item.name}`"
                    @click="handleDelete(item.id)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Metrik Telemetri Pacing -->
              <div class="flex flex-wrap gap-2 font-mono text-[11px]">
                <span class="px-2 py-1 rounded inline-flex items-center gap-1" style="background: var(--bg-elevated);">
                  <Scissors class="w-3 h-3" />
                  <span>{{ item.shotCount }} shot ({{ item.cutsPerMinute }} cut/mnt)</span>
                </span>
                <span class="px-2 py-1 rounded inline-flex items-center gap-1" style="background: var(--bg-elevated);">
                  <Clock class="w-3 h-3" />
                  <span>Rata-rata {{ item.avgShotDurationSec.toFixed(2) }}s/shot</span>
                </span>
                <span class="px-2 py-1 rounded font-sans font-semibold studio-badge-ok">
                  {{ energyLabel(item.energyCurve) }}
                </span>
              </div>

              <!-- Visualisasi Garis Ritme Shot -->
              <div v-if="item.blueprint?.shots?.length" class="space-y-1.5">
                <div class="flex items-center justify-between text-[11px] studio-muted">
                  <span>Visualisasi Pola Potongan Shot</span>
                  <span>Hook | Body | Climax | Outro</span>
                </div>
                <div
                  class="w-full h-5 rounded overflow-hidden flex gap-[2px] p-[2px]"
                  :style="{
                    background: 'var(--bg-elevated)',
                    border: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)'
                  }"
                >
                  <div
                    v-for="shot in item.blueprint.shots"
                    :key="shot.index"
                    class="h-full rounded-[2px] transition-all"
                    :style="{
                      width: `${shotWidthPct(shot, item.durationSec)}%`,
                      backgroundColor: shotRoleColor(shot.role)
                    }"
                    :title="`Shot #${shot.index} (${shot.role}): ${shot.durationSec.toFixed(2)}s | Zoom ${shot.suggestedZoom}x`"
                  />
                </div>
              </div>

              <p v-if="item.blueprint?.styleSummary" class="text-xs studio-muted leading-relaxed">
                {{ item.blueprint.styleSummary }}
              </p>
            </article>
          </div>
        </section>
      </div>
    </div>
  </StudioShell>
</template>
