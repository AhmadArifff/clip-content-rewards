import { useAuthStore } from '~/stores/auth';

export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore();
  await auth.hydrate();

  const isAuthPage = to.path === '/login';

  if (!auth.isAuthenticated) {
    if (!isAuthPage) {
      return navigateTo('/login');
    }
    return;
  }

  if (isAuthPage || to.path === '/') {
    return navigateTo('/settings/api-keys');
  }
});
