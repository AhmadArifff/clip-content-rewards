<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { MasterPresetCategory } from '@clip/shared';
import { Plus, Trash2 } from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import { apiRequest } from '~/composables/useApi';
import { useThemeCopy } from '~/composables/useThemeCopy';

interface PresetItem {
  id: string;
  category: MasterPresetCategory;
  code: string;
  labelId: string;
  config: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
}

const copy = useThemeCopy();

const categories: Array<{ value: MasterPresetCategory | 'all'; label: string }> = [
  { value: 'all', label: 'Semua Kategori' },
  { value: 'prompt_preset', label: 'Preset Prompt Lapangan' },
  { value: 'country', label: 'Negara & Zona Waktu' },
  { value: 'age_group', label: 'Rentang Usia' },
  { value: 'editing_style', label: 'Gaya Editing' },
  { value: 'hook_type', label: 'Tipe Hook 3 Detik' },
  { value: 'controversy_level', label: 'Tingkat Kontroversi' },
  { value: 'framing_mode', label: 'Mode Framing 9:16' }
];

const presets = ref<PresetItem[]>([]);
const selectedCategory = ref<MasterPresetCategory | 'all'>('prompt_preset');
const loading = ref(false);
const notice = ref<{ type: 'ok' | 'err'; text: string } | null>(null);

const newCategory = ref<MasterPresetCategory>('prompt_preset');
const newCode = ref('');
const newLabelId = ref('');
const newPromptText = ref('');
const saving = ref(false);

const filteredPresets = computed(() => {
  if (selectedCategory.value === 'all') return presets.value;
  return presets.value.filter((p) => p.category === selectedCategory.value);
});

async function fetchPresets() {
  loading.value = true;
  try {
    const res = await apiRequest<PresetItem[]>('/api/presets');
    presets.value = res.data ?? [];
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal memuat preset.' };
  } finally {
    loading.value = false;
  }
}

async function handleCreatePreset() {
  saving.value = true;
  notice.value = null;
  try {
    const config = newCategory.value === 'prompt_preset' && newPromptText.value.trim()
      ? { group: 'custom', promptText: newPromptText.value.trim() }
      : {};
    await apiRequest('/api/presets', {
      method: 'POST',
      body: JSON.stringify({
        category: newCategory.value,
        code: newCode.value.trim().toLowerCase(),
        labelId: newLabelId.value.trim(),
        config,
        sortOrder: 100,
        isActive: true
      })
    });
    newCode.value = '';
    newLabelId.value = '';
    newPromptText.value = '';
    notice.value = { type: 'ok', text: 'Preset baru berhasil ditambahkan dan langsung siap dipakai di Studio.' };
    await fetchPresets();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal menambah preset.' };
  } finally {
    saving.value = false;
  }
}

