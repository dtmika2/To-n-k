// Builds the M9 test sprite set: every wheel layer is rendered from its procedural drawing at 2×,
// re-tinted to a cool "steel" palette (so switching modes visibly changes the look while the
// luminance — and therefore the geometry check — stays comparable), and written with its exact
// pivot into public/assets/test-sprites/manifest.json.
//
// Requires a running preview server:  npm run build && npm run preview   (then)   npm run test-sprites
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.FGL_URL ?? 'http://localhost:4173';
const OUT = 'public/assets/test-sprites';
const LAYERS = [
  'ring', 'disc', 'iris', 'irisShade', 'pupil', 'highlight', 'lidTop', 'lidBottom',
  'arrowCw', 'arrowCwPressed', 'arrowCcw', 'arrowCcwPressed', 'lockRing',
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto(`${BASE}/wheel.html`);
await page.waitForFunction(() => window.__fglBoot === 'ok');
mkdirSync(OUT, { recursive: true });
const manifest = {};
for (const id of LAYERS) {
  const r = await page.evaluate(async (layerId) => {
    const out = window.__fgl.exportLayer(layerId);
    // steel tint: keep luminance, shift hue cool
    const img = new Image();
    img.src = out.dataUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
      // Pixi's extract hands back premultiplied colour; un-premultiply so semi-transparent
      // layers (irisShade's soft highlight) keep their real brightness as a straight-alpha PNG.
      const a = d.data[i + 3];
      if (a > 0 && a < 255) {
        d.data[i] = Math.min(255, (d.data[i] * 255) / a);
        d.data[i + 1] = Math.min(255, (d.data[i + 1] * 255) / a);
        d.data[i + 2] = Math.min(255, (d.data[i + 2] * 255) / a);
      }
      const L = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
      d.data[i] = Math.min(255, L * 0.86);
      d.data[i + 1] = Math.min(255, L * 0.98);
      d.data[i + 2] = Math.min(255, L * 1.18);
    }
    g.putImageData(d, 0, 0);
    return { ...out, dataUrl: c.toDataURL('image/png') };
  }, id);
  writeFileSync(`${OUT}/${id}.png`, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
  manifest[id] = { file: `test-sprites/${id}.png`, width: r.width, height: r.height, pivotX: r.pivotX, pivotY: r.pivotY };
  console.log(id, r.width, '×', r.height, 'pivot', r.pivotX, r.pivotY);
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
await browser.close();
