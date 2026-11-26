<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { PlatformTarget } from '@clip/shared';
import { Plus, ArrowRight, Trash2, FileText, Film, CheckCircle2, Clock } from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import { apiRequest } from '~/composables/useApi';
import { useThemeCopy } from '~/composables/useThemeCopy';
import { useThemeStore } from '~/stores/theme';

interface CampaignSummary {
  id: string;
  title: string;
  brandOwner: string;
  platformTargets: PlatformTarget[];
  rewardNotes: string;
  deadlineAt: string | null;
  status: string;
  briefSummary: { id: string; sourceType: string; originalFilename: string | null; confirmedByUser: boolean } | null;
  counts: { mediaAssets: number; batches: number };
  updatedAt: string;
}

const router = useRouter();
const copy = useThemeCopy();
const themeStore = useThemeStore();

const campaigns = ref<CampaignSummary[]>([]);
const loading = ref(false);
const showCreateForm = ref(false);
const notice = ref<{ type: 'ok' | 'err'; text: string } | null>(null);

const title = ref('');
const brandOwner = ref('');
const rewardNotes = ref('');
const selectedPlatforms = ref<PlatformTarget[]>(['tiktok', 'youtube_shorts']);
const submitting = ref(false);

const platformLabels: Record<PlatformTarget, string> = {
  tiktok: 'TikTok 9:16',
  youtube_shorts: 'YouTube Shorts',
  youtube_long: 'YouTube 16:9'
};

function togglePlatform(p: PlatformTarget) {
  if (selectedPlatforms.value.includes(p)) {
    if (selectedPlatforms.value.length > 1) {
      selectedPlatforms.value = selectedPlatforms.value.filter((x) => x !== p);
    }
  } else {
    selectedPlatforms.value = [...selectedPlatforms.value, p];
  }
}

async function fetchCampaigns() {
  loading.value = true;
  try {
    const res = await apiRequest<CampaignSummary[]>('/api/campaigns');
    campaigns.value = res.data ?? [];
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal memuat daftar campaign.' };
  } finally {
    loading.value = false;
  }
}

async function handleCreateCampaign() {
  submitting.value = true;
  notice.value = null;
  try {
    const res = await apiRequest<CampaignSummary>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        title: title.value,
        brandOwner: brandOwner.value,
        platformTargets: selectedPlatforms.value,
        rewardNotes: rewardNotes.value
      })
    });
    title.value = '';
    brandOwner.value = '';
    rewardNotes.value = '';
    showCreateForm.value = false;
    if (res.data?.id) {
      await router.push(`/campaigns/${res.data.id}/studio`);
      return;
    }
    await fetchCampaigns();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal membuat campaign baru.' };
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(id: string) {
  try {
    await apiRequest(`/api/campaigns/${id}`, { method: 'DELETE' });
    notice.value = { type: 'ok', text: 'Campaign dan berkas unggahan lokalnya berhasil dihapus.' };
    await fetchCampaigns();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal menghapus campaign.' };
  }
}

onMounted(fetchCampaigns);
</script>

