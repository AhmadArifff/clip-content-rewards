<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  CRITIC_COMBO_PRESETS,
  CRITIC_ROLE_CATALOG,
  type CriticReviewResult,
  type CriticRoleId
} from '@clip/shared';
import {
  Sparkles,
  Scale,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Wand2
} from 'lucide-vue-next';
import { apiRequest } from '~/composables/useApi';

const props = defineProps<{
  clipId: string;
  versionId: string;
}>();

const emit = defineEmits<{
  (e: 'apply-prompt', payload: { prompt: string; presetCodes: string[] }): void;
  (e: 'seek', sec: number): void;
}>();

const selectedRoles = ref<CriticRoleId[]>(['target_matrix', 'roger_ebert', 'pauline_kael']);
const focusNote = ref('');
const reviewing = ref(false);
const reviewError = ref('');
const result = ref<CriticReviewResult | null>(null);

const groupedRoles = computed(() => {
  const map = new Map<string, typeof CRITIC_ROLE_CATALOG[number][]>();
  for (const r of CRITIC_ROLE_CATALOG) {
    const list = map.get(r.clusterLabel) ?? [];
    list.push(r);
    map.set(r.clusterLabel, list);
  }
  return Array.from(map.entries()).map(([clusterLabel, items]) => ({ clusterLabel, items }));
});

function toggleRole(id: CriticRoleId) {
  const idx = selectedRoles.value.indexOf(id);
  if (idx >= 0) {
    if (selectedRoles.value.length > 1) {
      selectedRoles.value.splice(idx, 1);
    }
    return;
  }
  if (selectedRoles.value.length >= 3) {
    selectedRoles.value = [...selectedRoles.value.slice(1), id];
    return;
  }
  selectedRoles.value = [...selectedRoles.value, id];
}

function applyCombo(roleIds: CriticRoleId[]) {
  selectedRoles.value = [...roleIds];
}

