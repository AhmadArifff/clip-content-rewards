export default defineNuxtConfig({
  compatibilityDate: '2025-03-01',
  ssr: false,
  devtools: { enabled: false },
  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],
  css: ['~/assets/css/themes.css'],
  runtimeConfig: {
    apiBaseUrl: process.env.API_BASE_URL || 'http://127.0.0.1:4000'
  },
  app: {
    head: {
      title: 'Clip Content Rewards Studio',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Studio lokal AI Auto-Editor, Viral Scorer & Upload Playbook untuk TikTok & YouTube Content Rewards'
        }
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,600;1,6..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap'
        }
      ]
    }
  }
});
