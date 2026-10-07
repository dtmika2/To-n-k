/**
 * Sprite pipeline (M9). The test builds its own sprite set in memory: every layer rendered from its
 * procedural drawing at 2× and tinted steel (so a mode switch visibly changes the look), served under
 * a private URL. It never reads public/assets/test-sprites/, which is the artist's working folder.
 */
import { test, expect, type Page, type Browser } from '@playwright/test';
import { Touch, waitForBoot } from './helpers';

const MANIFEST = 'assets/__ci__/manifest.json';
const WHEEL_LAYERS = ['ring', 'disc', 'iris', 'irisShade', 'pupil', 'highlight', 'lidTop', 'lidBottom', 'arrowCw', 'arrowCcw', 'lockRing'];
const DOOR_LAYERS = ['plateShadow', 'oak', 'frame', 'straps', 'brackets', 'ornaments', 'bezel', 'seam'];

// no service worker: requests must reach the test's routes
test.use({ serviceWorkers: 'block' });

type Fgl = {
  factory: { mode: string; setMode(m: string): Promise<void>; dropSprite(id: string): void };
  clock: { speed: number };
  game: { wheels: { x: number; y: number; root: unknown; restSlot: number; atRest: boolean }[]; layers: { plateLeft: unknown; plateRight: unknown } };
  toClient(x: number, y: number): { x: number; y: number };
  arrow(id: number, dir: string): { x: number; y: number };
  stage: { scale: number; offsetX: number; offsetY: number };
};
const g = <T>(page: Page, fn: (g: Fgl) => T | Promise<T>) => page.evaluate(`(${fn.toString()})(window.__fgl)`) as Promise<T>;

let files: Map<string, Buffer>;
let manifest: Record<string, unknown>;

/** Render every layer at 2×, tint it steel, un-premultiply, keep the pivot. */
async function buildFixture(browser: Browser) {
  const page = await browser.newPage();
  await page.goto('/wheel.html');
  await waitForBoot(page);
  const ids: string[] = await page.evaluate(() => (window as unknown as { __fgl: { layerIds: string[] } }).__fgl.layerIds);
  files = new Map();
  manifest = {};
  for (const id of ids) {
    const r = await page.evaluate(async (layerId) => {
      const out = (window as unknown as { __fgl: { exportLayer(id: string): { dataUrl: string; width: number; height: number; pivotX: number; pivotY: number } } }).__fgl.exportLayer(layerId);
      const img = new Image();
      img.src = out.dataUrl;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const a = d.data[i + 3];
        if (a > 0 && a < 255) for (let k = 0; k < 3; k++) d.data[i + k] = Math.min(255, (d.data[i + k] * 255) / a);
        const L = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        d.data[i] = Math.min(255, L * 0.86);
        d.data[i + 1] = Math.min(255, L * 0.98);
        d.data[i + 2] = Math.min(255, L * 1.18);
      }
      ctx.putImageData(d, 0, 0);
      return { ...out, dataUrl: c.toDataURL('image/png') };
    }, id);
    files.set(`${id}.png`, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    manifest[id] = { file: `__ci__/${id}.png`, width: r.width, height: r.height, pivotX: r.pivotX, pivotY: r.pivotY };
  }
  await page.close();
}

async function serveFixture(page: Page, missing: string[] = []) {
  await page.route('**/assets/__ci__/**', async (route) => {
    const name = route.request().url().split('/assets/__ci__/')[1].split('?')[0];
    if (name === 'manifest.json') return route.fulfill({ json: manifest });
    if (missing.includes(name)) return route.fulfill({ status: 404, body: '' });
    const body = files.get(name);
    return body ? route.fulfill({ status: 200, contentType: 'image/png', body }) : route.fulfill({ status: 404, body: '' });
  });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  await buildFixture(browser);
});

