// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: ['@nuxtjs/i18n', '@nuxtjs/tailwindcss', '@pinia/nuxt'],
  i18n: {
    defaultLocale: 'zh-TW',
    strategy: 'prefix_except_default',
    langDir: '../locales',
    locales: [
      {
        code: 'zh-TW',
        language: 'zh-TW',
        file: 'zh-TW.json',
        name: '繁體中文',
      },
      {
        code: 'en',
        language: 'en-US',
        file: 'en.json',
        name: 'English',
      },
    ],
  },
})
