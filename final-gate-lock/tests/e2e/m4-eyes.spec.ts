import { test, expect, type Page } from '@playwright/test';
import { Touch, shot, waitForBoot } from './helpers';

type G = {
  game: {
    blinkStats: { frames: number; collisions: number; multiStartFrames: number; starts: number; maxSimultaneous: number };
    machine: { asleep: boolean; state: string };
    layers: { dim: { alpha: number } };
    clock: { now: number };
    wheels: { id: number; x: number; y: number; eye: { look: string; pose: { lidTop: number; lidBottom: number }; stateLabel(t: number): string } }[];
  };
  toClient(x: number, y: number): { x: number; y: number };
};
const g = <T>(page: Page, fn: (g: G) => T) =>
  page.evaluate(`(${fn.toString()})(window.__fgl)`) as Promise<T>;

test('no two wheels blink in the same frame over a 5-minute run', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?skip-intro&speed=10');
  await waitForBoot(page);
  // Keep the plate awake (it would fall asleep after 60 s idle and stop blinking).
  await page.evaluate(() =>
    setInterval(() => (window as unknown as { __fgl: { game: { machine: { activity(): void } } } }).__fgl.game.machine.activity(), 1000),
  );
  // 5 simulated minutes at 10× = 30 s real
  await expect
    .poll(() => g(page, (x) => x.game.clock.now), { timeout: 60_000, intervals: [1000] })
    .toBeGreaterThan(5 * 60_000);
  const s = await g(page, (x) => x.game.blinkStats);
  console.log('blink stats over 5 simulated minutes', s);
  expect(s.collisions).toBe(0);
  expect(s.multiStartFrames).toBe(0);
  expect(s.maxSimultaneous).toBeLessThanOrEqual(1);
  expect(s.starts).toBeGreaterThan(200); // ten eyes really did blink
});

test('asleep after idle: ripple of closing lids, 60% dim; any touch wakes', async ({ page }) => {
  // asleepAfterIdleMs = 60 s → 2 s at 30×
  await page.goto('/?skip-intro&speed=30');
  await waitForBoot(page);
  await expect.poll(() => g(page, (x) => x.game.machine.asleep), { timeout: 10_000 }).toBe(true);
  // mid-ripple: left wheels closed before right ones
  await page.waitForTimeout(25);
  await expect.poll(() => g(page, (x) => x.game.layers.dim.alpha), { timeout: 10_000 }).toBeGreaterThan(0.59);
  // heavy lids close slowly: wait for every eye to be shut
  await expect
    .poll(() => g(page, (x) => Math.min(...x.game.wheels.map((w) => w.eye.pose.lidTop))), { timeout: 10_000 })
    .toBeGreaterThan(0.95);
  await shot(page, 'M4-asleep');
  const touch = await Touch.create(page);
  const p = await g(page, (x) => x.toClient(640, 790));
  await touch.tap(p.x, p.y);
  await expect.poll(() => g(page, (x) => x.game.machine.asleep)).toBe(false);
  await expect.poll(() => g(page, (x) => x.game.layers.dim.alpha)).toBeLessThan(0.01);
});

test('asleep ripple runs across the plate (left closes first)', async ({ page }) => {
  await page.goto('/?skip-intro&speed=4');
  await waitForBoot(page);
  await expect.poll(() => g(page, (x) => x.game.machine.asleep), { timeout: 30_000, intervals: [50] }).toBe(true);
  await page.waitForTimeout(250); // ≈1 s of game time into the ripple
  const lids = await g(page, (x) => x.game.wheels.map((w) => ({ x: w.x, lid: w.eye.pose.lidTop })));
  const left = lids.filter((l) => l.x < 400).map((l) => l.lid);
  const right = lids.filter((l) => l.x > 900).map((l) => l.lid);
  expect(Math.min(...left)).toBeGreaterThan(Math.max(...right));
});

test('curious neighbours look toward a touched wheel; the touched one is awake', async ({ page }) => {
  await page.goto('/?skip-intro');
  await waitForBoot(page);
  await page.waitForTimeout(1500);
  const touch = await Touch.create(page);
  const p = await g(page, (x) => x.toClient(500, 420 + 40)); // wheel 5
  await touch.send('touchStart', [{ ...p, id: 1 }]);
  await page.waitForTimeout(700);
  const looks = await g(page, (x) => x.game.wheels.map((w) => [w.id, w.eye.look]));
  const map = Object.fromEntries(looks as [number, string][]);
  expect(map[5]).toBe('awake');
  for (const id of [1, 2, 4, 6, 8, 9]) expect(map[id], `wheel ${id}`).toBe('curious');
  expect(map[7]).toBe('drowsy'); // 560 px away: out of range
  await shot(page, 'M4-curious');
  await touch.send('touchEnd', []);
});