const frames = (page: Page, n = 3) =>
  page.evaluate((k) => new Promise<void>((r) => {
    let i = 0;
    const f = () => (++i >= k ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);

/** Labels of the layer inside every slot of wheel `i` (e.g. "ring:sprite"). */
const layerLabels = (page: Page, i = 0) =>
  page.evaluate((idx) => {
    const out: Record<string, string> = {};
    const walk = (c: { label?: string; children?: unknown[] }) => {
      if (c.label?.startsWith('slot:')) {
        const child = (c.children?.[0] as { label?: string }) ?? {};
        out[c.label.slice(5)] = child.label ?? '';
      }
      for (const ch of (c.children ?? []) as { label?: string; children?: unknown[] }[]) walk(ch);
    };
    walk((window as unknown as { __fgl: Fgl }).__fgl.game.wheels[idx].root as never);
    return out;
  }, i);

/** How each door layer is drawn in the left half: { oak: 'sprite' | 'procedural', … } (bezel counted once). */
const doorLabels = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, string> = {};
    const half = (window as unknown as { __fgl: Fgl }).__fgl.game.layers.plateLeft as { children: { children: { children: { label: string }[] }[] }[] };
    for (const ch of half.children[0].children[0].children) {
      const [id, kind] = ch.label.split(':');
      out[id] = kind;
    }
    return out;
  });

/** Transforms of every slot container of every wheel (must not change between modes). */
const transforms = (page: Page) =>
  page.evaluate(() => {
    const out: number[] = [];
    const walk = (c: { label?: string; children?: unknown[]; worldTransform?: { a: number; b: number; c: number; d: number; tx: number; ty: number } }) => {
      if (c.label?.startsWith('slot:') && c.worldTransform) {
        const m = c.worldTransform;
        out.push(m.a, m.b, m.c, m.d, m.tx, m.ty);
      }
      for (const ch of (c.children ?? []) as never[]) walk(ch);
    };
    for (const w of (window as unknown as { __fgl: Fgl }).__fgl.game.wheels) walk(w.root as never);
    return out.map((v) => Math.round(v * 1000) / 1000);
  });

/**
 * Compare two screenshots: tint A with the steel transform, then compare luminance.
 * `region`: 'eyes' (inside every wheel) or 'scene' (the whole screen).
 */
async function compare(page: Page, a: Buffer, b: Buffer, region: 'eyes' | 'scene', shiftB = 0) {
  return page.evaluate(
    async ([ab, bb, shift, reg]) => {
      const load = async (b64: string) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      };
      const A = await load(ab as string);
      const B = await load(bb as string);
      const fgl = (window as unknown as { __fgl: Fgl }).__fgl;
      const dpr = A.width / innerWidth;
      const lum = (d: Uint8ClampedArray, i: number, tint: boolean) => {
        let r = d[i], gg = d[i + 1], bl = d[i + 2];
        if (tint) {
          const L = 0.299 * r + 0.587 * gg + 0.114 * bl;
          r = Math.min(255, L * 0.86);
          gg = Math.min(255, L * 0.98);
          bl = Math.min(255, L * 1.18);
        }
        return 0.299 * r + 0.587 * gg + 0.114 * bl;
      };
      let sum = 0, n = 0, bad = 0, blueA = 0, blueB = 0;
      const sample = (x: number, y: number) => {
        const ia = (y * A.width + x) * 4;
        const ib = (y * B.width + x + (shift as number)) * 4;
        const d = Math.abs(lum(A.data, ia, true) - lum(B.data, ib, false));
        sum += d;
        n++;
        if (d > 40) bad++;
        blueA += A.data[ia + 2] - A.data[ia];
        blueB += B.data[ib + 2] - B.data[ib];
      };
      if (reg === 'eyes') {
        for (const w of fgl.game.wheels) {
          const c = fgl.toClient(w.x, w.y);
          const cx = c.x * dpr, cy = c.y * dpr;
          const R = 70 * fgl.stage.scale * dpr;
          for (let y = Math.floor(cy - R); y < cy + R; y += 2)
            for (let x = Math.floor(cx - R); x < cx + R; x += 2) if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) sample(x, y);
        }
      } else {
        for (let y = 10; y < A.height - 10; y += 3) for (let x = 10; x < A.width - 10; x += 3) sample(x, y);
      }
      return { mean: sum / n, badShare: bad / n, coolerA: blueA / n, coolerB: blueB / n };
    },
    [a.toString('base64'), b.toString('base64'), shiftB, region] as const,
  );
}

async function setup(page: Page) {
  await serveFixture(page);
  await page.goto(`/?skip-intro&manifest=${MANIFEST}`);
  await waitForBoot(page);
  await page.waitForTimeout(3000); // let eyes settle into drowsy
  await g(page, (x) => {
    x.clock.speed = 0; // freeze every animation so both modes show the identical pose
  });
  await frames(page);
}

