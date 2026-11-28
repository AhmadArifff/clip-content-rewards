<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  Palette,
  Plus,
  Upload,
  Trash2,
  Pencil,
  Check,
  Sparkles,
  Image as ImageIcon
} from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import { apiRequest } from '~/composables/useApi';
import { useThemeCopy } from '~/composables/useThemeCopy';
import { useThemeStore } from '~/stores/theme';

interface BrandKitRow {
  id: string;
  name: string;
  brandTagline: string;
  primaryColorHex: string;
  accentColorHex: string;
  captionFontFamily: string;
  defaultCaptionStyle: 'hormozi_bold' | 'clean_minimal' | 'bilingual' | 'off';
  defaultWatermarkPos: 'top_left_safe' | 'top_right_safe' | 'bottom_left_safe';
  defaultWatermarkOpacity: number;
  hasLogo: boolean;
  logoOriginalName: string | null;
  logoUrl: string | null;
  defaultCtaTemplate: string;
}

const copy = useThemeCopy();
const themeStore = useThemeStore();

const kits = ref<BrandKitRow[]>([]);
const loading = ref(false);
const saving = ref(false);
const uploadingKitId = ref('');
const editingId = ref<string | null>(null);
const errorMsg = ref('');
const noticeMsg = ref('');

const form = ref({
  name: '',
  brandTagline: '',
  primaryColorHex: '#10B981',
  accentColorHex: '#F59E0B',
  captionFontFamily: 'Segoe UI',
  defaultCaptionStyle: 'hormozi_bold' as 'hormozi_bold' | 'clean_minimal' | 'bilingual' | 'off',
  defaultWatermarkPos: 'top_left_safe' as 'top_left_safe' | 'top_right_safe' | 'bottom_left_safe',
  defaultWatermarkOpacity: 0.85,
  defaultCtaTemplate: ''
});
const pendingLogoFile = ref<File | null>(null);
const pendingLogoPreview = ref<string | null>(null);

const fontOptions = ['Segoe UI', 'Arial', 'Verdana', 'Tahoma', 'Impact'];

function resetForm() {
  editingId.value = null;
  form.value = {
    name: '',
    brandTagline: '',
    primaryColorHex: '#10B981',
    accentColorHex: '#F59E0B',
    captionFontFamily: 'Segoe UI',
    defaultCaptionStyle: 'hormozi_bold',
    defaultWatermarkPos: 'top_left_safe',
    defaultWatermarkOpacity: 0.85,
    defaultCtaTemplate: ''
  };
  pendingLogoFile.value = null;
  pendingLogoPreview.value = null;
}

function startEdit(kit: BrandKitRow) {
  editingId.value = kit.id;
  form.value = {
    name: kit.name,
    brandTagline: kit.brandTagline,
    primaryColorHex: kit.primaryColorHex,
    accentColorHex: kit.accentColorHex,
    captionFontFamily: kit.captionFontFamily,
    defaultCaptionStyle: kit.defaultCaptionStyle,
    defaultWatermarkPos: kit.defaultWatermarkPos,
    defaultWatermarkOpacity: kit.defaultWatermarkOpacity,
    defaultCtaTemplate: kit.defaultCtaTemplate
  };
  pendingLogoFile.value = null;
  pendingLogoPreview.value = kit.logoUrl;
  noticeMsg.value = `Mengedit Brand Kit "${kit.name}".`;
}

function onLogoSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  pendingLogoFile.value = file;
  if (file) {
    pendingLogoPreview.value = URL.createObjectURL(file);
  }
}

async function fetchKits() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await apiRequest<BrandKitRow[]>('/api/brand-kits');
    kits.value = res.data ?? [];
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal memuat pustaka Brand Kit.';
  } finally {
    loading.value = false;
  }
}

async function uploadLogoToKit(kitId: string, file: File) {
  const fd = new FormData();
  fd.append('logo', file);
  const response = await fetch(`/api/brand-kits/${kitId}/logo`, {
    method: 'POST',
    credentials: 'include',
    body: fd
  });
  const payload = (await response.json()) as { success?: boolean; error?: { message?: string } };
  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message || 'Gagal mengunggah logo Brand Kit.');
  }
}

