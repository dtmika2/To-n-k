import { test, expect, type Page } from '@playwright/test';
import { Touch, shot, waitForBoot } from './helpers';

type G = {
  game: {
    blinkStats: { frames: number; collisions: number; multiStartFrames: number; starts: number; maxSimultaneous: number };
    machine: { state: string };
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
  // Keep the lock in play (it would reset to the mist after 30 s idle).
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

test('idle in Playable resets to the shrouded state', async ({ page }) => {
  // resetAfterIdleMs = 30 s → 1.5 s at 20×
  await page.goto('/?skip-intro&speed=20');
  await waitForBoot(page);
  expect(await g(page, (x) => x.game.machine.state)).toBe('Playable');
  await expect.poll(() => g(page, (x) => x.game.machine.state), { timeout: 10_000, intervals: [50] }).toBe('Reset');
  await expect.poll(() => g(page, (x) => x.game.machine.state), { timeout: 10_000 }).toBe('Shrouded');
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
