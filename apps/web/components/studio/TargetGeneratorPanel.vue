<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { TargetConfig } from '@clip/shared';
import { Sparkles, Calculator, BookmarkPlus, Play } from 'lucide-vue-next';
import { apiRequest } from '~/composables/useApi';

interface MasterPresetRow {
  id: string;
  category: string;
  code: string;
  labelId: string;
  config: Record<string, unknown>;
}

interface TargetProfileRow {
  id: string;
  profileName: string;
  description: string | null;
  targetConfig: TargetConfig;
}

interface ReferencePacingRow {
  id: string;
  name: string;
  shotCount: number;
  avgShotDurationSec: number;
  cutsPerMinute: number;
  estimatedBpm: number;
}

interface BrandKitOption {
  id: string;
  name: string;
  primaryColorHex: string;
  accentColorHex: string;
  captionFontFamily: string;
  defaultCaptionStyle: 'hormozi_bold' | 'clean_minimal' | 'bilingual' | 'off';
  hasLogo: boolean;
}

interface EstimateResult {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedRenderSeconds: number;
  hasActiveBrainKey: boolean;
  activeBrainProvider: string | null;
}

const props = defineProps<{
  campaignId: string;
  hasRawVideo: boolean;
  watermarks: Array<{ id: string; originalFilename: string }>;
}>();

const router = useRouter();

const presets = ref<MasterPresetRow[]>([]);
const profiles = ref<TargetProfileRow[]>([]);
const pacingProfiles = ref<ReferencePacingRow[]>([]);
const brandKits = ref<BrandKitOption[]>([]);
const selectedProfileId = ref('');
const newProfileName = ref('');
const savingProfile = ref(false);

const estimating = ref(false);
const estimate = ref<EstimateResult | null>(null);
const startingBatch = ref(false);
const errorMsg = ref('');
const infoMsg = ref('');

const config = ref<TargetConfig>({
  platform: 'tiktok',
  countryCode: 'ID',
  languageStyle: 'Bahasa Indonesia Santai',
  ageGroup: '18-24',
  genderFocus: 'all',
  personaNiche: 'Kreator & Pekerja Muda',
  controversyLevel: 'hot_take',
  hookType: 'curiosity_gap',
  emotionalTrigger: 'FOMO / Rasa Penasaran',
  primaryKpi: 'watch_time',
  editingStyle: 'fast_cut_retention',
  framingMode: 'fit_blur_bg',
  captionStyle: 'hormozi_bold',
  initialAudioMode: 'ducking_20',
  batchDiversityMode: 'distinct_moments',
  batchCount: 3,
  referencePacingId: null,
  brandKitId: null,
  supportingAssets: {
    watermarkAssetId: null,
    outroAssetId: null
  }
});

const byCat = (cat: string) => computed(() => presets.value.filter((p) => p.category === cat));
const countries = byCat('country');
const ageGroups = byCat('age_group');
const editingStyles = byCat('editing_style');
const hookTypes = byCat('hook_type');
const controversyLevels = byCat('controversy_level');
const framingModes = byCat('framing_mode');

const watermarkAssetId = computed({
  get: () => config.value.supportingAssets?.watermarkAssetId ?? '',
  set: (val: string) => {
    config.value.supportingAssets = {
      ...(config.value.supportingAssets ?? {}),
      watermarkAssetId: val || null
    };
  }
});

const referencePacingId = computed({
  get: () => config.value.referencePacingId ?? '',
  set: (val: string) => {
    config.value.referencePacingId = val || null;
  }
});

const brandKitId = computed({
  get: () => config.value.brandKitId ?? '',
  set: (val: string) => {
    config.value.brandKitId = val || null;
    const found = brandKits.value.find((k) => k.id === val);
    if (found) {
      config.value.captionStyle = found.defaultCaptionStyle;
    }
  }
});

async function loadPresetsAndProfiles() {
  try {
    const [pRes, profRes, pacingRes, kitsRes] = await Promise.all([
      apiRequest<MasterPresetRow[]>('/api/presets?active=true'),
      apiRequest<TargetProfileRow[]>('/api/target-profiles'),
      apiRequest<ReferencePacingRow[]>('/api/pacing-profiles'),
      apiRequest<BrandKitOption[]>('/api/brand-kits')
    ]);
    presets.value = pRes.data ?? [];
    profiles.value = profRes.data ?? [];
    pacingProfiles.value = pacingRes.data ?? [];
    brandKits.value = kitsRes.data ?? [];
  } catch {
    // Tetap gunakan default aman
  }
}