async function handleSubmit() {
  errorMsg.value = '';
  noticeMsg.value = '';
  if (form.value.name.trim().length < 2) {
    errorMsg.value = 'Nama Brand Kit minimal 2 karakter.';
    return;
  }

  saving.value = true;
  try {
    let savedId = editingId.value;
    if (editingId.value) {
      await apiRequest<BrandKitRow>(`/api/brand-kits/${editingId.value}`, {
        method: 'PATCH',
        body: JSON.stringify(form.value)
      });
    } else {
      const created = await apiRequest<BrandKitRow>('/api/brand-kits', {
        method: 'POST',
        body: JSON.stringify(form.value)
      });
      savedId = created.data?.id ?? null;
    }

    if (savedId && pendingLogoFile.value) {
      await uploadLogoToKit(savedId, pendingLogoFile.value);
    }

    noticeMsg.value = editingId.value
      ? `Brand Kit "${form.value.name}" berhasil diperbarui.`
      : `Brand Kit "${form.value.name}" berhasil disimpan dan siap dipilih di Studio Campaign!`;
    resetForm();
    await fetchKits();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menyimpan Brand Kit.';
  } finally {
    saving.value = false;
  }
}

async function handleQuickLogoUpload(kitId: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploadingKitId.value = kitId;
  errorMsg.value = '';
  try {
    await uploadLogoToKit(kitId, file);
    noticeMsg.value = 'Logo Brand Kit berhasil diperbarui!';
    await fetchKits();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal mengunggah logo.';
  } finally {
    uploadingKitId.value = '';
    input.value = '';
  }
}

async function handleDeleteKit(kit: BrandKitRow) {
  errorMsg.value = '';
  noticeMsg.value = '';
  try {
    await apiRequest(`/api/brand-kits/${kit.id}`, { method: 'DELETE' });
    if (editingId.value === kit.id) resetForm();
    noticeMsg.value = `Brand Kit "${kit.name}" telah dihapus.`;
    await fetchKits();
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menghapus Brand Kit.';
  }
}

onMounted(fetchKits);
</script>

