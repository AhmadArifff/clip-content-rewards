<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Clapperboard, Activity, CalendarDays, Palette, HardDrive, KeyRound, SlidersHorizontal, LogOut, Cpu } from 'lucide-vue-next';
import { apiRequest } from '~/composables/useApi';
import { useAuthStore } from '~/stores/auth';
import { useThemeStore } from '~/stores/theme';
import { useThemeCopy } from '~/composables/useThemeCopy';
import BrandLogo from '~/components/shared/BrandLogo.vue';
import ThemeSwitcher from '~/components/shared/ThemeSwitcher.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const themeStore = useThemeStore();
const copy = useThemeCopy();

const maintenanceAlerts = ref<{ criticalCount: number; warningCount: number; totalAlerts: number }>({
  criticalCount: 0,
  warningCount: 0,
  totalAlerts: 0
});

const navItems = computed(() => [
  { to: '/campaigns', label: copy.value.navCampaigns, icon: Clapperboard, badge: 0, badgeCritical: false },
  { to: '/pacing', label: copy.value.navPacing, icon: Activity, badge: 0, badgeCritical: false },
  { to: '/calendar', label: copy.value.navCalendar, icon: CalendarDays, badge: 0, badgeCritical: false },
  { to: '/brand-kits', label: copy.value.navBrandKits, icon: Palette, badge: 0, badgeCritical: false },
  {
    to: '/maintenance',
    label: copy.value.navMaintenance,
    icon: HardDrive,
    badge: maintenanceAlerts.value.totalAlerts,
    badgeCritical: maintenanceAlerts.value.criticalCount > 0
  },
  { to: '/settings/api-keys', label: copy.value.navApiKeys, icon: KeyRound, badge: 0, badgeCritical: false },
  { to: '/settings/presets', label: copy.value.navPresets, icon: SlidersHorizontal, badge: 0, badgeCritical: false }
]);

onMounted(async () => {
  if (!auth.user) return;
  try {
    const res = await apiRequest<{ criticalCount: number; warningCount: number; totalAlerts: number }>(
      '/api/maintenance/alert-summary'
    );
    if (res.data) {
      maintenanceAlerts.value = res.data;
    }
  } catch {
    // Abaikan agar navigasi utama tidak pernah terganggu
  }
});

async function handleLogout() {
  await auth.logout();
  await router.push('/login');
}
</script>

