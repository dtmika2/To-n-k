import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { settings } from './src/config/settings.ts';
import { formatPattern } from './src/pattern/format.ts';
import type { Pattern } from './src/pattern/types.ts';
import { validatePattern } from './src/pattern/validate.ts';

/** Dev server only: lets the layout editor write src/config/pattern.json directly ("Save to project"). */
function savePattern(): Plugin {
  return {
    name: 'dream-pattern-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-pattern', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
        req.on('end', () => {
          try {
            const pattern = JSON.parse(body) as Pattern;
            const { errors } = validatePattern(pattern, settings);
            if (errors.length > 0) {
              res.statusCode = 400;
              res.end(errors.join('\n'));
              return;
            }
            writeFileSync(resolve(import.meta.dirname, 'src/config/pattern.json'), formatPattern(pattern));
            res.end('ok');
          } catch (e) {
            res.statusCode = 400;
            res.end((e as Error).message);
          }
        });
      });
    },
  };
}

// BASE_PATH: where the site is served from (default: the root, as in the kiosk setup)
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  plugins: [
    savePattern(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Dream Pattern',
        short_name: 'Dream Pattern',
        description: 'Trace the pattern of the sleeping eyes.',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#07051a',
        theme_color: '#07051a',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,jpg,jpeg,webp,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
