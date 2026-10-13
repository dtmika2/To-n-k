import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const git = (args: string) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

/** Shown in the operator menu: package version, build number (commit count), commit and build date. */
const BUILD = {
  version: (JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version,
  build: git('rev-list --count HEAD'),
  commit: git('rev-parse --short HEAD'),
  date: new Date().toISOString().slice(0, 10),
};

// BASE_PATH: where the site is served from, e.g. /To-n-k/ on GitHub Pages (default: the root)
export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
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
