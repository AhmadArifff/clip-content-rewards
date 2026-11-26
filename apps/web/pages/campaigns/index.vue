<script setup lang="ts">
import { ArrowRight, KeyRound, SlidersHorizontal, Sparkles } from 'lucide-vue-next';
import StudioShell from '~/components/layout/StudioShell.vue';
import { useThemeCopy } from '~/composables/useThemeCopy';

const copy = useThemeCopy();
</script>

<template>
  <StudioShell>
    <div class="space-y-6">
      <div class="space-y-1">
        <h1 class="studio-heading text-2xl md:text-3xl font-bold">{{ copy.campaignsTitle }}</h1>
        <p class="studio-muted text-sm md:text-base">{{ copy.campaignsSubtitle }}</p>
      </div>

      <section class="studio-card p-6 md:p-8 space-y-5">
        <div class="flex items-start gap-3">
          <Sparkles class="w-6 h-6 shrink-0 mt-0.5" style="color: var(--accent-bg);" />
          <div class="space-y-1">
            <h2 class="studio-heading text-xl font-bold">{{ copy.campaignsEmptyTitle }}</h2>
            <p class="studio-muted text-sm max-w-2xl leading-relaxed">{{ copy.campaignsEmptyDesc }}</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-3 pt-2">
          <NuxtLink to="/settings/api-keys" class="studio-btn-primary">
            <KeyRound class="w-4 h-4" />
            <span>{{ copy.navApiKeys }}</span>
            <ArrowRight class="w-4 h-4" />
          </NuxtLink>
          <NuxtLink to="/settings/presets" class="studio-btn-secondary">
            <SlidersHorizontal class="w-4 h-4" />
            <span>{{ copy.navPresets }}</span>
          </NuxtLink>
        </div>
      </section>
    </div>
  </StudioShell>
</template>
