import { test, expect, type Page } from '@playwright/test';
import { Touch, shot, waitForBoot } from './helpers';

const STEP = (2 * Math.PI) / 3;

type W = {
  restSlot: number;
  angle: number;
  atRest: boolean;
  discRot: { rotation: number; children: { children: { rotation: number; children: { label: string }[] }[] }[] };
};

async function wheel(page: Page) {
  return page.evaluate(() => {
    const w = (window as unknown as { __fgl: { wheel: W } }).__fgl.wheel;
    const numerals = w.discRot.children[1].children;
    const upright = numerals[w.restSlot].rotation + w.discRot.rotation;
    return {
      restSlot: w.restSlot,
      angle: w.angle,
      atRest: w.atRest,
      // distance of the angle from the nearest detent
      detentError: Math.abs(w.angle / ((2 * Math.PI) / 3) - Math.round(w.angle / ((2 * Math.PI) / 3))),
      uprightError: Math.abs(Math.atan2(Math.sin(upright), Math.cos(upright))),
      marks: numerals.map((n) => n.children.some((c) => c.label === 'mark69')),
    };
  });
}

async function client(page: Page, x: number, y: number) {
  return page.evaluate(([lx, ly]) => (window as unknown as { __fgl: { toClient: (a: number, b: number) => { x: number; y: number } } }).__fgl.toClient(lx, ly), [x, y]);
}

async function waitRest(page: Page) {
  await expect.poll(async () => (await wheel(page)).atRest, { timeout: 5000 }).toBe(true);
}

/** Drag a finger around the wheel centre from angle a0 to a1 (radians) at radius r (wheel-local). */
async function dragArc(page: Page, touch: Touch, a0: number, a1: number, steps: number, stepMs: number, r = 55) {
  const pt = async (a: number) => client(page, Math.cos(a) * r, Math.sin(a) * r);
  const p0 = await pt(a0);
  await touch.send('touchStart', [{ ...p0, id: 1 }]);
  for (let i = 1; i <= steps; i++) {
    const p = await pt(a0 + ((a1 - a0) * i) / steps);
    await touch.send('touchMove', [{ ...p, id: 1 }]);
    if (stepMs) await page.waitForTimeout(stepMs);
  }
  await touch.send('touchEnd', []);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/wheel.html');
  await waitForBoot(page);
  await page.waitForTimeout(300);
});

test('wheel renders with the numeral upright in the window; 6 is marked', async ({ page }) => {
  const w = await wheel(page);
  expect(w.restSlot).toBe(0);
  expect(w.uprightError).toBeLessThan(1e-6);
  // values on the dev page are [52, 6, 14]: only the 6 carries the mark
  expect(w.marks).toEqual([false, true, false]);
  await shot(page, 'M2-wheel-drowsy');
});

test('arrow taps rotate one slot; numerals rest upright', async ({ page }) => {
  const touch = await Touch.create(page);
  const cw = await client(page, 46, -108);
  const ccw = await client(page, -46, -108);
  await touch.tap(cw.x, cw.y);
  await waitRest(page);
  let w = await wheel(page);
  expect(w.restSlot).toBe(2); // cw: slot − 1
  expect(w.detentError).toBeLessThan(1e-9);
  expect(w.uprightError).toBeLessThan(1e-6);
  await touch.tap(ccw.x, ccw.y);
  await waitRest(page);
  await touch.tap(ccw.x, ccw.y);
  await waitRest(page);
  w = await wheel(page);
  expect(w.restSlot).toBe(1);
  expect(w.uprightError).toBeLessThan(1e-6);
  await shot(page, 'M2-wheel-after-arrows');
});

test('rapid taps queue at most one extra step', async ({ page }) => {
  const touch = await Touch.create(page);
  const cw = await client(page, 46, -108);
  for (let i = 0; i < 4; i++) await touch.tap(cw.x, cw.y); // all within the 250 ms animation
  await waitRest(page);
  const w = await wheel(page);
  // slot 0 → two cw steps → slot 1
  expect(w.restSlot).toBe(1);
});

test('drag follows the finger and snaps to the nearest slot', async ({ page }) => {
  const touch = await Touch.create(page);
  // slow drag of +100° clockwise → nearest detent is +120° → one cw slot
  await dragArc(page, touch, 0, (100 * Math.PI) / 180, 20, 20);
  await waitRest(page);
  let w = await wheel(page);
  expect(w.restSlot).toBe(2);
  expect(w.detentError).toBeLessThan(1e-9);
  // slow drag of −50° → back to nearest detent (no change)
  await dragArc(page, touch, 0, (-50 * Math.PI) / 180, 15, 20);
  await waitRest(page);
  w = await wheel(page);
  expect(w.restSlot).toBe(2);
});

test('a fast flick may advance one extra slot, never more', async ({ page }) => {
  const touch = await Touch.create(page);
  const before = await wheel(page);
  // 70° in a quick flick (few ms per step)
  await dragArc(page, touch, 0, (70 * Math.PI) / 180, 6, 4);
  await waitRest(page);
  const w = await wheel(page);
  const moved = Math.round((w.angle - before.angle) / STEP);
  expect(Math.abs(moved)).toBeLessThanOrEqual(2);
  expect(w.detentError).toBeLessThan(1e-9);
});

test('many random drags always end on one of the 3 slots, at 60 fps', async ({ page }) => {
  const touch = await Touch.create(page);
  await page.evaluate(() => (window as unknown as { __fgl: { stats: { reset(): void } } }).__fgl.stats.reset());
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 12; i++) {
    const a0 = rnd() * Math.PI * 2;
    const span = (rnd() - 0.5) * Math.PI * 2.5;
    await dragArc(page, touch, a0, a0 + span, 8 + Math.floor(rnd() * 12), Math.floor(rnd() * 25));
    if (i === 5) await shot(page, 'M2-wheel-awake');
    await waitRest(page);
    const w = await wheel(page);
    expect([0, 1, 2]).toContain(w.restSlot);
    expect(w.detentError).toBeLessThan(1e-9);
    expect(w.uprightError).toBeLessThan(1e-6);
  }
  const s = await page.evaluate(() => (window as unknown as { __fgl: { stats: { summary(): { fps: number; p95: number; avg: number } } } }).__fgl.stats.summary());
  console.log('frame stats during drags', s);
  expect(s.avg).toBeLessThan(16.9);
  expect(s.p95).toBeLessThan(20);
});
