import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Touch, shot, waitForBoot } from './helpers';

const cfg = JSON.parse(readFileSync('public/config.json', 'utf8'));

type G = {
  game: {
    stateLog: { state: string; t: number }[];
    layers: { veil: { alpha: number } };
    mist: { density: number };
    glimmers: { level: number };
    wheels: { eye: { mode: string } }[];
  };
  snap(): { state: string; slots: number[]; atRest: boolean };
  toClient(x: number, y: number): { x: number; y: number };
  arrow(id: number, dir: string): { x: number; y: number };
};
const g = <T>(page: Page, fn: (g: G) => T) => page.evaluate(`(${fn.toString()})(window.__fgl)`) as Promise<T>;

test('Shrouded → tap → intro (~5 s, input ignored) → Playable on the start slots', async ({ page }) => {
  await page.goto('/');
  await waitForBoot(page);
  expect((await g(page, (x) => x.snap())).state).toBe('Shrouded');
  expect(await g(page, (x) => x.game.layers.veil.alpha)).toBe(1);
  expect(await g(page, (x) => x.game.wheels.every((w) => w.eye.mode === 'shut'))).toBe(true);
  await page.waitForTimeout(1200);
  await shot(page, 'M5-shrouded');

  const touch = await Touch.create(page);
  const tap = await g(page, (x) => x.toClient(380, 300));
  await touch.tap(tap.x, tap.y);
  expect((await g(page, (x) => x.snap())).state).toBe('Intro');

  // input during the intro is ignored: hammer an arrow
  await page.waitForTimeout(600);
  const arrow = await g(page, (x) => {
    const a = x.arrow(1, 'cw');
    return x.toClient(a.x, a.y);
  });
  for (let i = 0; i < 4; i++) await touch.tap(arrow.x, arrow.y);
  await shot(page, 'M5-intro-early');
  await page.waitForTimeout(1600);
  await shot(page, 'M5-intro-mid');

  await expect.poll(async () => (await g(page, (x) => x.snap())).state, { timeout: 10_000 }).toBe('Playable');
  const s = await g(page, (x) => x.snap());
  expect(s.slots).toEqual(cfg.wheels.map((w: { start: number }) => w.start));
  expect(s.atRest).toBe(true);
  const log = await g(page, (x) => x.game.stateLog);
  const intro = log.find((e) => e.state === 'Intro')!;
  const play = log.find((e) => e.state === 'Playable')!;
  const dur = play.t - intro.t;
  console.log('intro duration (game ms)', dur);
  expect(dur).toBeGreaterThan(4800);
  expect(dur).toBeLessThan(5600);
  expect(await g(page, (x) => x.game.layers.veil.alpha)).toBe(0);
  expect(await g(page, (x) => x.game.glimmers.level)).toBe(0);
  await expect.poll(() => g(page, (x) => x.game.mist.density)).toBeLessThan(0.05);
  await page.waitForTimeout(800);
  await shot(page, 'M5-playable');
});

test('a second tap during Shrouded-to-Intro does not restart the intro', async ({ page }) => {
  await page.goto('/?speed=4');
  await waitForBoot(page);
  const touch = await Touch.create(page);
  const p = await g(page, (x) => x.toClient(640, 400));
  await touch.tap(p.x, p.y);
  await touch.tap(p.x, p.y);
  await expect.poll(async () => (await g(page, (x) => x.snap())).state, { timeout: 10_000 }).toBe('Playable');
  const states = (await g(page, (x) => x.game.stateLog)).map((e) => e.state);
  expect(states).toEqual(['Intro', 'Playable']);
});

test('frame time stays within budget with mist + all eyes idle', async ({ page }) => {
  await page.goto('/?skip-intro');
  await waitForBoot(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as unknown as { __fgl: { stats: { reset(): void } } }).__fgl.stats.reset());
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => (window as unknown as { __fgl: { stats: { summary(): object } } }).__fgl.stats.summary());
  console.log('idle frame stats', s);
  expect((s as { avg: number }).avg).toBeLessThan(16.9);
});
