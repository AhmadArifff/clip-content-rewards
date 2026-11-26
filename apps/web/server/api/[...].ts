import { joinURL } from 'ufo';

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event);
  const target = joinURL(config.apiBaseUrl, event.path);
  return proxyRequest(event, target);
});