function applySelectedProfile() {
  const found = profiles.value.find((p) => p.id === selectedProfileId.value);
  if (found) {
    config.value = {
      ...found.targetConfig,
      supportingAssets: config.value.supportingAssets
    };
    infoMsg.value = `Profil "${found.profileName}" dimuat ke formulir.`;
  }
}

async function handleSaveProfile() {
  if (!newProfileName.value.trim()) return;
  savingProfile.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<TargetProfileRow>('/api/target-profiles', {
      method: 'POST',
      body: JSON.stringify({
        profileName: newProfileName.value.trim(),
        description: `${config.value.countryCode} | ${config.value.ageGroup} | ${config.value.controversyLevel}`,
        targetConfig: config.value,
        isDefault: false
      })
    });
    newProfileName.value = '';
    infoMsg.value = `Profil target "${res.data?.profileName}" tersimpan untuk campaign selanjutnya.`;
    await loadPresetsAndProfiles();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menyimpan profil target.';
  } finally {
    savingProfile.value = false;
  }
}

async function handleEstimate() {
  estimating.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<EstimateResult>(`/api/campaigns/${props.campaignId}/batches/estimate`, {
      method: 'POST',
      body: JSON.stringify({ targetConfig: config.value })
    });
    estimate.value = res.data;
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menghitung estimasi.';
  } finally {
    estimating.value = false;
  }
}

async function handleStartGenerate() {
  startingBatch.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<{ id: string }>(`/api/campaigns/${props.campaignId}/batches`, {
      method: 'POST',
      body: JSON.stringify({
        targetConfig: config.value,
        targetProfileId: selectedProfileId.value || null
      })
    });
    if (res.data?.id) {
      await router.push(`/campaigns/${props.campaignId}/batches/${res.data.id}`);
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memulai batch generate.';
  } finally {
    startingBatch.value = false;
  }
}

onMounted(loadPresetsAndProfiles);
</script>

