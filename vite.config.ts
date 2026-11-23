import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const BG = '#0a0a0f'
// Versión visible en Perfil: package.json + commit (Vercel lo inyecta en VERCEL_GIT_COMMIT_SHA)
const APP_VERSION = `${process.env.npm_package_version ?? '0.0.0'}+${(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)}`

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // El registro se hace a mano en src/main.tsx (virtual:pwa-register)
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        id: '/',
        name: 'GymApp',
        short_name: 'GymApp',
        description: 'Tracker de gym con rangos por músculo, comidas y balance calórico. 100 % local.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: BG,
        theme_color: BG,
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Offline completo: precache de todo el bundle y fallback SPA
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2,json}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