function formatSec(sec: number | undefined): string {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return '00:00';
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function handleRunCriticReview() {
  if (selectedRoles.value.length === 0) return;
  reviewing.value = true;
  reviewError.value = '';
  try {
    const res = await apiRequest<CriticReviewResult>(`/api/clips/${props.clipId}/critic-review`, {
      method: 'POST',
      body: JSON.stringify({
        versionId: props.versionId,
        roleIds: selectedRoles.value,
        focusNote: focusNote.value.trim()
      })
    });
    result.value = res.data;
  } catch (err) {
    reviewError.value = err instanceof Error ? err.message : 'Gagal menjalankan bedah Dewan Kritikus.';
  } finally {
    reviewing.value = false;
  }
}

function applySolutionToEditor() {
  if (!result.value) return;
  emit('apply-prompt', {
    prompt: result.value.suggestedPrompt,
    presetCodes: result.value.recommendedPresetCodes
  });
}
</script>

<template>
  <section class="studio-card p-5 space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="space-y-1">
        <h2 class="studio-heading text-base font-bold inline-flex items-center gap-1.5">
          <Scale class="w-4 h-4" style="color: var(--accent-bg);" />
          <span>Dewan Kritikus AI &amp; Solusi Anti-Slop (Pilih 1-3 Role)</span>
        </h2>
        <p class="text-xs studio-muted leading-relaxed">
          Gabungkan hingga 3 sudut pandang (Umum, Matriks Target Audiens, dan Kritikus Film legendaris) untuk menemukan kelemahan klip dan menyusun prompt perbaikan yang 100% bisa dieksekusi mesin FFmpeg.
        </p>
      </div>
      <span class="px-2 py-0.5 rounded font-mono text-[11px] font-bold studio-badge-ok">
        {{ selectedRoles.length }}/3 Role Aktif
      </span>
    </div>

    <!-- Preset Kombinasi Dua Kutub Cepat -->
    <div class="space-y-1.5">
      <div class="text-[11px] font-bold studio-muted uppercase tracking-wide">Kombinasi Cepat (Dual-Pole)</div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="combo in CRITIC_COMBO_PRESETS"
          :key="combo.id"
          type="button"
          class="px-2.5 py-1.5 rounded text-[11px] font-semibold min-h-[34px] transition"
          style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
          @click="applyCombo(combo.roleIds)"
        >
          {{ combo.label }}
        </button>
      </div>
    </div>

    <!-- Pemilih 9 Role Kritikus Berkelompok -->
    <div class="space-y-2.5">
      <div v-for="group in groupedRoles" :key="group.clusterLabel" class="space-y-1.5">
        <div class="text-[11px] font-bold">{{ group.clusterLabel }}</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <button
            v-for="role in group.items"
            :key="role.id"
            type="button"
            class="p-2.5 rounded text-left transition space-y-0.5"
            :aria-pressed="selectedRoles.includes(role.id)"
            :style="
              selectedRoles.includes(role.id)
                ? { background: 'var(--accent-soft-bg)', border: '1.5px solid var(--accent-bg)' }
                : { background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }
            "
            @click="toggleRole(role.id)"
          >
            <div class="flex items-center justify-between gap-1.5 text-xs font-bold">
              <span>{{ role.name }}</span>
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0"
                :style="
                  selectedRoles.includes(role.id)
                    ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)' }
                    : { background: 'var(--bg-surface)' }
                "
              >
                {{ role.styleTag }}
              </span>
            </div>
            <p class="text-[11px] studio-muted leading-snug">{{ role.focusSummary }}</p>
          </button>
        </div>
      </div>
    </div>

    <!-- Fokus Pertanyaan Tambahan + Tombol Jalankan -->
    <div class="flex flex-col sm:flex-row gap-2">
      <input
        v-model="focusNote"
        type="text"
        maxlength="360"
        class="studio-input text-xs flex-1"
        placeholder="Fokus khusus (opsional), mis: Cek 3 detik awal apakah membosankan dan apakah warna sudah cocok?"
      />
      <button
        type="button"
        class="studio-btn-primary text-xs shrink-0"
        :disabled="reviewing || selectedRoles.length === 0"
        @click="handleRunCriticReview"
      >
        <Sparkles class="w-4 h-4" />
        <span>{{ reviewing ? 'Membedah Klip...' : 'Minta Kritik & Solusi AI' }}</span>
      </button>
    </div>

    <div v-if="reviewError" class="p-3 rounded text-xs font-semibold studio-badge-err">{{ reviewError }}</div>

    <!-- Hasil Bedah Dewan Kritikus -->
    <div v-if="result" class="space-y-3 pt-2" style="border-top: 1px solid var(--border-color);">
      <div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span
          class="px-2 py-0.5 rounded font-bold"
          :class="result.mode === 'local_deterministic' ? 'studio-badge-warn' : 'studio-badge-ok'"
        >
          {{
            result.mode === 'ai_vision'
              ? `Vision AI (${result.usedModel ?? 'Gemini'})`
              : result.mode === 'ai_text'
                ? `AI Critic (${result.usedModel ?? 'BYOK'})`
                : 'Mode Analisis Deterministik Lokal'
          }}
        </span>
        <span class="studio-muted">{{ result.groundingNote }}</span>
      </div>

      <!-- Perspektif Per Kritikus -->
      <div class="space-y-2.5">
        <article
          v-for="persp in result.perspectives"
          :key="persp.roleId"
          class="p-3.5 rounded space-y-2 text-xs"
          style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
        >
          <div class="flex flex-wrap items-center justify-between gap-1.5">
            <span class="font-extrabold">{{ persp.roleName }}</span>
          </div>
          <p class="font-semibold">{{ persp.verdictHeadline }}</p>

          <div class="p-2 rounded text-[11px] leading-relaxed studio-badge-ok">
            <strong>Pertahankan (Sudah Bekerja):</strong> {{ persp.whatWorks }}
          </div>

          <div class="space-y-1.5">
            <div
              v-for="(w, wIdx) in persp.weaknesses"
              :key="wIdx"
              class="p-2.5 rounded space-y-1 text-[11px]"
              style="background: var(--bg-surface); border: 1px solid var(--border-color);"
            >
              <div class="flex flex-wrap items-center gap-1.5 font-mono font-bold">
                <AlertTriangle class="w-3.5 h-3.5 shrink-0" style="color: var(--status-warn-fg);" />
                <span v-if="w.segmentRef">{{ w.segmentRef }}</span>
                <button
                  v-if="typeof w.timestampSec === 'number'"
                  type="button"
                  class="px-1.5 py-0.5 rounded inline-flex items-center gap-1 hover:underline"
                  style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
                  @click="emit('seek', w.timestampSec)"
                >
                  <PlayCircle class="w-3 h-3" />
                  <span>{{ formatSec(w.timestampSec) }}</span>
                </button>
              </div>
              <p class="leading-relaxed"><strong>Kelemahan:</strong> {{ w.issue }}</p>
              <p class="leading-relaxed studio-muted"><strong>Solusi Eksekusi:</strong> {{ w.executableFix }}</p>
            </div>
          </div>
        </article>
      </div>

      <!-- Sintesis Gabungan + Tombol 1-Klik Terapkan -->
      <div
        class="p-3.5 rounded space-y-2.5 text-xs"
        style="background: var(--accent-soft-bg); border: 1.5px solid var(--accent-bg);"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-extrabold inline-flex items-center gap-1.5">
            <CheckCircle2 class="w-4 h-4" />
            <span>Sintesis Gabungan &amp; Solusi Siap Eksekusi</span>
          </span>
          <button
            type="button"
            class="studio-btn-primary text-xs !min-h-[36px] !px-3"
            @click="applySolutionToEditor"
          >
            <Wand2 class="w-3.5 h-3.5" />
            <span>Terapkan Solusi ke Kotak Prompt</span>
          </button>
        </div>

        <p class="leading-relaxed">{{ result.combinedSynthesis }}</p>

        <ul class="list-disc pl-5 space-y-1 text-[11px]">
          <li v-for="(sol, sIdx) in result.executableSolutions" :key="sIdx">{{ sol }}</li>
        </ul>

        <p class="text-[11px] font-mono p-2 rounded break-words" style="background: var(--bg-surface);">
          <strong>Draft Prompt Terverifikasi:</strong> {{ result.suggestedPrompt }}
        </p>
      </div>
    </div>
  </section>
</template>
