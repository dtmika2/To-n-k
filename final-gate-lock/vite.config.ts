import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH: where the site is served from, e.g. /To-n-k/ on GitHub Pages (default: the root)
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        wheel: resolve(__dirname, 'wheel.html'),
        install: resolve(__dirname, 'install.html'),
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Final Gate Lock',
        short_name: 'Gate Lock',
        description: 'The final lock.',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#050405',
        theme_color: '#050405',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,woff,woff2,png,jpg,jpeg,webp,ogg,mp3,wav,svg,ico}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/wheel\.html/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