<template>
  <section class="studio-card p-5 md:p-6 space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <Sparkles class="w-5 h-5" style="color: var(--accent-bg);" />
          <h2 class="studio-heading text-lg md:text-xl font-bold">
            3. Matriks Target Audiens & Generator Multi-Varian
          </h2>
        </div>
        <p class="text-xs studio-muted mt-0.5">
          Atur target negara, usia, personalisasi, kontroversi, framing 9:16, dan mode audio untuk mencetak banyak variasi sekaligus.
        </p>
      </div>

      <!-- Muat / Simpan Profil Target Reusable -->
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="selectedProfileId"
          aria-label="Muat profil target tersimpan"
          class="studio-input text-xs w-48"
          @change="applySelectedProfile"
        >
          <option value="">Muat Profil Target...</option>
          <option v-for="prof in profiles" :key="prof.id" :value="prof.id">
            {{ prof.profileName }}
          </option>
        </select>
        <input
          v-model="newProfileName"
          type="text"
          placeholder="Nama profil baru..."
          class="studio-input text-xs w-40"
        />
        <button
          type="button"
          class="studio-btn-secondary text-xs"
          :disabled="savingProfile || !newProfileName.trim()"
          @click="handleSaveProfile"
        >
          <BookmarkPlus class="w-4 h-4" />
          <span>Simpan Profil</span>
        </button>
      </div>
    </div>

    <div v-if="errorMsg" class="p-3 rounded text-xs font-semibold studio-badge-err">{{ errorMsg }}</div>
    <div v-if="infoMsg" class="p-3 rounded text-xs font-semibold studio-badge-ok">{{ infoMsg }}</div>

    <!-- Grid Parameter Targeting Lengkap -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      <div class="space-y-1">
        <label for="tg-platform" class="block text-xs font-semibold">Platform & Rasio</label>
        <select id="tg-platform" v-model="config.platform" class="studio-input text-xs">
          <option value="tiktok">TikTok (9:16 Vertikal)</option>
          <option value="youtube_shorts">YouTube Shorts (9:16)</option>
          <option value="youtube_long">YouTube Standard (16:9)</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-country" class="block text-xs font-semibold">Country / Wilayah Target</label>
        <select id="tg-country" v-model="config.countryCode" class="studio-input text-xs">
          <option v-for="c in countries" :key="c.code" :value="c.code">{{ c.labelId }}</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-age" class="block text-xs font-semibold">Rentang Usia Audiens</label>
        <select id="tg-age" v-model="config.ageGroup" class="studio-input text-xs">
          <option v-for="a in ageGroups" :key="a.code" :value="a.code">{{ a.labelId }}</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-lang" class="block text-xs font-semibold">Bahasa & Gaya Bahasa</label>
        <input id="tg-lang" v-model="config.languageStyle" type="text" class="studio-input text-xs" />
      </div>

      <div class="space-y-1">
        <label for="tg-persona" class="block text-xs font-semibold">Personalisasi / Niche Audiens</label>
        <input id="tg-persona" v-model="config.personaNiche" type="text" class="studio-input text-xs" />
      </div>

      <div class="space-y-1">
        <label for="tg-controversy" class="block text-xs font-semibold">Tingkat Kontroversi</label>
        <select id="tg-controversy" v-model="config.controversyLevel" class="studio-input text-xs">
          <option v-for="c in controversyLevels" :key="c.code" :value="c.code">{{ c.labelId }}</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-hook" class="block text-xs font-semibold">Tipe Hook 3 Detik Pertama</label>
        <select id="tg-hook" v-model="config.hookType" class="studio-input text-xs">
          <option v-for="h in hookTypes" :key="h.code" :value="h.code">{{ h.labelId }}</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-kpi" class="block text-xs font-semibold">Tujuan Interaksi (KPI)</label>
        <select id="tg-kpi" v-model="config.primaryKpi" class="studio-input text-xs">
          <option value="watch_time">Maksimalkan Watch-Time / Loop</option>
          <option value="comments">Pancing Komentar & Diskusi</option>
          <option value="shares">Maksimalkan Share & Save</option>
          <option value="clicks">Arahkan Klik Link / Konversi</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-style" class="block text-xs font-semibold">Gaya Editing & Pacing</label>
        <select id="tg-style" v-model="config.editingStyle" class="studio-input text-xs">
          <option v-for="s in editingStyles" :key="s.code" :value="s.code">{{ s.labelId }}</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-framing" class="block text-xs font-semibold">Mode Framing 16:9 -> 9:16</label>
        <select id="tg-framing" v-model="config.framingMode" class="studio-input text-xs">
          <option v-for="f in framingModes" :key="f.code" :value="f.code">{{ f.labelId }}</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-caption" class="block text-xs font-semibold">Gaya Subtitle Safe-Zone</label>
        <select id="tg-caption" v-model="config.captionStyle" class="studio-input text-xs">
          <option value="hormozi_bold">Hormozi Bold (Tebal & Mencolok)</option>
          <option value="clean_minimal">Clean Minimalist (Bersih)</option>
          <option value="bilingual">Bilingual Subtitle</option>
          <option value="off">Tanpa Subtitle</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-audio" class="block text-xs font-semibold">Mode Audio Awal</label>
        <select id="tg-audio" v-model="config.initialAudioMode" class="studio-input text-xs">
          <option value="original_normalized">Original 100% (-14 LUFS)</option>
          <option value="ducking_20">Ducking 20% (Untuk Sound TikTok/YT)</option>
          <option value="mute_for_platform_sound">Mute Total 0% (Full Trending Sound)</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-diversity" class="block text-xs font-semibold">Mode Diversifikasi Batch</label>
        <select id="tg-diversity" v-model="config.batchDiversityMode" class="studio-input text-xs">
          <option value="distinct_moments">Momen Berbeda (Anti-Duplikat)</option>
          <option value="ab_hook_test">A/B Test Hook (Momen Inti Sama)</option>
        </select>
      </div>

      <div class="space-y-1">
        <label for="tg-count" class="block text-xs font-semibold">Jumlah Variasi (1-10)</label>
        <input id="tg-count" v-model.number="config.batchCount" type="number" min="1" max="10" class="studio-input text-xs font-mono" />
      </div>

      <div class="space-y-1">
        <label for="tg-emotion" class="block text-xs font-semibold">Pemicu Emosi Utama</label>
        <input id="tg-emotion" v-model="config.emotionalTrigger" type="text" class="studio-input text-xs" />
      </div>

      <div class="space-y-1">
        <label for="tg-wm" class="block text-xs font-semibold">Tempel Watermark Campaign</label>
        <select id="tg-wm" v-model="watermarkAssetId" class="studio-input text-xs">
          <option value="">Tanpa Watermark</option>
          <option v-for="w in watermarks" :key="w.id" :value="w.id">{{ w.originalFilename }}</option>
        </select>
      </div>

      <div class="space-y-1 sm:col-span-2 lg:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label for="tg-pacing" class="block text-xs font-semibold">
            Kloning Ritme Video Referensi (Opsional)
          </label>
          <NuxtLink to="/pacing" class="text-[11px] font-semibold hover:underline" style="color: var(--accent-bg);">
            Kelola Ritme ->
          </NuxtLink>
        </div>
        <select id="tg-pacing" v-model="referencePacingId" class="studio-input text-xs">
          <option value="">Default (Ikuti Gaya Editing Standar)</option>
          <option v-for="pp in pacingProfiles" :key="pp.id" :value="pp.id">
            {{ pp.name }} ({{ pp.shotCount }} shot | ~{{ pp.estimatedBpm }} BPM)
          </option>
        </select>
      </div>

      <div class="space-y-1 sm:col-span-2 lg:col-span-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label for="tg-brand-kit" class="block text-xs font-semibold">
            Brand Asset Kit (Warna, Logo, Font &amp; CTA)
          </label>
          <NuxtLink to="/brand-kits" class="text-[11px] font-semibold hover:underline" style="color: var(--accent-bg);">
            Kelola Brand Kit ->
          </NuxtLink>
        </div>
        <select id="tg-brand-kit" v-model="brandKitId" class="studio-input text-xs">
          <option value="">Default (Tanpa Brand Asset Kit)</option>
          <option v-for="bk in brandKits" :key="bk.id" :value="bk.id">
            {{ bk.name }} ({{ bk.primaryColorHex }} | {{ bk.captionFontFamily }}{{ bk.hasLogo ? ' + Logo' : '' }})
          </option>
        </select>
      </div>
    </div>

    <!-- Box Estimasi & Aksi Generate -->
    <div
      class="p-4 rounded flex flex-col md:flex-row md:items-center justify-between gap-4"
      style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color);"
    >
      <div class="text-xs space-y-1">
        <p v-if="estimate" class="font-mono font-semibold">
          Estimasi Token: ~{{ estimate.estimatedTotalTokens.toLocaleString('id-ID') }} token |
          Estimasi Render Lokal: ~{{ estimate.estimatedRenderSeconds }} detik
        </p>
        <p v-if="estimate" class="studio-muted">
          {{ estimate.hasActiveBrainKey ? `Otak AI Aktif: ${estimate.activeBrainProvider}` : 'Mode Perencana Lokal Aktif (gratis tanpa token, pasang kunci AI untuk rencana mendalam).' }}
        </p>
        <p v-else class="studio-muted">
          Klik Cek Estimasi untuk melihat perkiraan pemakaian token & waktu render lokal sebelum memulai.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2.5 shrink-0">
        <button
          type="button"
          class="studio-btn-secondary"
          :disabled="!hasRawVideo || estimating"
          @click="handleEstimate"
        >
          <Calculator class="w-4 h-4" />
          <span>{{ estimating ? 'Menghitung...' : 'Cek Estimasi' }}</span>
        </button>

        <button
          type="button"
          class="studio-btn-primary"
          :disabled="!hasRawVideo || startingBatch"
          @click="handleStartGenerate"
        >
          <Play class="w-4 h-4" />
          <span>{{ startingBatch ? 'Memulai Antrean...' : `Generate ${config.batchCount} Variasi` }}</span>
        </button>
      </div>
    </div>
  </section>
</template>