<template>
  <StudioShell>
    <div class="space-y-6 min-w-0">
      <div class="space-y-1">
        <h1 class="studio-heading text-2xl md:text-3xl font-bold inline-flex items-center gap-2">
          <Palette class="w-6 h-6 shrink-0" style="color: var(--accent-bg);" />
          <span>{{ copy.brandKitsTitle }}</span>
        </h1>
        <p class="text-sm studio-muted max-w-2xl leading-relaxed">
          {{ copy.brandKitsSubtitle }}
        </p>
      </div>

      <div v-if="errorMsg" class="p-3.5 rounded text-sm font-medium studio-badge-err">{{ errorMsg }}</div>
      <div v-if="noticeMsg" class="p-3.5 rounded text-sm font-medium studio-badge-ok">{{ noticeMsg }}</div>

      <!-- Form + Pratinjau Live 9:16 -->
      <section class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <form class="lg:col-span-7 studio-card p-5 space-y-4" @submit.prevent="handleSubmit">
          <div class="flex items-center justify-between gap-2">
            <h2 class="studio-heading text-base font-bold inline-flex items-center gap-1.5">
              <Sparkles class="w-4 h-4" style="color: var(--accent-bg);" />
              <span>{{ editingId ? 'Edit Brand Asset Kit' : 'Buat Brand Asset Kit Baru' }}</span>
            </h2>
            <button
              v-if="editingId"
              type="button"
              class="text-xs font-semibold studio-muted hover:underline"
              @click="resetForm"
            >
              Batal Edit
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div class="space-y-1">
              <label for="bk-name" class="block font-semibold">Nama Brand Kit</label>
              <input
                id="bk-name"
                v-model="form.name"
                type="text"
                required
                minlength="2"
                maxlength="80"
                placeholder="Contoh: Kopi Nusantara Official"
                class="studio-input"
              />
            </div>

            <div class="space-y-1">
              <label for="bk-tagline" class="block font-semibold">Tagline / Catatan Gaya (Opsional)</label>
              <input
                id="bk-tagline"
                v-model="form.brandTagline"
                type="text"
                maxlength="140"
                placeholder="Enerjik, Gen-Z, Kontras Cerah"
                class="studio-input"
              />
            </div>

            <div class="space-y-1">
              <label for="bk-primary" class="block font-semibold">Warna Utama (Hook &amp; CTA)</label>
              <div class="flex items-center gap-2">
                <input
                  v-model="form.primaryColorHex"
                  type="color"
                  aria-label="Pilih warna utama"
                  class="w-11 h-10 rounded cursor-pointer border-0 p-0.5 bg-transparent"
                />
                <input
                  id="bk-primary"
                  v-model="form.primaryColorHex"
                  type="text"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  class="studio-input font-mono uppercase"
                />
              </div>
            </div>

            <div class="space-y-1">
              <label for="bk-accent" class="block font-semibold">Warna Aksen (Subtitle Bold)</label>
              <div class="flex items-center gap-2">
                <input
                  v-model="form.accentColorHex"
                  type="color"
                  aria-label="Pilih warna aksen"
                  class="w-11 h-10 rounded cursor-pointer border-0 p-0.5 bg-transparent"
                />
                <input
                  id="bk-accent"
                  v-model="form.accentColorHex"
                  type="text"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  class="studio-input font-mono uppercase"
                />
              </div>
            </div>

            <div class="space-y-1">
              <label for="bk-font" class="block font-semibold">Font Subtitle Lokal</label>
              <select id="bk-font" v-model="form.captionFontFamily" class="studio-input">
                <option v-for="f in fontOptions" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>

            <div class="space-y-1">
              <label for="bk-caption-style" class="block font-semibold">Gaya Caption Bawaan</label>
              <select id="bk-caption-style" v-model="form.defaultCaptionStyle" class="studio-input">
                <option value="hormozi_bold">Hormozi Bold (Berwarna Aksen)</option>
                <option value="clean_minimal">Clean Minimalist</option>
                <option value="bilingual">Bilingual</option>
                <option value="off">Tanpa Subtitle</option>
              </select>
            </div>

            <div class="space-y-1">
              <label for="bk-wm-pos" class="block font-semibold">Posisi Watermark Safe-Zone</label>
              <select id="bk-wm-pos" v-model="form.defaultWatermarkPos" class="studio-input">
                <option value="top_left_safe">Kiri Atas Aman</option>
                <option value="top_right_safe">Kanan Atas Aman</option>
                <option value="bottom_left_safe">Kiri Bawah Aman</option>
              </select>
            </div>

            <div class="space-y-1">
              <div class="flex justify-between font-semibold">
                <label for="bk-wm-op">Opasitas Logo</label>
                <span class="font-mono">{{ Math.round(form.defaultWatermarkOpacity * 100) }}%</span>
              </div>
              <input
                id="bk-wm-op"
                v-model.number="form.defaultWatermarkOpacity"
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                class="w-full accent-emerald-500 mt-2"
              />
            </div>

            <div class="sm:col-span-2 space-y-1">
              <label for="bk-cta" class="block font-semibold">Template CTA Penutup Wajib (Opsional)</label>
              <input
                id="bk-cta"
                v-model="form.defaultCtaTemplate"
                type="text"
                maxlength="120"
                placeholder="Contoh: Cek keranjang kuning sekarang #BrandOfficial"
                class="studio-input"
              />
            </div>

            <div class="sm:col-span-2 space-y-1">
              <label for="bk-logo-file" class="block font-semibold">Logo Brand Transparan (PNG/JPG/WebP, maks 5 MB)</label>
              <input
                id="bk-logo-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="studio-input text-xs py-2"
                @change="onLogoSelected"
              />
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button type="submit" class="studio-btn-primary text-xs" :disabled="saving">
              <Check v-if="editingId" class="w-4 h-4" />
              <Plus v-else class="w-4 h-4" />
              <span>{{ saving ? 'Menyimpan...' : editingId ? 'Perbarui Brand Kit' : 'Simpan Brand Kit' }}</span>
            </button>
          </div>
        </form>

        <!-- Pratinjau Live 9:16 Identitas Visual -->
        <aside class="lg:col-span-5 studio-card p-5 space-y-3">
          <h2 class="studio-heading text-sm font-bold">Pratinjau Live Overlay 9:16</h2>
          <div class="mx-auto w-full max-w-[240px] aspect-[9/16] rounded-lg relative overflow-hidden bg-slate-900 border border-slate-700 flex flex-col justify-between p-3.5 text-white select-none">
            <!-- Watermark Preview -->
            <div
              class="flex"
              :class="form.defaultWatermarkPos === 'top_right_safe' ? 'justify-end' : 'justify-start'"
            >
              <img
                v-if="pendingLogoPreview"
                :src="pendingLogoPreview"
                alt="Pratinjau logo"
                class="h-8 max-w-[84px] object-contain"
                :style="{ opacity: form.defaultWatermarkOpacity }"
              />
              <span
                v-else
                class="px-2 py-0.5 rounded text-[10px] font-mono bg-white/15"
                :style="{ opacity: form.defaultWatermarkOpacity }"
              >
                LOGO BRAND
              </span>
            </div>

            <!-- Hook Banner Preview -->
            <div class="text-center space-y-3 my-auto">
              <div
                class="inline-block px-3 py-1.5 rounded text-xs font-extrabold uppercase tracking-wide shadow"
                :style="{ backgroundColor: form.primaryColorHex, fontFamily: form.captionFontFamily }"
              >
                HOOK 3 DETIK PERTAMA!
              </div>

              <p
                class="text-base font-extrabold uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,0.95)] leading-tight"
                :style="{
                  color: form.defaultCaptionStyle === 'hormozi_bold' ? form.accentColorHex : '#ffffff',
                  fontFamily: form.captionFontFamily
                }"
              >
                SUBTITLE SAFE-ZONE AKTIF
              </p>
            </div>

            <!-- CTA Preview -->
            <div class="text-center pb-5">
              <span
                class="inline-block px-2.5 py-1 rounded text-[10px] font-bold shadow"
                :style="{ backgroundColor: form.primaryColorHex, fontFamily: form.captionFontFamily }"
              >
                {{ form.defaultCtaTemplate || 'Cek detail campaign sekarang!' }}
              </span>
            </div>
          </div>
          <p class="text-[11px] studio-muted text-center">
            Warna utama &amp; aksen otomatis dikonversi ke berkas <code>subtitles.ass</code> dan logo dipasang sebagai watermark Safe-Zone saat render FFmpeg.
          </p>
        </aside>
      </section>

      <!-- Daftar Brand Asset Kit Tersimpan -->
      <section class="space-y-3">
        <h2 class="studio-heading text-base font-bold">
          Daftar Brand Asset Kit Tersimpan ({{ kits.length }})
        </h2>

        <div v-if="!loading && kits.length === 0" class="studio-card p-6 text-center text-sm studio-muted">
          Belum ada Brand Asset Kit. Buat kit pertama di atas untuk menjaga konsistensi warna, logo, dan CTA di seluruh video campaign Anda.
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <article
            v-for="kit in kits"
            :key="kit.id"
            class="studio-card p-4 flex flex-col justify-between gap-3"
          >
            <div class="space-y-2.5">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div
                    class="w-11 h-11 rounded flex items-center justify-center shrink-0 overflow-hidden"
                    style="background: var(--bg-elevated); border: 1px solid var(--border-color);"
                  >
                    <img
                      v-if="kit.logoUrl"
                      :src="kit.logoUrl"
                      :alt="`Logo ${kit.name}`"
                      class="w-full h-full object-contain p-1"
                    />
                    <ImageIcon v-else class="w-5 h-5 studio-muted" />
                  </div>
                  <div class="min-w-0">
                    <h3 class="studio-heading text-sm font-bold truncate">{{ kit.name }}</h3>
                    <p class="text-[11px] studio-muted truncate">{{ kit.brandTagline || 'Kit Identitas Standar' }}</p>
                  </div>
                </div>
              </div>

              <!-- Swatches Warna & Font -->
              <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded" style="background: var(--bg-elevated);">
                  <span class="w-3 h-3 rounded-full border border-white/40" :style="{ backgroundColor: kit.primaryColorHex }" />
                  <span>{{ kit.primaryColorHex }}</span>
                </span>
                <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded" style="background: var(--bg-elevated);">
                  <span class="w-3 h-3 rounded-full border border-white/40" :style="{ backgroundColor: kit.accentColorHex }" />
                  <span>{{ kit.accentColorHex }}</span>
                </span>
                <span class="px-2 py-0.5 rounded" style="background: var(--bg-elevated);">
                  {{ kit.captionFontFamily }}
                </span>
              </div>

              <p v-if="kit.defaultCtaTemplate" class="text-xs studio-muted line-clamp-2">
                CTA: "{{ kit.defaultCtaTemplate }}"
              </p>
            </div>

            <div
              class="pt-2.5 flex flex-wrap items-center gap-1.5"
              :style="{ borderTop: themeStore.current === 'creator-tactile' ? '2px solid #0f172a' : '1px solid var(--border-color)' }"
            >
              <label class="studio-btn-secondary !min-h-[36px] !px-2.5 text-[11px] cursor-pointer">
                <Upload class="w-3.5 h-3.5" />
                <span>{{ uploadingKitId === kit.id ? 'Unggah...' : kit.hasLogo ? 'Ganti Logo' : 'Unggah Logo' }}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="hidden"
                  @change="handleQuickLogoUpload(kit.id, $event)"
                />
              </label>

              <button
                type="button"
                class="studio-btn-secondary !min-h-[36px] !px-2.5 text-[11px]"
                @click="startEdit(kit)"
              >
                <Pencil class="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>

              <button
                type="button"
                class="studio-btn-secondary !min-h-[36px] !px-2.5 text-[11px] ml-auto"
                @click="handleDeleteKit(kit)"
              >
                <Trash2 class="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </StudioShell>
</template>
