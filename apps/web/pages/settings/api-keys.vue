<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { AiKeyRole, AiProvider } from '@clip/shared';
import { KeyRound, PlugZap, Trash2, CheckCircle2, XCircle, Plus, Pencil, Check, X } from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import DoctorPanel, { type DoctorReport } from '~/components/studio/DoctorPanel.vue';
import { apiRequest } from '~/composables/useApi';
import { useThemeCopy } from '~/composables/useThemeCopy';
import { useThemeStore } from '~/stores/theme';

interface MaskedApiKeyItem {
  id: string;
  provider: AiProvider;
  role: AiKeyRole;
  label: string;
  maskedPreview: string;
  defaultModel: string;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
}

type ProviderCatalog = Record<AiProvider, { role: AiKeyRole; models: string[] }>;

const copy = useThemeCopy();
const themeStore = useThemeStore();

const doctorReport = ref<DoctorReport | null>(null);
const doctorLoading = ref(false);

const keys = ref<MaskedApiKeyItem[]>([]);
const catalog = ref<ProviderCatalog>({
  gemini: { role: 'brain', models: ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'] },
  openai: { role: 'brain', models: ['gpt-4o-mini', 'gpt-4o', 'whisper-1'] },
  anthropic: { role: 'brain', models: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'] },
  openrouter: { role: 'brain', models: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'] },
  groq: { role: 'stt', models: ['whisper-large-v3-turbo', 'whisper-large-v3'] },
  deepgram: { role: 'stt', models: ['nova-3', 'nova-2'] }
});
const loadingKeys = ref(false);

const editingKeyId = ref<string | null>(null);
const editLabel = ref('');
const editModel = ref('');
const updatingKey = ref(false);

const provider = ref<AiProvider>('gemini');
const role = ref<AiKeyRole>('brain');
const label = ref('');
const apiKey = ref('');
const defaultModel = ref('gemini-2.5-flash');
const saving = ref(false);

const testingId = ref<string | null>(null);
const toastMessage = ref<{ type: 'ok' | 'err'; text: string } | null>(null);

const suggestedModels = computed(() => catalog.value[provider.value]?.models ?? []);

function onProviderChange() {
  const entry = catalog.value[provider.value];
  if (entry) {
    role.value = entry.role;
    defaultModel.value = entry.models[0] || '';
  }
}

function showToast(type: 'ok' | 'err', text: string) {
  toastMessage.value = { type, text };
  setTimeout(() => {
    if (toastMessage.value?.text === text) toastMessage.value = null;
  }, 5000);
}

async function fetchDoctor() {
  doctorLoading.value = true;
  try {
    const res = await apiRequest<DoctorReport>('/api/system/doctor');
    doctorReport.value = res.data;
  } catch (err) {
    showToast('err', err instanceof Error ? err.message : 'Gagal memeriksa perangkat.');
  } finally {
    doctorLoading.value = false;
  }
}

async function fetchKeys() {
  loadingKeys.value = true;
  try {
    const res = await apiRequest<{ items: MaskedApiKeyItem[]; providerCatalog: ProviderCatalog }>('/api/api-keys');
    if (res.data) {
      keys.value = res.data.items;
      catalog.value = res.data.providerCatalog;
    }
  } catch (err) {
    showToast('err', err instanceof Error ? err.message : 'Gagal memuat daftar kunci API.');
  } finally {
    loadingKeys.value = false;
  }
}

async function handleCreateKey() {
  saving.value = true;
  try {
    await apiRequest('/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({
        provider: provider.value,
        role: role.value,
        label: label.value,
        apiKey: apiKey.value,
        defaultModel: defaultModel.value
      })
    });
    label.value = '';
    apiKey.value = '';
    showToast('ok', 'Kunci API berhasil dienkripsi dan disimpan ke brankas lokal.');
    await Promise.all([fetchKeys(), fetchDoctor()]);
  } catch (err) {
    showToast('err', err instanceof Error ? err.message : 'Gagal menyimpan kunci API.');
  } finally {
    saving.value = false;
  }
}

