// Builds the starter sprite set in public/assets/test-sprites/: every visual layer the app can take
// as a sprite, rendered from its procedural drawing at 2× (sprite authoring size), untinted — so the
// set looks exactly like the procedural version and replacing one file changes only that piece.
// Writes manifest.json (size + pivot per layer) and README.md (what each file is).
//
// Files you have already replaced are kept: only missing files are generated, and their manifest
// entries added. Pass --force to regenerate everything.
//
// Requires a running server:  npm run dev  (or: npm run build && npm run preview)
//   npm run test-sprites              add missing files
//   npm run test-sprites -- --force   regenerate the whole set
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.FGL_URL ?? 'http://localhost:5173';
const OUT = 'public/assets/test-sprites';
const FORCE = process.argv.includes('--force');

/** What each layer is, for the README (kept in step with src/render/layers.ts). */
const ABOUT = {
  ring: ['wheel', 'stone socket + brass rim around each wheel (fixed)'],
  disc: ['wheel', 'numbered disc, without digits (fixed; numbers are drawn in code)'],
  iris: ['wheel', 'turning plate with the window cut out (transparent wedge)'],
  irisShade: ['wheel', 'fixed light/shade over the turning plate (semi-transparent)'],
  pupil: ['wheel', 'pupil (follows the finger, scales)'],
  highlight: ['wheel', 'glint on the pupil'],
  lidTop: ['wheel', 'upper eyelid; pivot = centre of its lower edge'],
  lidBottom: ['wheel', 'lower eyelid; pivot = centre of its upper edge'],
  lockRing: ['wheel', 'brass collar that slams onto the wheel on unlock'],
  arrowCw: ['wheel', 'clockwise arrow button'],
  arrowCwPressed: ['wheel', 'clockwise arrow button, pressed'],
  arrowCcw: ['wheel', 'counter-clockwise arrow button'],
  arrowCcwPressed: ['wheel', 'counter-clockwise arrow button, pressed'],
  plateShadow: ['door', 'shadow the door casts on the wall'],
  oak: ['door', 'the wooden panel (only the wood)'],
  frame: ['door', 'brass trim around the panel, with its rivets (the panel area is transparent)'],
  straps: ['door', 'wrought-iron straps across the wood, with rivets'],
  brackets: ['door', 'iron corner brackets'],
  ornaments: ['door', 'brass filigree scrolls'],
  bezel: ['door', 'brass ring a wheel sits in — one image, placed under all 10 wheels'],
  seam: ['door', 'dark line where the door parts'],
  wall: ['scene', 'stone wall behind the door (full screen)'],
  mistTile: ['scene', 'one mist puff (used for every puff; tinted and faded in code)'],
  core: ['scene', 'gold core revealed when the door opens (glow halos stay in code)'],
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto(`${BASE}/wheel.html`);
await page.waitForFunction(() => window.__fglBoot === 'ok');
const ids = await page.evaluate(() => window.__fgl.layerIds);
mkdirSync(OUT, { recursive: true });

const manifestPath = `${OUT}/manifest.json`;
let manifest = {};
if (!FORCE && existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    manifest = {};
  }
}

let made = 0;
let kept = 0;
for (const id of ids) {
  const file = `${id}.png`;
  if (!FORCE && existsSync(`${OUT}/${file}`) && manifest[id]) {
    kept++;
    continue;
  }
  const r = await page.evaluate(async (layerId) => {
    const out = window.__fgl.exportLayer(layerId);
    // Pixi's extract returns premultiplied colour: un-premultiply so semi-transparent pixels
    // keep their real brightness in a straight-alpha PNG.
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
      const a = d.data[i + 3];
      if (a > 0 && a < 255) {
        d.data[i] = Math.min(255, (d.data[i] * 255) / a);
        d.data[i + 1] = Math.min(255, (d.data[i + 1] * 255) / a);
        d.data[i + 2] = Math.min(255, (d.data[i + 2] * 255) / a);
      }
    }
    g.putImageData(d, 0, 0);
    return { ...out, dataUrl: c.toDataURL('image/png'), px: [c.width, c.height] };
  }, id);
  writeFileSync(`${OUT}/${file}`, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
  manifest[id] = { file: `test-sprites/${file}`, width: r.width, height: r.height, pivotX: r.pivotX, pivotY: r.pivotY };
  made++;
  console.log(`${id.padEnd(16)} ${r.px[0]}×${r.px[1]} px  (logical ${r.width}×${r.height}, pivot ${r.pivotX}, ${r.pivotY})`);
}
// keep the manifest in layer order
const ordered = {};
for (const id of ids) if (manifest[id]) ordered[id] = manifest[id];
for (const [k, v] of Object.entries(manifest)) if (!(k in ordered)) ordered[k] = v;
writeFileSync(manifestPath, JSON.stringify(ordered, null, 2) + '\n');

// README: one row per layer
const rows = ids.map((id) => {
  const e = ordered[id];
  const [group, what] = ABOUT[id] ?? ['', ''];
  const px = `${Math.round(e.width * 2)}×${Math.round(e.height * 2)}`;
  const where = e.pivotX <= 0 && e.pivotY <= 0
    ? `top-left at (${-e.pivotX}, ${-e.pivotY}) on the 1280×800 canvas`
    : `pivot (${e.pivotX}, ${e.pivotY}) from its top-left`;
  return `| \`${id}.png\` | ${group} | ${what} | ${px} | ${where} |`;
});
writeFileSync(
  `${OUT}/README.md`,
  `# Starter sprite set

Every visual layer of the lock as its own image, rendered from the procedural drawing at 2× size.
Open the app with **\`?manifest=assets/test-sprites/manifest.json&sprites\`** (or switch the operator menu
to *sprites* with that manifest) and it looks exactly like the procedural version. Replace one file at
a time with your own art and only that piece changes.

**Rules**
- Keep the **same pixel size** as the file you replace. Then nothing else needs to change. If you
  change the size, update that layer's \`width\`/\`height\` (logical = pixels ÷ 2) and \`pivotX\`/\`pivotY\`
  in \`manifest.json\`.
- **Transparent PNG**, fully transparent (alpha 0) wherever the layer should not cover anything.
- The **door pieces** are positioned on the 1280×800 canvas: their pivot is minus their top-left
  position. The app splits the door into halves itself, so draw each piece whole (no left/right files).
- **No digits** in any image: the numbers are drawn in code, on top of \`disc\`.
- One light direction (top left) for every piece.
- \`glow\`, dust and sparks always stay in code.

| File | Group | What it is | Pixels (2×) | Placement |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

Regenerate missing files with \`npm run test-sprites\` (dev server running); \`-- --force\` rebuilds all
of them and overwrites your replacements.
`,
);
console.log(`\n${made} generated, ${kept} kept (already present). Manifest + README written to ${OUT}/`);
await browser.close();
