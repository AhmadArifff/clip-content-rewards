import { defineStore } from 'pinia';
import type { ThemeId } from '@clip/shared';

const STORAGE_KEY = 'clip_studio_theme_v1';

const VALID_THEMES: ThemeId[] = ['editing-room', 'daylight-editorial', 'creator-tactile'];

export const useThemeStore = defineStore('theme', {
  state: () => ({
    current: 'editing-room' as ThemeId
  }),

  actions: {
    initTheme() {
      if (import.meta.client) {
        const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
        if (saved && VALID_THEMES.includes(saved)) {
          this.current = saved;
        }
        document.documentElement.setAttribute('data-theme', this.current);
      }
    },

    setTheme(theme: ThemeId) {
      if (!VALID_THEMES.includes(theme)) return;
      this.current = theme;
      if (import.meta.client) {
        localStorage.setItem(STORAGE_KEY, theme);
        document.documentElement.setAttribute('data-theme', theme);
      }
    }
  }
});