async function handleTestKey(id: string) {
  testingId.value = id;
  try {
    const res = await apiRequest<{ ping: { ok: boolean; statusMessage: string } }>(`/api/api-keys/${id}/test`, {
      method: 'POST'
    });
    const ping = res.data?.ping;
    showToast(ping?.ok ? 'ok' : 'err', ping?.statusMessage || 'Pengujian koneksi selesai.');
    await fetchKeys();
  } catch (err) {
    showToast('err', err instanceof Error ? err.message : 'Gagal menguji koneksi API.');
  } finally {
    testingId.value = null;
  }
}

async function handleToggle(item: MaskedApiKeyItem) {
  try {
    await apiRequest(`/api/api-keys/${item.id}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !item.isActive })
    });
    await Promise.all([fetchKeys(), fetchDoctor()]);
  } catch (err) {
    showToast('err', err instanceof Error ? err.message : 'Gagal memperbarui status kunci.');
  }
}

function startEditKey(item: MaskedApiKeyItem) {
  editingKeyId.value = item.id;
  editLabel.value = item.label;
  editModel.value = item.defaultModel;
}

function cancelEditKey() {
  editingKeyId.value = null;
  editLabel.value = '';
  editModel.value = '';
}

async function handleSaveEditKey(id: string) {
  if (!editModel.value.trim()) return;
  updatingKey.value = true;
  try {
    await apiRequest(`/api/api-keys/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        label: editLabel.value.trim() || undefined,
        defaultModel: editModel.value.trim()
      })
    });
    showToast('ok', `Model berhasil diperbarui ke "${editModel.value.trim()}". Klik Uji Koneksi untuk verifikasi.`);
    cancelEditKey();
    await fetchKeys();
  } catch (err) {
    showToast('err', err instanceof Error ? err.message : 'Gagal mengubah model kunci API.');
  } finally {
    updatingKey.value = false;
  }
}

async function handleDelete(id: string) {
  try {
    await apiRequest(`/api/api-keys/${id}`, { method: 'DELETE' });
    showToast('ok', 'Kunci API dihapus dari brankas lokal.');
    await Promise.all([fetchKeys(), fetchDoctor()]);
  } catch (err) {
    showToast('err', err instanceof Error ? err.message : 'Gagal menghapus kunci API.');
  }
}

onMounted(() => {
  fetchDoctor();
  fetchKeys();
});
</script>

