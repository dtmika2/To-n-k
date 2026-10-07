import { test, expect, type Page } from '@playwright/test';
import { Touch, waitForBoot } from './helpers';

const MANIFEST = 'assets/test-sprites/manifest.json';
const WHEEL_LAYERS = ['ring', 'disc', 'iris', 'irisShade', 'pupil', 'highlight', 'lidTop', 'lidBottom', 'arrowCw', 'arrowCcw', 'lockRing'];

type Fgl = {
  factory: { mode: string; setMode(m: string): Promise<void>; dropSprite(id: string): void; revision: number };
  clock: { speed: number };
  game: { wheels: { x: number; y: number; root: unknown; restSlot: number; atRest: boolean }[] };
  toClient(x: number, y: number): { x: number; y: number };
  arrow(id: number, dir: string): { x: number; y: number };
  stage: { scale: number; offsetX: number; offsetY: number };
};
const g = <T>(page: Page, fn: (g: Fgl) => T | Promise<T>) => page.evaluate(`(${fn.toString()})(window.__fgl)`) as Promise<T>;

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
 * Compare two screenshots inside the wheel discs: tint A with the same steel transform the sprite
 * generator used, then compare luminance. Returns mean |ΔL| and the share of pixels with |ΔL| > 40.
 */
async function compare(page: Page, a: Buffer, b: Buffer, shiftB = 0) {
  return page.evaluate(
    async ([ab, bb, shift]) => {
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
        let r = d[i], gg = d[i + 1], b = d[i + 2];
        if (tint) {
          const L = 0.299 * r + 0.587 * gg + 0.114 * b;
          r = Math.min(255, L * 0.86);
          gg = Math.min(255, L * 0.98);
          b = Math.min(255, L * 1.18);
        }
        return 0.299 * r + 0.587 * gg + 0.114 * b;
      };
      let sum = 0, n = 0, bad = 0, blueA = 0, blueB = 0;
      for (const w of fgl.game.wheels) {
        const c = fgl.toClient(w.x, w.y);
        const cx = c.x * dpr, cy = c.y * dpr;
        const R = 70 * fgl.stage.scale * dpr; // inside the eye; arrows are checked separately by labels
        for (let y = Math.floor(cy - R); y < cy + R; y += 2) {
          for (let x = Math.floor(cx - R); x < cx + R; x += 2) {
            if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
            const ia = (y * A.width + x) * 4;
            const ib = (y * B.width + x + (shift as number)) * 4;
            const d = Math.abs(lum(A.data, ia, true) - lum(B.data, ib, false));
            sum += d;
            n++;
            if (d > 40) bad++;
            blueA += A.data[ia + 2] - A.data[ia];
            blueB += B.data[ib + 2] - B.data[ib];
          }
        }
      }
      return { mean: sum / n, badShare: bad / n, coolerA: blueA / n, coolerB: blueB / n };
    },
    [a.toString('base64'), b.toString('base64'), shiftB] as const,
  );
}

async function setup(page: Page) {
  await page.goto(`/?skip-intro&manifest=${MANIFEST}`);
  await waitForBoot(page);
  await page.waitForTimeout(2500); // let eyes settle into drowsy
  await g(page, (x) => {
    x.clock.speed = 0; // freeze every animation so both modes show the identical pose
  });
  await frames(page);
}

test('sprite layers line up with the procedural ones (pivots, masks): screenshot diff', async ({ page }) => {
  await setup(page);
  const before = await transforms(page);
  const a = await page.screenshot();
  await g(page, (x) => x.factory.setMode('sprites'));
  await frames(page);
  const labels = await layerLabels(page);
  for (const id of WHEEL_LAYERS) expect(labels[id], id).toBe(`${id}:sprite`);
  expect(labels.glow).toBe('glow:procedural'); // always procedural
  const b = await page.screenshot({ path: 'screenshots/M9-sprites-mode.png' });
  // motion/transforms are untouched by the mode switch
  expect(await transforms(page)).toEqual(before);
  const same = await compare(page, a, b);
  const shifted = await compare(page, a, b, 4); // 2 logical px off, as a sensitivity control
  console.log({ same, shifted });
  expect(same.mean).toBeLessThan(4);
  expect(same.badShare).toBeLessThan(0.01);
  expect(shifted.mean).toBeGreaterThan(same.mean * 2);
  // and the look really changed (steel is cooler than brass)
  expect(same.coolerB).toBeGreaterThan(same.coolerA - 1);
  await g(page, (x) => x.factory.setMode('procedural'));
  await frames(page);
  expect((await layerLabels(page)).ring).toBe('ring:procedural');
});

test('removing any single sprite falls back cleanly to procedural for that layer only', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await g(page, (x) => x.factory.setMode('sprites'));
  await frames(page);
  for (const id of WHEEL_LAYERS) {
    await page.evaluate((layer) => (window as unknown as { __fgl: Fgl }).__fgl.factory.dropSprite(layer), id);
    await frames(page);
    const labels = await layerLabels(page);
    expect(labels[id], id).toBe(`${id}:procedural`);
    for (const other of WHEEL_LAYERS.filter((o) => o !== id)) expect(labels[other], `${other} after dropping ${id}`).toBe(`${other}:sprite`);
    await g(page, (x) => x.factory.setMode('sprites')); // reload the dropped sprite
    await frames(page);
  }
  expect(errors).toEqual([]);
});

test('a missing sprite file at load time falls back for that layer; motion still works', async ({ page }) => {
  await page.route('**/assets/test-sprites/iris.png', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto(`/?skip-intro&sprites&manifest=${MANIFEST}`);
  await waitForBoot(page);
  await frames(page, 5);
  const labels = await layerLabels(page);
  expect(labels.iris).toBe('iris:procedural');
  expect(labels.ring).toBe('ring:sprite');
  // motion works the same in sprite mode: one arrow tap = one slot
  const before = await g(page, (x) => x.game.wheels[0].restSlot);
  const touch = await Touch.create(page);
  const p = await g(page, (x) => {
    const a = x.arrow(1, 'cw');
    return x.toClient(a.x, a.y);
  });
  await touch.tap(p.x, p.y);
  await expect.poll(() => g(page, (x) => x.game.wheels[0].atRest)).toBe(true);
  await page.waitForTimeout(300);
  expect(await g(page, (x) => x.game.wheels[0].restSlot)).toBe((before + 1) % 3);
});

test('operator menu switches the visual mode', async ({ page }) => {
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
  await page.getByTestId('op-mode-procedural').click();
  await expect.poll(async () => (await layerLabels(page)).iris).toBe('iris:procedural');
  await page.evaluate(() => localStorage.clear());
});
