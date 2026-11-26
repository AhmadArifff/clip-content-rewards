import { defineStore } from 'pinia';
import { apiRequest } from '~/composables/useApi';

export interface StudioUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as StudioUser | null,
    needsSetup: false,
    initialized: false,
    loading: false
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.user)
  },

  actions: {
    async hydrate() {
      if (this.initialized) return;
      this.loading = true;
      try {
        const statusRes = await apiRequest<{ needsSetup: boolean }>('/api/auth/setup-status');
        this.needsSetup = Boolean(statusRes.data?.needsSetup);
        if (!this.needsSetup) {
          try {
            const meRes = await apiRequest<StudioUser>('/api/auth/me');
            this.user = meRes.data;
          } catch {
            this.user = null;
          }
        }
      } finally {
        this.initialized = true;
        this.loading = false;
      }
    },

    async setupAdmin(payload: { name: string; email: string; password: string }) {
      const res = await apiRequest<{ user: StudioUser }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      this.user = res.data?.user ?? null;
      this.needsSetup = false;
      this.initialized = true;
      return this.user;
    },

    async login(payload: { email: string; password: string }) {
      const res = await apiRequest<{ user: StudioUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      this.user = res.data?.user ?? null;
      this.initialized = true;
      return this.user;
    },

    async logout() {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      this.user = null;
    }
  }
});
