<script setup lang="ts">
import { ref } from 'vue';
import { ArrowRight } from 'lucide-vue-next';
import { useAuthStore } from '~/stores/auth';
import { useThemeStore } from '~/stores/theme';
import { useThemeCopy } from '~/composables/useThemeCopy';
import BrandLogo from '~/components/shared/BrandLogo.vue';
import ThemeSwitcher from '~/components/shared/ThemeSwitcher.vue';

const router = useRouter();
const auth = useAuthStore();
const themeStore = useThemeStore();
const copy = useThemeCopy();

const name = ref('');
const email = ref('');
const password = ref('');
const submitting = ref(false);
const errorMsg = ref('');

async function handleSubmit() {
  errorMsg.value = '';
  submitting.value = true;
  try {
    if (auth.needsSetup) {
      await auth.setupAdmin({ name: name.value, email: email.value, password: password.value });
    } else {
      await auth.login({ email: email.value, password: password.value });
    }
    await router.push('/settings/api-keys');
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal masuk ke studio.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col justify-between p-4 md:p-8">
    <header class="max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <BrandLogo size="md" />
        <div>
          <span class="studio-heading font-bold text-base block leading-tight">Clip Content Rewards</span>
          <span class="text-[11px] studio-muted font-mono">AI Auto-Editor Studio</span>
        </div>
      </div>
      <ThemeSwitcher />
    </header>

    <main class="max-w-5xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
      <!-- Kolom Kiri: Konten Visual & Value Proposition Sesuai Tema -->
      <section class="lg:col-span-6 space-y-4">
        <span
          class="inline-block px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded"
          style="background: var(--accent-soft-bg); color: var(--accent-soft-fg);"
        >
          {{ copy.shortTag }} | 100% LOKAL
        </span>
        <h1 class="studio-heading text-3xl md:text-4xl font-bold leading-tight">
          {{ auth.needsSetup ? copy.setupHeadline : copy.loginHeadline }}
        </h1>
        <p class="studio-muted text-base leading-relaxed">
          {{ auth.needsSetup ? copy.setupSubheadline : copy.loginSubheadline }}
        </p>

        <div
          class="p-4 text-sm space-y-2"
          :class="themeStore.current === 'daylight-editorial' ? 'studio-card-editorial pt-4' : 'studio-card'"
        >
          <p class="font-semibold">Yang Dilindungi Sesi Lokal Ini:</p>
          <ul class="space-y-1 studio-muted list-disc pl-5">
            <li>Brankas API Key BYOK terenkripsi AES-256-GCM di mesin Anda.</li>
            <li>Dokumen brief campaign, transkrip video, dan riwayat variasi klip.</li>
            <li>Preset lapangan audio TikTok/YouTube dan profil target audiens.</li>
          </ul>
        </div>
      </section>

      <!-- Kolom Kanan: Formulir Auth -->
      <section class="lg:col-span-6">
        <form class="studio-card p-6 md:p-7 space-y-4" @submit.prevent="handleSubmit">
          <div>
            <h2 class="studio-heading text-xl font-bold">
              {{ auth.needsSetup ? 'Buat Akun Pemilik Studio' : 'Masuk Studio Lokal' }}
            </h2>
            <p class="text-xs studio-muted mt-1">
              {{ auth.needsSetup ? 'Hanya dilakukan sekali pada pemasangan pertama.' : 'Gunakan email dan kata sandi lokal Anda.' }}
            </p>
          </div>

          <div
            v-if="errorMsg"
            class="p-3 rounded text-sm font-medium studio-badge-err"
            role="alert"
          >
            {{ errorMsg }}
          </div>

          <div v-if="auth.needsSetup" class="space-y-1.5">
            <label for="setup-name" class="block text-sm font-semibold">Nama Pemilik</label>
            <input
              id="setup-name"
              v-model="name"
              type="text"
              required
              minlength="2"
              placeholder="Contoh: Ahmad Arif"
              class="studio-input"
            />
          </div>

          <div class="space-y-1.5">
            <label for="auth-email" class="block text-sm font-semibold">Email</label>
            <input
              id="auth-email"
              v-model="email"
              type="email"
              required
              placeholder="nama@studio.local"
              class="studio-input"
            />
          </div>

          <div class="space-y-1.5">
            <label for="auth-password" class="block text-sm font-semibold">Kata Sandi</label>
            <input
              id="auth-password"
              v-model="password"
              type="password"
              required
              :minlength="auth.needsSetup ? 8 : 1"
              placeholder="Minimal 8 karakter"
              class="studio-input"
            />
          </div>

          <button type="submit" class="studio-btn-primary w-full" :disabled="submitting">
            <span>{{ submitting ? 'Memproses...' : auth.needsSetup ? 'Aktifkan Studio Lokal' : 'Masuk Sekarang' }}</span>
            <ArrowRight class="w-4 h-4" />
          </button>
        </form>
      </section>
    </main>

    <footer class="max-w-5xl w-full mx-auto text-xs studio-muted flex flex-wrap justify-between gap-2">
      <span>Berjalan lokal tanpa biaya server cloud.</span>
      <span>Coba ganti tema di pojok kanan atas untuk merasakan 3 gaya studio berbeda.</span>
    </footer>
  </div>
</template>