<template>
  <StudioShell>
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <h1 class="studio-heading text-2xl md:text-3xl font-bold">{{ copy.campaignsTitle }}</h1>
          <p class="studio-muted text-sm md:text-base">{{ copy.campaignsSubtitle }}</p>
        </div>
        <button type="button" class="studio-btn-primary" @click="showCreateForm = !showCreateForm">
          <Plus class="w-4 h-4" />
          <span>{{ showCreateForm ? 'Tutup Form' : 'Buat Campaign Baru' }}</span>
        </button>
      </div>

      <div
        v-if="notice"
        class="p-3.5 rounded text-sm font-medium"
        :class="notice.type === 'ok' ? 'studio-badge-ok' : 'studio-badge-err'"
      >
        {{ notice.text }}
      </div>

      <!-- Form Buat Campaign Baru -->
      <form
        v-if="showCreateForm"
        class="studio-card p-5 md:p-6 space-y-4"
        @submit.prevent="handleCreateCampaign"
      >
        <h2 class="studio-heading text-lg font-bold">Buat Sesi Campaign Content Rewards</h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1">
            <label for="camp-title" class="block text-xs font-semibold">Nama Campaign</label>
            <input
              id="camp-title"
              v-model="title"
              type="text"
              required
              minlength="2"
              placeholder="Contoh: Brand X - Clipping Promo Akhir Tahun"
              class="studio-input"
            />
          </div>
          <div class="space-y-1">
            <label for="camp-brand" class="block text-xs font-semibold">Pemilik Campaign / Brand</label>
            <input
              id="camp-brand"
              v-model="brandOwner"
              type="text"
              placeholder="Contoh: Brand X Official"
              class="studio-input"
            />
          </div>
        </div>

        <div class="space-y-1.5">
          <span class="block text-xs font-semibold">Target Platform</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in (['tiktok', 'youtube_shorts', 'youtube_long'] as PlatformTarget[])"
              :key="p"
              type="button"
              class="studio-btn-secondary text-xs"
              :style="
                selectedPlatforms.includes(p)
                  ? { backgroundColor: 'var(--accent-bg)', color: 'var(--accent-fg)' }
                  : {}
              "
              @click="togglePlatform(p)"
            >
              {{ platformLabels[p] }}
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <label for="camp-reward" class="block text-xs font-semibold">Catatan Reward / CPM (Opsional)</label>
          <input
            id="camp-reward"
            v-model="rewardNotes"
            type="text"
            placeholder="Contoh: $1.5 per 1k views, minimal 10k views payout"
            class="studio-input"
          />
        </div>

        <div class="flex flex-wrap gap-3 pt-1">
          <button type="submit" class="studio-btn-primary" :disabled="submitting">
            <span>{{ submitting ? 'Membuat...' : 'Simpan & Buka Studio' }}</span>
            <ArrowRight class="w-4 h-4" />
          </button>
          <button type="button" class="studio-btn-secondary" @click="showCreateForm = false">
            Batal
          </button>
        </div>
      </form>

      <!-- State Loading / Kosong / Daftar Campaign -->
      <div v-if="loading && campaigns.length === 0" class="text-sm studio-muted py-8">
        Memuat daftar campaign...
      </div>

      <section v-else-if="campaigns.length === 0" class="studio-card p-6 md:p-8 space-y-4">
        <h2 class="studio-heading text-xl font-bold">{{ copy.campaignsEmptyTitle }}</h2>
        <p class="studio-muted text-sm max-w-2xl leading-relaxed">
          Mulai dengan membuat campaign baru, lalu unggah file brief (.pdf / .docx / .doc) dan video mentah dari pemilik Content Rewards.
        </p>
        <button type="button" class="studio-btn-primary" @click="showCreateForm = true">
          <Plus class="w-4 h-4" />
          <span>Buat Campaign Pertama</span>
        </button>
      </section>

      <div
        v-else
        :class="
          themeStore.current === 'daylight-editorial'
            ? 'divide-y border-t'
            : 'grid grid-cols-1 md:grid-cols-2 gap-4'
        "
        style="border-color: var(--border-color);"
      >
        <article
          v-for="camp in campaigns"
          :key="camp.id"
          :class="
            themeStore.current === 'daylight-editorial'
              ? 'py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4'
              : 'studio-card p-5 flex flex-col justify-between gap-4'
          "
        >
          <div class="space-y-2.5 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="studio-heading text-lg font-bold truncate">{{ camp.title }}</h2>
              <span
                class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded whitespace-nowrap"
                :class="camp.briefSummary?.confirmedByUser ? 'studio-badge-ok' : 'studio-badge-warn'"
              >
                <CheckCircle2 v-if="camp.briefSummary?.confirmedByUser" class="w-3 h-3" />
                <Clock v-else class="w-3 h-3" />
                <span>{{ camp.briefSummary?.confirmedByUser ? 'Brief Terkonfirmasi' : 'Draft Setup' }}</span>
              </span>
            </div>

            <p v-if="camp.brandOwner || camp.rewardNotes" class="text-xs studio-muted">
              {{ [camp.brandOwner, camp.rewardNotes].filter(Boolean).join(' | ') }}
            </p>

            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span
                v-for="p in camp.platformTargets"
                :key="p"
                class="px-2 py-0.5 rounded font-mono text-[11px]"
                style="background: var(--accent-soft-bg); color: var(--accent-soft-fg);"
              >
                {{ platformLabels[p] || p }}
              </span>
              <span class="inline-flex items-center gap-1 studio-muted">
                <FileText class="w-3.5 h-3.5" />
                <span>{{ camp.briefSummary ? 'Brief Ada' : 'Belum Ada Brief' }}</span>
              </span>
              <span class="inline-flex items-center gap-1 studio-muted">
                <Film class="w-3.5 h-3.5" />
                <span>{{ camp.counts.mediaAssets }} Media</span>
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 flex-wrap">
            <NuxtLink :to="`/campaigns/${camp.id}/studio`" class="studio-btn-primary">
              <span>Buka Studio</span>
              <ArrowRight class="w-4 h-4" />
            </NuxtLink>
            <button
              type="button"
              class="studio-btn-secondary"
              aria-label="Hapus campaign"
              @click="handleDelete(camp.id)"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </article>
      </div>
    </div>
  </StudioShell>
</template>