async function togglePreset(item: PresetItem) {
  try {
    await apiRequest(`/api/presets/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !item.isActive })
    });
    await fetchPresets();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal mengubah status preset.' };
  }
}

async function deletePreset(id: string) {
  try {
    await apiRequest(`/api/presets/${id}`, { method: 'DELETE' });
    notice.value = { type: 'ok', text: 'Preset berhasil dihapus.' };
    await fetchPresets();
  } catch (err) {
    notice.value = { type: 'err', text: err instanceof Error ? err.message : 'Gagal menghapus preset.' };
  }
}

onMounted(fetchPresets);
</script>

<template>
  <StudioShell>
    <div class="space-y-6">
      <div class="space-y-1">
        <h1 class="studio-heading text-2xl md:text-3xl font-bold">{{ copy.presetsTitle }}</h1>
        <p class="studio-muted text-sm md:text-base">{{ copy.presetsSubtitle }}</p>
      </div>

      <div
        v-if="notice"
        class="p-3.5 rounded text-sm font-medium"
        :class="notice.type === 'ok' ? 'studio-badge-ok' : 'studio-badge-err'"
      >
        {{ notice.text }}
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="cat in categories"
          :key="cat.value"
          type="button"
          class="studio-btn-secondary text-xs"
          :style="
            selectedCategory === cat.value
              ? { backgroundColor: 'var(--accent-bg)', color: 'var(--accent-fg)' }
              : {}
          "
          @click="selectedCategory = cat.value"
        >
          {{ cat.label }}
        </button>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form class="lg:col-span-4 studio-card p-5 space-y-3.5" @submit.prevent="handleCreatePreset">
          <div class="flex items-center gap-2">
            <Plus class="w-4 h-4" style="color: var(--accent-bg);" />
            <h2 class="studio-heading text-lg font-bold">Tambah Preset Dinamis</h2>
          </div>

          <div class="space-y-1">
            <label for="preset-cat" class="block text-xs font-semibold">Kategori</label>
            <select id="preset-cat" v-model="newCategory" class="studio-input">
              <option value="prompt_preset">Preset Prompt Lapangan</option>
              <option value="country">Negara & Zona Waktu</option>
              <option value="age_group">Rentang Usia</option>
              <option value="editing_style">Gaya Editing</option>
              <option value="hook_type">Tipe Hook 3 Detik</option>
              <option value="controversy_level">Tingkat Kontroversi</option>
              <option value="framing_mode">Mode Framing 9:16</option>
            </select>
          </div>

          <div class="space-y-1">
            <label for="preset-code" class="block text-xs font-semibold">Kode Unik (Inggris/Slug)</label>
            <input
              id="preset-code"
              v-model="newCode"
              type="text"
              required
              placeholder="misal: duck_audio_10"
              class="studio-input font-mono text-xs"
            />
          </div>

          <div class="space-y-1">
            <label for="preset-label" class="block text-xs font-semibold">Label Tampilan (Bahasa Indonesia)</label>
            <input
              id="preset-label"
              v-model="newLabelId"
              type="text"
              required
              placeholder="Contoh: Kecilkan Suara Asli ke 10%"
              class="studio-input"
            />
          </div>

          <div v-if="newCategory === 'prompt_preset'" class="space-y-1">
            <label for="preset-prompt" class="block text-xs font-semibold">Instruksi Prompt Otomatis</label>
            <textarea
              id="preset-prompt"
              v-model="newPromptText"
              rows="3"
              placeholder="Tuliskan instruksi yang akan otomatis dikirim saat tombol preset ini diklik..."
              class="studio-input"
            />
          </div>

          <button type="submit" class="studio-btn-primary w-full" :disabled="saving">
            <span>{{ saving ? 'Menyimpan...' : 'Simpan Preset Baru' }}</span>
          </button>
        </form>

        <section class="lg:col-span-8 studio-card p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="studio-heading text-lg font-bold">Daftar Preset ({{ filteredPresets.length }})</h2>
            <span class="text-xs studio-muted">Tanpa hardcode, langsung aktif di generator</span>
          </div>

          <div v-if="loading && presets.length === 0" class="text-sm studio-muted py-6">Memuat preset...</div>

          <div v-else class="space-y-2.5">
            <article
              v-for="item in filteredPresets"
              :key="item.id"
              class="p-3.5 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color);"
            >
              <div class="space-y-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold text-sm">{{ item.labelId }}</span>
                  <span class="font-mono text-[11px] px-1.5 py-0.5 rounded studio-muted" style="background: var(--bg-surface);">
                    {{ item.code }}
                  </span>
                </div>
                <p v-if="typeof item.config.promptText === 'string'" class="text-xs studio-muted">
                  {{ item.config.promptText }}
                </p>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  class="studio-btn-secondary text-xs"
                  :class="item.isActive ? 'studio-badge-ok' : ''"
                  @click="togglePreset(item)"
                >
                  {{ item.isActive ? 'Aktif' : 'Nonaktif' }}
                </button>
                <button
                  type="button"
                  class="studio-btn-secondary"
                  aria-label="Hapus preset"
                  @click="deletePreset(item.id)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </StudioShell>
</template>