<template>
  <!-- =====================================================================
       SLICING 1: EDITING ROOM (Left Compact Console Rail + Top Telemetry Bar)
       ===================================================================== -->
  <div v-if="themeStore.current === 'editing-room'" class="min-h-screen flex flex-col md:flex-row">
    <aside
      class="w-full md:w-60 shrink-0 flex flex-col justify-between p-4"
      style="background: var(--bg-surface); border-right: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"
    >
      <div class="space-y-6">
        <div class="flex items-center justify-between md:block">
          <div class="flex items-center gap-2.5">
            <BrandLogo size="md" />
            <div class="min-w-0">
              <span class="font-mono text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded studio-badge-ok">
                {{ copy.shortTag }}
              </span>
              <p class="studio-heading text-sm font-bold mt-1 tracking-tight leading-tight">ClipStudio Local</p>
              <p class="text-[11px] studio-muted truncate">{{ copy.brandSubtitle }}</p>
            </div>
          </div>
        </div>

        <nav class="flex md:flex-col gap-1 overflow-x-auto" aria-label="Navigasi utama">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded whitespace-nowrap min-h-[44px] transition-colors"
            :style="
              route.path.startsWith(item.to)
                ? { backgroundColor: 'var(--accent-soft-bg)', color: 'var(--accent-soft-fg)', borderLeft: '3px solid var(--accent-bg)' }
                : { color: 'var(--text-muted)' }
            "
          >
            <component :is="item.icon" class="w-4 h-4 shrink-0" />
            <span>{{ item.label }}</span>
            <span
              v-if="item.badge > 0"
              class="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold leading-none"
              :class="item.badgeCritical ? 'studio-badge-err' : 'studio-badge-warn'"
            >
              {{ item.badge }}
            </span>
          </NuxtLink>
        </nav>
      </div>

      <div class="hidden md:flex flex-col gap-3 pt-4" style="border-top: 1px solid var(--border-color);">
        <div class="text-xs">
          <p class="font-semibold truncate">{{ auth.user?.name }}</p>
          <p class="studio-muted font-mono text-[11px] truncate">{{ auth.user?.email }}</p>
        </div>
        <button type="button" class="studio-btn-secondary w-full justify-start" @click="handleLogout">
          <LogOut class="w-4 h-4" />
          <span>Keluar Sesi</span>
        </button>
      </div>
    </aside>

    <div class="flex-1 min-w-0 flex flex-col">
      <header
        class="px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3"
        style="background: var(--bg-surface); border-bottom: 1px solid var(--border-color);"
      >
        <div class="flex items-center gap-2 font-mono text-xs studio-muted">
          <Cpu class="w-4 h-4" style="color: var(--accent-bg);" />
          <span>LOCAL ENGINE: FFMPEG + SQLITE WAL</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <ThemeSwitcher />
          <button type="button" class="studio-btn-secondary md:hidden" @click="handleLogout">
            <LogOut class="w-4 h-4" />
          </button>
        </div>
      </header>

      <main class="flex-1 p-4 md:p-6 max-w-6xl w-full">
        <slot />
      </main>
    </div>
  </div>

  <!-- =====================================================================
       SLICING 2: DAYLIGHT EDITORIAL (Centered Magazine Masthead Topbar)
       ===================================================================== -->
  <div v-else-if="themeStore.current === 'daylight-editorial'" class="min-h-screen flex flex-col">
    <header style="background: var(--bg-surface); border-bottom: 1px solid var(--border-color);">
      <div class="max-w-5xl mx-auto px-4 md:px-8 py-4 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <BrandLogo size="md" />
            <div>
              <p class="text-[11px] uppercase tracking-[0.2em] studio-muted font-semibold">{{ copy.shortTag }}</p>
              <h1 class="studio-heading text-2xl font-semibold tracking-tight leading-tight">Clip Content Rewards</h1>
            </div>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <ThemeSwitcher />
            <button type="button" class="studio-btn-secondary" @click="handleLogout">
              <LogOut class="w-4 h-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        <nav class="flex items-center gap-6 overflow-x-auto pt-2" style="border-top: 1px solid var(--border-color);" aria-label="Navigasi editorial">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="inline-flex items-center gap-2 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors min-h-[40px]"
            :style="
              route.path.startsWith(item.to)
                ? { color: 'var(--accent-bg)', borderBottom: '2px solid var(--accent-bg)' }
                : { color: 'var(--text-muted)', borderBottom: '2px solid transparent' }
            "
          >
            <component :is="item.icon" class="w-4 h-4" />
            <span>{{ item.label }}</span>
            <span
              v-if="item.badge > 0"
              class="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold leading-none"
              :class="item.badgeCritical ? 'studio-badge-err' : 'studio-badge-warn'"
            >
              {{ item.badge }}
            </span>
          </NuxtLink>
          <span class="ml-auto hidden sm:inline text-xs studio-muted">{{ auth.user?.name }}</span>
        </nav>
      </div>
    </header>

    <main class="flex-1 max-w-5xl w-full mx-auto px-4 md:px-8 py-8">
      <slot />
    </main>
  </div>

  <!-- =====================================================================
       SLICING 3: CREATOR TACTILE (Floating Neo-Tactile Pill Dock)
       ===================================================================== -->
  <div v-else class="min-h-screen flex flex-col">
    <div class="px-4 md:px-6 pt-4">
      <header class="max-w-6xl mx-auto studio-card px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <BrandLogo size="md" />
          <div>
            <p class="studio-heading text-base font-bold leading-tight">ClipRewards Desk</p>
            <p class="text-xs studio-muted">{{ copy.brandSubtitle }}</p>
          </div>
        </div>

        <nav class="flex items-center gap-2 flex-wrap" aria-label="Navigasi workbench">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-transform min-h-[40px]"
            :style="
              route.path.startsWith(item.to)
                ? {
                    backgroundColor: 'var(--accent-bg)',
                    color: 'var(--accent-fg)',
                    border: '2px solid #0f172a',
                    borderRadius: '10px',
                    boxShadow: '2px 2px 0px #0f172a'
                  }
                : {
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '2px solid #0f172a',
                    borderRadius: '10px'
                  }
            "
          >
            <component :is="item.icon" class="w-4 h-4" />
            <span>{{ item.label }}</span>
            <span
              v-if="item.badge > 0"
              class="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold leading-none"
              :class="item.badgeCritical ? 'studio-badge-err' : 'studio-badge-warn'"
            >
              {{ item.badge }}
            </span>
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-2 flex-wrap">
          <ThemeSwitcher />
          <button type="button" class="studio-btn-secondary" @click="handleLogout" aria-label="Keluar">
            <LogOut class="w-4 h-4" />
          </button>
        </div>
      </header>
    </div>

    <main class="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-6">
      <slot />
    </main>
  </div>
</template>
