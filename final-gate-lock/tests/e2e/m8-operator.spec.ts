import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Touch, shot, waitForBoot } from './helpers';

const cfg = JSON.parse(readFileSync('public/config.json', 'utf8'));

type G = {
  game: {
    gesture: { ringProgress: number };
    config: { timings: Record<string, number> };
    wheels: { root: { children: { label: string; children: { text?: string }[] }[] } }[];
    stats: { visible: boolean };
  };
  audio: { masterVolume: number; played: string[] };
  menu: { isOpen: boolean; view: string | null };
  factory: { mode: string };
  snap(): { state: string; slots: number[] };
  toClient(x: number, y: number): { x: number; y: number };
};
const g = <T>(page: Page, fn: (g: G) => T) => page.evaluate(`(${fn.toString()})(window.__fgl)`) as Promise<T>;

async function holdCorner(page: Page, touch: Touch, ms: number, release = true) {
  const p = await g(page, (x) => x.toClient(50, 750));
  await touch.send('touchStart', [{ ...p, id: 7 }]);
  await page.waitForTimeout(ms);
  if (release) await touch.send('touchEnd', []);
}

async function openMenu(page: Page, touch: Touch, pin = cfg.operator.pin as string) {
  await holdCorner(page, touch, 1300);
  await expect(page.getByTestId('op-overlay')).toBeVisible();
  for (const d of pin) await page.getByTestId(`op-key-${d}`).click();
  await page.getByTestId('op-key-OK').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?skip-intro');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForBoot(page);
});

test('hold 1 s in the corner: the ring fills, then the PIN pad', async ({ page }) => {
  const touch = await Touch.create(page);
  const p = await g(page, (x) => x.toClient(50, 750));
  await touch.send('touchStart', [{ ...p, id: 7 }]);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('op-overlay')).toHaveCount(0);
  const k = await g(page, (x) => x.game.gesture.ringProgress);
  expect(k).toBeGreaterThan(0.2);
  expect(k).toBeLessThan(1);
  await shot(page, 'M8-hold-ring');
  await page.waitForTimeout(800);
  await expect(page.getByTestId('op-overlay')).toBeVisible();
  await touch.send('touchEnd', []);
  await shot(page, 'M8-pin-pad');
});

test('releasing early cancels; the corner never moves wheels or starts the intro', async ({ page }) => {
  await page.goto('/');
  await waitForBoot(page);
  const touch = await Touch.create(page);
  await holdCorner(page, touch, 500);
  await page.waitForTimeout(1600);
  await expect(page.getByTestId('op-overlay')).toHaveCount(0);
  expect((await g(page, (x) => x.snap())).state).toBe('Shrouded');
});

test('wrong PIN closes the pad; the right PIN opens the menu', async ({ page }) => {
  const touch = await Touch.create(page);
  await openMenu(page, touch, '1234');
  await expect(page.getByTestId('op-overlay')).toHaveCount(0);
  await openMenu(page, touch);
  await expect(page.getByTestId('op-menu')).toBeVisible();
  await shot(page, 'M8-menu');
});

test('menu actions: solution, correct−1, sound test, force open, reset', async ({ page }) => {
  const touch = await Touch.create(page);
  await openMenu(page, touch);
  // show solution: overlay the correct number on every wheel; it stays after the menu closes
  await page.getByTestId('op-solution').click();
  const labels = await g(page, (x) =>
    x.game.wheels.map((w) => w.root.children.find((c) => c.label === 'overlay')?.children[1]?.text ?? null),
  );
  expect(labels).toEqual(['9', '12', '88', '14', '5', '3', '79', '0', '6', '31']);
  await page.getByTestId('op-overlay').screenshot({ path: 'screenshots/M8-solution-menu.png' });
  // correct − 1
  await page.getByTestId('op-minus-one').click();
  const slots = (await g(page, (x) => x.snap())).slots;
  expect(slots).toEqual(cfg.wheels.map((w: { correct: number }) => (w.correct + 2) % 3));
  // sound test plays cues
  await page.getByTestId('op-sound-test').click();
  await page.waitForTimeout(1600);
  expect((await g(page, (x) => x.audio.played)).filter((c) => c !== 'operator_beep').length).toBeGreaterThan(1);
  // the solution stays after closing, until switched off
  await page.getByTestId('op-close').click();
  await expect(page.getByTestId('op-overlay')).toHaveCount(0);
  expect(await g(page, (x) => x.game.wheels.every((w) => w.root.children.some((c) => c.label === 'overlay')))).toBe(true);
  await openMenu(page, touch);
  await expect(page.getByTestId('op-solution')).toHaveText('Show solution: ON');
  await page.getByTestId('op-solution').click();
  await page.getByTestId('op-close').click();
  expect(await g(page, (x) => x.game.wheels.some((w) => w.root.children.some((c) => c.label === 'overlay')))).toBe(false);
  await shot(page, 'M8-correct-minus-one');
  // force open
  await openMenu(page, touch);
  await page.getByTestId('op-force-open').click();
  expect((await g(page, (x) => x.snap())).state).toBe('Success');
  // reset
  await openMenu(page, touch);
  await page.getByTestId('op-reset').click();
  expect((await g(page, (x) => x.snap())).state).toBe('Reset');
  await expect.poll(() => g(page, (x) => x.snap().state), { timeout: 10_000 }).toBe('Shrouded');
});

test('volume, visual mode, FPS and timings persist across reloads', async ({ page }) => {
  const touch = await Touch.create(page);
  await openMenu(page, touch);
  await page.getByTestId('op-volume').fill('35');
  await page.getByTestId('op-fps').click();
  await page.getByTestId('op-mode-sprites').click();
  await page.getByTestId('op-t-resetAfterSuccessMs').fill('25');
  await page.getByTestId('op-t-resetAfterSuccessMs').dispatchEvent('change');
  expect(await g(page, (x) => x.audio.masterVolume)).toBeCloseTo(0.35);
  expect(await g(page, (x) => x.game.config.timings.resetAfterSuccessMs)).toBe(25000);
  await page.getByTestId('op-close').click();
  await page.reload();
  await waitForBoot(page);
  expect(await g(page, (x) => x.audio.masterVolume)).toBeCloseTo(0.35);
  expect(await g(page, (x) => x.factory.mode)).toBe('sprites');
  expect(await g(page, (x) => x.game.stats.visible)).toBe(true);
  expect(await g(page, (x) => x.game.config.timings.resetAfterSuccessMs)).toBe(25000);
  await expect(page.getByTestId('fps')).toBeVisible();
  // config.json itself is untouched
  const served = await (await page.request.get('/config.json')).json();
  expect(served.timings.resetAfterSuccessMs).toBe(20000);
});

test('menu auto-closes after 60 s without input', async ({ page }) => {
  await page.goto('/?skip-intro&speed=20');
  await waitForBoot(page);
  const touch = await Touch.create(page);
  // 1 s hold at 20× = 50 ms
  await holdCorner(page, touch, 400);
  for (const d of cfg.operator.pin as string) await page.getByTestId(`op-key-${d}`).click();
  await page.getByTestId('op-key-OK').click();
  await expect(page.getByTestId('op-menu')).toBeVisible();
  await page.waitForTimeout(1500); // 30 s game time: still open
  await expect(page.getByTestId('op-menu')).toBeVisible();
  await page.getByTestId('op-fps').click(); // input restarts the 60 s
  await page.waitForTimeout(2000); // 40 s since input
  await expect(page.getByTestId('op-menu')).toBeVisible();
  await expect(page.getByTestId('op-overlay')).toHaveCount(0, { timeout: 4000 });
});