<template>
  <StudioShell>
    <div class="space-y-6">
      <div class="space-y-1">
        <h1 class="studio-heading text-2xl md:text-3xl font-bold">{{ copy.apiKeysTitle }}</h1>
        <p class="studio-muted text-sm md:text-base">{{ copy.apiKeysSubtitle }}</p>
      </div>

      <div
        v-if="toastMessage"
        class="p-3.5 rounded text-sm font-medium"
        :class="toastMessage.type === 'ok' ? 'studio-badge-ok' : 'studio-badge-err'"
        role="status"
      >
        {{ toastMessage.text }}
      </div>

      <DoctorPanel :report="doctorReport" :loading="doctorLoading" @refresh="fetchDoctor" />

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- Form Tambah Kunci BYOK -->
        <form class="lg:col-span-5 studio-card p-5 space-y-4" @submit.prevent="handleCreateKey">
          <div class="flex items-center gap-2">
            <Plus class="w-4 h-4" style="color: var(--accent-bg);" />
            <h2 class="studio-heading text-lg font-bold">Tambah Kunci API (BYOK)</h2>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1">
              <label for="key-provider" class="block text-xs font-semibold">Penyedia AI</label>
              <select id="key-provider" v-model="provider" class="studio-input" @change="onProviderChange">
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="openrouter">OpenRouter</option>
                <option value="groq">Groq Whisper (Transkrip Cepat)</option>
                <option value="deepgram">Deepgram (Transkrip)</option>
              </select>
            </div>
            <div class="space-y-1">
              <label for="key-role" class="block text-xs font-semibold">Peran di Studio</label>
              <select id="key-role" v-model="role" class="studio-input">
                <option value="brain">Otak Analisis (LLM)</option>
                <option value="stt">Transkrip Video (STT)</option>
                <option value="tts">Suara Tambahan (TTS)</option>
              </select>
            </div>
          </div>

          <div class="space-y-1">
            <label for="key-label" class="block text-xs font-semibold">Nama Penanda</label>
            <input
              id="key-label"
              v-model="label"
              type="text"
              required
              placeholder="Contoh: Gemini Utama Pribadi"
              class="studio-input"
            />
          </div>

          <div class="space-y-1">
            <label for="key-model" class="block text-xs font-semibold">Model Bawaan</label>
            <input
              id="key-model"
              v-model="defaultModel"
              type="text"
              required
              list="suggested-models-list"
              class="studio-input font-mono text-xs"
            />
            <datalist id="suggested-models-list">
              <option v-for="m in suggestedModels" :key="m" :value="m" />
            </datalist>
          </div>

          <div class="space-y-1">
            <label for="key-secret" class="block text-xs font-semibold">Kunci API Rahasia</label>
            <input
              id="key-secret"
              v-model="apiKey"
              type="password"
              required
              minlength="8"
              autocomplete="off"
              placeholder="Tempel API key Anda di sini..."
              class="studio-input font-mono text-xs"
            />
            <p class="text-[11px] studio-muted">
              Disimpan dalam bentuk terenkripsi lokal. Kunci asli tidak pernah ditampilkan kembali.
            </p>
          </div>

          <button type="submit" class="studio-btn-primary w-full" :disabled="saving">
            <KeyRound class="w-4 h-4" />
            <span>{{ saving ? 'Mengenkripsi...' : copy.addKeyCta }}</span>
          </button>
        </form>

        <!-- Daftar Kunci Tersimpan -->
        <section
          class="lg:col-span-7 space-y-3"
          :class="themeStore.current === 'daylight-editorial' ? 'studio-card-editorial pt-5' : 'studio-card p-5'"
        >
          <div class="flex items-center justify-between gap-2">
            <h2 class="studio-heading text-lg font-bold">Kunci Terpasang ({{ keys.length }})</h2>
            <span class="text-xs studio-muted">Mode Hemat Gratis Aktif</span>
          </div>

          <!-- Panduan Ringkas Mode 100% Gratis (M16) -->
          <div
            class="p-3.5 rounded text-xs space-y-1.5"
            style="background: var(--accent-soft-bg); color: var(--accent-soft-fg); border: 1px solid var(--accent-bg);"
          >
            <p class="font-bold">Mode 100% Gratis Aktif (Google AI Studio + Opsional Groq Whisper)</p>
            <p class="leading-relaxed opacity-95">
              1 kunci <strong>Google Gemini</strong> (<code>gemini-2.5-flash</code>) kini otomatis melayani <strong>Otak AI + Transkrip Video (STT)</strong> sekaligus dilengkapi pelindung kuota Free Tier (kompresi token, jeda anti-429, &amp; waterfall otomatis ke <code>gemini-2.5-flash-lite</code>). Untuk transkrip kata super cepat dengan kuota terpisah, Anda juga bisa menambah <strong>Groq Whisper</strong> gratis di <code>console.groq.com/keys</code>.
            </p>
          </div>

          <div v-if="loadingKeys && keys.length === 0" class="text-sm studio-muted py-6">
            Memuat daftar kunci API...
          </div>

          <div v-else-if="keys.length === 0" class="py-8 text-center space-y-2">
            <p class="font-semibold text-sm">Belum ada kunci API yang dipasang.</p>
            <p class="text-xs studio-muted max-w-md mx-auto">
              Tempel kunci Gemini atau OpenAI untuk analisis brief & skor viral, serta Groq Whisper untuk transkripsi cepat video mentah.
            </p>
          </div>

          <div v-else class="space-y-3">
            <article
              v-for="item in keys"
              :key="item.id"
              class="p-4 rounded space-y-3"
              style="background: var(--bg-elevated); border: var(--border-width) solid var(--border-color);"
            >
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-sm truncate">{{ item.label }}</span>
                    <span class="font-mono text-[11px] px-1.5 py-0.5 rounded uppercase" style="background: var(--accent-soft-bg); color: var(--accent-soft-fg);">
                      {{ item.provider }} / {{ item.role }}
                    </span>
                    <span
                      v-if="item.lastTestOk !== null"
                      class="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-semibold"
                      :class="item.lastTestOk ? 'studio-badge-ok' : 'studio-badge-err'"
                    >
                      <CheckCircle2 v-if="item.lastTestOk" class="w-3 h-3" />
                      <XCircle v-else class="w-3 h-3" />
                      <span>{{ item.lastTestOk ? 'Terhubung' : 'Gagal Uji' }}</span>
                    </span>
                  </div>
                  <p class="font-mono text-xs studio-muted">
                    {{ item.maskedPreview }} | Model: <strong class="text-[var(--text-primary)]">{{ item.defaultModel }}</strong>
                  </p>
                </div>

                <div class="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    class="studio-btn-secondary text-xs"
                    @click="editingKeyId === item.id ? cancelEditKey() : startEditKey(item)"
                  >
                    <Pencil class="w-3.5 h-3.5" />
                    <span>Ubah Model</span>
                  </button>
                  <button
                    type="button"
                    class="studio-btn-secondary"
                    :disabled="testingId === item.id"
                    @click="handleTestKey(item.id)"
                  >
                    <PlugZap class="w-4 h-4" />
                    <span>{{ testingId === item.id ? 'Menguji...' : 'Uji Koneksi' }}</span>
                  </button>
                  <button type="button" class="studio-btn-secondary" @click="handleToggle(item)">
                    <span>{{ item.isActive ? 'Aktif' : 'Nonaktif' }}</span>
                  </button>
                  <button
                    type="button"
                    class="studio-btn-secondary"
                    aria-label="Hapus kunci API"
                    @click="handleDelete(item.id)"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Form Inline Edit Nama Model & Label tanpa perlu menempel ulang kunci rahasia (M19) -->
              <form
                v-if="editingKeyId === item.id"
                class="p-3 rounded space-y-2.5"
                style="background: var(--bg-surface); border: 1px solid var(--border-color);"
                @submit.prevent="handleSaveEditKey(item.id)"
              >
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div class="space-y-1">
                    <label :for="`edit-label-${item.id}`" class="block text-[11px] font-semibold">Nama Penanda</label>
                    <input :id="`edit-label-${item.id}`" v-model="editLabel" type="text" required class="studio-input text-xs" />
                  </div>
                  <div class="space-y-1">
                    <label :for="`edit-model-${item.id}`" class="block text-[11px] font-semibold">Nama Model AI (Bebas Ketik / Pilih Cepat)</label>
                    <input
                      :id="`edit-model-${item.id}`"
                      v-model="editModel"
                      type="text"
                      required
                      placeholder="Contoh: gemini-3.5-flash"
                      class="studio-input font-mono text-xs"
                    />
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-[11px] studio-muted">Pilih cepat:</span>
                  <button
                    v-for="m in (catalog[item.provider]?.models ?? [])"
                    :key="m"
                    type="button"
                    class="px-2 py-0.5 rounded font-mono text-[11px] border"
                    :style="editModel === m ? { background: 'var(--accent-bg)', color: 'var(--accent-fg)', borderColor: 'var(--accent-bg)' } : { background: 'var(--bg-elevated)', borderColor: 'var(--border-color)' }"
                    @click="editModel = m"
                  >
                    {{ m }}
                  </button>
                </div>

                <div class="flex items-center justify-end gap-2">
                  <button type="button" class="studio-btn-secondary text-xs" @click="cancelEditKey">
                    <X class="w-3.5 h-3.5" />
                    <span>Batal</span>
                  </button>
                  <button type="submit" class="studio-btn-primary text-xs" :disabled="updatingKey || !editModel.trim()">
                    <Check class="w-3.5 h-3.5" />
                    <span>{{ updatingKey ? 'Menyimpan...' : 'Simpan Model' }}</span>
                  </button>
                </div>
              </form>
            </article>
          </div>
        </section>
      </div>
    </div>
  </StudioShell>
</template>