test('every layer — wheels, door, wall — lines up with its procedural drawing: screenshot diff', async ({ page }) => {
  await setup(page);
  const before = await transforms(page);
  const a = await page.screenshot();
  await g(page, (x) => x.factory.setMode('sprites'));
  await frames(page, 5);
  const labels = await layerLabels(page);
  for (const id of WHEEL_LAYERS) expect(labels[id], id).toBe(`${id}:sprite`);
  expect(labels.glow).toBe('glow:procedural'); // always procedural
  const door = await doorLabels(page);
  for (const id of DOOR_LAYERS) expect(door[id], id).toBe('sprite');
  const b = await page.screenshot({ path: 'screenshots/M9-sprites-mode.png' });
  // motion/transforms are untouched by the mode switch
  expect(await transforms(page)).toEqual(before);
  const eyes = await compare(page, a, b, 'eyes');
  const scene = await compare(page, a, b, 'scene');
  const shifted = await compare(page, a, b, 'eyes', 4); // 2 logical px off, as a sensitivity control
  console.log({ eyes, scene, shifted });
  expect(eyes.mean).toBeLessThan(4);
  expect(eyes.badShare).toBeLessThan(0.01);
  expect(scene.mean).toBeLessThan(4);
  expect(scene.badShare).toBeLessThan(0.01);
  expect(shifted.mean).toBeGreaterThan(eyes.mean * 2);
  // and the look really changed (steel is cooler than brass and oak)
  expect(eyes.coolerB).toBeGreaterThan(eyes.coolerA + 20);
  await g(page, (x) => x.factory.setMode('procedural'));
  await frames(page);
  expect((await layerLabels(page)).ring).toBe('ring:procedural');
  expect((await doorLabels(page)).oak).toBe('procedural');
});

test('removing any single sprite falls back cleanly to procedural for that layer only', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await g(page, (x) => x.factory.setMode('sprites'));
  await frames(page);
  for (const id of [...WHEEL_LAYERS, ...DOOR_LAYERS]) {
    await page.evaluate((layer) => (window as unknown as { __fgl: Fgl }).__fgl.factory.dropSprite(layer), id);
    await frames(page);
    const all = { ...Object.fromEntries(Object.entries(await layerLabels(page)).map(([k, v]) => [k, v.split(':')[1]])), ...(await doorLabels(page)) };
    expect(all[id], id).toBe('procedural');
    for (const other of [...WHEEL_LAYERS, ...DOOR_LAYERS].filter((o) => o !== id)) expect(all[other], `${other} after dropping ${id}`).toBe('sprite');
    await g(page, (x) => x.factory.setMode('sprites')); // reload the dropped sprite
    await frames(page);
  }
  expect(errors).toEqual([]);
});

test('a missing sprite file at load time falls back for that layer; motion still works', async ({ page }) => {
  await serveFixture(page, ['iris.png', 'oak.png']);
  await page.goto(`/?skip-intro&sprites&manifest=${MANIFEST}`);
  await waitForBoot(page);
  await frames(page, 5);
  const labels = await layerLabels(page);
  expect(labels.iris).toBe('iris:procedural');
  expect(labels.ring).toBe('ring:sprite');
  const door = await doorLabels(page);
  expect(door.oak).toBe('procedural');
  expect(door.frame).toBe('sprite');
  // motion works the same in sprite mode: one arrow tap = one slot
  const before = await g(page, (x) => x.game.wheels[0].restSlot);
  const touch = await Touch.create(page);
  const p = await g(page, (x) => {
    const a = x.arrow(1, 'cw');
    return x.toClient(a.x, a.y);
  });
  await touch.tap(p.x, p.y);
  await expect.poll(() => g(page, (x) => x.game.wheels[0].restSlot)).toBe((before + 1) % 3);
});

test('operator menu switches the visual mode', async ({ page }) => {
  await serveFixture(page);
  await page.goto(`/?skip-intro&manifest=${MANIFEST}`);
  await page.evaluate(() => localStorage.clear());
  await waitForBoot(page);
  const touch = await Touch.create(page);
  const c = await g(page, (x) => x.toClient(50, 750));
  await touch.send('touchStart', [{ ...c, id: 3 }]);
  await page.waitForTimeout(3300);
  await touch.send('touchEnd', []);
  for (const d of '1907') await page.getByTestId(`op-key-${d}`).click();
  await page.getByTestId('op-key-OK').click();
  await page.getByTestId('op-mode-sprites').click();
  await expect.poll(async () => (await layerLabels(page)).iris).toBe('iris:sprite');
  await expect.poll(async () => (await doorLabels(page)).oak).toBe('sprite');
  await page.getByTestId('op-mode-procedural').click();
  await expect.poll(async () => (await layerLabels(page)).iris).toBe('iris:procedural');
  await page.evaluate(() => localStorage.clear());
});
