import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Touch, shot, waitForBoot } from './helpers';

const cfg = JSON.parse(readFileSync('public/config.json', 'utf8'));

type Diag = { objects: number; tweens: number; timers: number; splitTextures: number; motes: number };
type G = {
  game: {
    stateLog: { state: string; t: number }[];
    layers: { veil: { alpha: number }; plate: { visible: boolean } };
    split: { active: boolean };
    wheels: { body: { scale: { x: number } }; arrows: { alpha: number } }[];
    machine: { loops: number };
  };
  snap(): { state: string; slots: number[]; atRest: boolean; loops: number };
  diag(): Diag;
  toClient(x: number, y: number): { x: number; y: number };
  arrow(id: number, dir: string): { x: number; y: number };
};
const g = <T>(page: Page, fn: (g: G) => T) => page.evaluate(`(${fn.toString()})(window.__fgl)`) as Promise<T>;
const state = async (page: Page) => (await g(page, (x) => x.snap())).state;

async function oneLoop(page: Page, touch: Touch) {
  expect(await state(page)).toBe('Shrouded');
  const c = await g(page, (x) => x.toClient(640, 400));
  await touch.tap(c.x, c.y);
  await expect.poll(() => state(page), { timeout: 15_000, intervals: [50] }).toBe('Playable');
  // ?solve: wheel 10 is one cw step from correct
  const a = await g(page, (x) => {
    const p = x.arrow(10, 'cw');
    return x.toClient(p.x, p.y);
  });
  await touch.tap(a.x, a.y);
  await expect.poll(() => state(page), { timeout: 15_000, intervals: [50] }).toBe('Open');
  await expect.poll(() => state(page), { timeout: 30_000, intervals: [50] }).toBe('Shrouded');
}

async function heapMB(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
  await cdp.detach();
  return usedSize / 1024 / 1024;
}

test('success → open (40 s hold) → reset timings, and a clean restore', async ({ page }) => {
  await page.goto('/?solve&speed=20');
  await waitForBoot(page);
  const touch = await Touch.create(page);
  await oneLoop(page, touch);
  const log = await g(page, (x) => x.game.stateLog);
  const t = (s: string) => log.find((e) => e.state === s)!.t;
  const success = t('Open') - t('Success');
  const hold = t('Reset') - t('Open');
  const reset = t('Shrouded') - t('Reset');
  console.log({ success, hold, reset });
  expect(success).toBeGreaterThan(6900);
  expect(success).toBeLessThan(7600);
  expect(hold).toBeGreaterThan(39_900);
  expect(hold).toBeLessThan(40_800);
  expect(reset).toBeGreaterThan(2900);
  expect(reset).toBeLessThan(3600);
  // restored off-screen: wheels on their (?solve) start slots, unlock visuals gone
  const s = await g(page, (x) => x.snap());
  const expected = cfg.wheels.map((w: { correct: number }) => w.correct);
  expected[9] = (cfg.wheels[9].correct + 2) % 3;
  expect(s.slots).toEqual(expected);
  expect(await g(page, (x) => x.game.split.active)).toBe(false);
  expect(await g(page, (x) => x.game.layers.plate.visible)).toBe(true);
  expect(await g(page, (x) => x.game.layers.veil.alpha)).toBe(1);
  expect(await g(page, (x) => x.game.wheels.every((w) => w.body.scale.x === 1 && w.arrows.alpha === 1))).toBe(true);
  expect((await g(page, (x) => x.diag())).splitTextures).toBe(0);
});

test('players never see wheels move back: veil is fully closed before the restore', async ({ page }) => {
  await page.goto('/?solve&speed=10');
  await waitForBoot(page);
  // record veil alpha at the moment the split ends (restore)
  await page.evaluate(() => {
    const fgl = (window as unknown as { __fgl: { game: { restoreAfterUnlock(): void; layers: { veil: { alpha: number } } } } }).__fgl;
    const orig = fgl.game.restoreAfterUnlock.bind(fgl.game);
    (window as unknown as { veilAtRestore: number[] }).veilAtRestore = [];
    fgl.game.restoreAfterUnlock = () => {
      (window as unknown as { veilAtRestore: number[] }).veilAtRestore.push(fgl.game.layers.veil.alpha);
      orig();
    };
  });
  const touch = await Touch.create(page);
  await oneLoop(page, touch);
  const v = await page.evaluate(() => (window as unknown as { veilAtRestore: number[] }).veilAtRestore);
  expect(v).toEqual([1]);
});

test('full loop Shrouded → solve → Open → Shrouded runs 20 times without memory growth', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?solve&speed=20');
  await waitForBoot(page);
  const touch = await Touch.create(page);
  const samples: { loop: number; heap: number; diag: Diag }[] = [];
  for (let i = 1; i <= 20; i++) {
    await oneLoop(page, touch);
    if (i === 1) await shot(page, 'M6-loop-back-to-shrouded');
    if (i === 2 || i === 10 || i === 20) samples.push({ loop: i, heap: await heapMB(page), diag: await g(page, (x) => x.diag()) });
  }
  console.table(samples.map((s) => ({ loop: s.loop, heapMB: s.heap.toFixed(2), ...s.diag })));
  expect(await g(page, (x) => x.game.machine.loops)).toBe(20);
  const first = samples[0];
  const last = samples[samples.length - 1];
  // no GPU snapshot textures alive, no lingering particles / tweens / timers
  expect(last.diag.splitTextures).toBe(0);
  expect(last.diag.motes).toBe(0);
  expect(last.diag.objects).toBe(first.diag.objects);
  expect(last.diag.tweens).toBeLessThanOrEqual(first.diag.tweens + 2);
  expect(last.diag.timers).toBeLessThanOrEqual(first.diag.timers + 2);
  // JS heap: allow a little noise (state log grows by 6 entries per loop)
  expect(last.heap - first.heap).toBeLessThan(3);
});
