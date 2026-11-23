import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// Genera los iconos PWA/iOS a partir de assets-src/logo.png:  npm run generate-pwa-assets
const background = '#0a0a0f'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    maskable: { ...preset.maskable, resizeOptions: { background } },
    // iOS no admite transparencia en apple-touch-icon
    apple: { ...preset.apple, resizeOptions: { background } },
  },
  images: ['assets-src/logo.png'],
})
