import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Touch, shot, waitForBoot } from './helpers';

const cfg = JSON.parse(readFileSync('public/config.json', 'utf8'));

type Snap = { state: string; slots: number[]; solved: boolean; atRest: boolean };
type Hooks = {
  snap(): Snap;
  arrow(id: number, dir: 'cw' | 'ccw'): { x: number; y: number };
  wheelPos(id: number): { x: number; y: number };
  toClient(x: number, y: number): { x: number; y: number };
  game: { stateLog: { state: string }[]; wheels: { id: number; owner: number | null }[] };
};

const snap = (page: Page) => page.evaluate(() => (window as unknown as { __fgl: Hooks }).__fgl.snap());

async function arrowClient(page: Page, id: number, dir: 'cw' | 'ccw') {
  return page.evaluate(
    ([i, d]) => {
      const g = (window as unknown as { __fgl: Hooks }).__fgl;
      const a = g.arrow(i as number, d as 'cw' | 'ccw');
      return g.toClient(a.x, a.y);
    },
    [id, dir],
  );
}

async function wheelClient(page: Page, id: number, angle: number, r = 55) {
  return page.evaluate(
    ([i, a, rr]) => {
      const g = (window as unknown as { __fgl: Hooks }).__fgl;
      const p = g.wheelPos(i);
      return g.toClient(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
    },
    [id, angle, r],
  );
}

async function waitAllRest(page: Page) {
  await expect.poll(async () => (await snap(page)).atRest, { timeout: 5000 }).toBe(true);
}

test('Playwright drives the arrows to solve the lock; state becomes Success', async ({ page }) => {
  await page.goto('/?skip-intro');
  expect(await waitForBoot(page)).toBe('ok');
  const touch = await Touch.create(page);
  let s = await snap(page);
  expect(s.state).toBe('Playable');
  expect(s.slots).toEqual(cfg.wheels.map((w: { start: number }) => w.start));
  await shot(page, 'M3-start');

  for (const w of cfg.wheels) {
    // cw moves slot + 1
    const taps = (((w.correct - w.start) % 3) + 3) % 3;
    const p = await arrowClient(page, w.id, 'cw');
    for (let i = 0; i < taps; i++) {
      await touch.tap(p.x, p.y);
      await waitAllRest(page);
    }
    s = await snap(page);
    if (w.id < 10) expect(s.state).toBe('Playable');
  }
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __fgl: Hooks }).__fgl.game.stateLog.map((e) => e.state)))
    .toContain('Success');
  s = await snap(page);
  expect(s.solved).toBe(true);
  expect(s.slots.map((slot, i) => cfg.wheels[i].slots[slot])).toEqual([9, 12, 88, 14, 5, 3, 79, 0, 6, 31]);
});

test('five parallel synthetic pointers turn five different wheels at once', async ({ page }) => {
  await page.goto('/?skip-intro');
  await waitForBoot(page);
  const touch = await Touch.create(page);
  const ids = [1, 3, 5, 8, 10];
  const before = (await snap(page)).slots;
  const steps = 16;
  const a0 = -Math.PI / 2;
  const a1 = a0 + (115 * Math.PI) / 180; // ≈ one slot clockwise
  const at = async (k: number) =>
    Promise.all(ids.map(async (id, i) => ({ ...(await wheelClient(page, id, a0 + ((a1 - a0) * k) / steps)), id: i + 1 })));
  await touch.send('touchStart', await at(0));
  for (let k = 1; k <= steps; k++) {
    await touch.send('touchMove', await at(k));
    await page.waitForTimeout(16);
    if (k === steps / 2) {
      const owners = await page.evaluate(() =>
        (window as unknown as { __fgl: Hooks }).__fgl.game.wheels.filter((w) => w.owner !== null).map((w) => w.id),
      );
      expect(owners.sort((a, b) => a - b)).toEqual(ids);
      await shot(page, 'M3-five-fingers');
    }
  }
  await touch.send('touchEnd', []);
  await waitAllRest(page);
  const after = (await snap(page)).slots;
  after.forEach((slot, i) => {
    const id = i + 1;
    const expected = ids.includes(id) ? (before[i] + 1) % 3 : before[i]; // cw = +1
    expect(slot, `wheel ${id}`).toBe(expected);
  });
});

test('no win while a wheel is still being dragged; win on settle', async ({ page }) => {
  await page.goto('/?skip-intro&solve');
  await waitForBoot(page);
  const touch = await Touch.create(page);
  let s = await snap(page);
  expect(s.slots.filter((x, i) => x === cfg.wheels[i].correct)).toHaveLength(9);
  // wheel 10 needs one cw step. Drag it cw onto the correct slot and hold.
  const a0 = 0;
  const steps = 12;
  const target = (120 * Math.PI) / 180;
  for (let k = 0; k <= steps; k++) {
    const p = await wheelClient(page, 10, a0 + (target * k) / steps);
    await touch.send(k === 0 ? 'touchStart' : 'touchMove', [{ ...p, id: 1 }]);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);
  s = await snap(page);
  expect(s.state).toBe('Playable'); // finger still down on the correct number
  await touch.send('touchEnd', []);
  await expect.poll(async () => (await snap(page)).state).not.toBe('Playable');
  await shot(page, 'M3-success-flash');
});

test('operator corner and dead zone: taps there never move wheels', async ({ page }) => {
  await page.goto('/?skip-intro&debug');
  await waitForBoot(page);
  const touch = await Touch.create(page);
  const before = (await snap(page)).slots;
  const p = await page.evaluate(() => (window as unknown as { __fgl: Hooks }).__fgl.toClient(60, 740));
  await touch.tap(p.x, p.y);
  await page.waitForTimeout(300);
  expect((await snap(page)).slots).toEqual(before);
  await shot(page, 'M3-debug-hit-areas');
});

test('one active wheel at a time: its arrows show and take taps; hidden arrows do nothing', async ({ page }) => {
  await page.goto('/?skip-intro&speed=4');
  expect(await waitForBoot(page)).toBe('ok');
  const touch = await Touch.create(page);
  type W = { arrows: { alpha: number }; isActive: boolean; eye: { look: string } };
  const wheels = () =>
    page.evaluate(() =>
      (window as unknown as { __fgl: { game: { wheels: W[] } } }).__fgl.game.wheels.map((w) => ({ a: w.arrows.alpha, active: w.isActive, look: w.eye.look })),
    );
  const hiddenArrow = (id: number) =>
    page.evaluate((i) => {
      const g = (window as unknown as { __fgl: { arrow(id: number, d: string, activate: boolean): { x: number; y: number }; toClient(x: number, y: number): { x: number; y: number } } }).__fgl;
      const a = g.arrow(i, 'cw', false);
      return g.toClient(a.x, a.y);
    }, id);
  const id2 = cfg.wheels[1].id;
  // at the start the first wheel is active: arrows up, eye awake; every other wheel's arrows hidden
  await expect.poll(async () => (await wheels())[0].a).toBe(1);
  let w = await wheels();
  expect(w[0].active && w[0].look === 'awake').toBe(true);
  expect(w.slice(1).every((x) => x.a === 0 && !x.active)).toBe(true);
  // a tap where wheel 2's hidden arrow would be does nothing
  const before = (await snap(page)).slots[1];
  const a2 = await hiddenArrow(id2);
  await touch.tap(a2.x, a2.y);
  await page.waitForTimeout(400);
  expect((await snap(page)).slots[1]).toBe(before);
  expect((await wheels())[0].active).toBe(true);
  // touching wheel 2's disc makes it the active one; wheel 1 hands over
  const d2 = await wheelClient(page, id2, Math.PI / 2);
  await touch.tap(d2.x, d2.y);
  await waitAllRest(page);
  await expect.poll(async () => (await wheels())[0].a).toBe(0);
  w = await wheels();
  expect(w[1].active && w[1].a === 1).toBe(true);
  expect(w.filter((x) => x.active)).toHaveLength(1);
  // now its arrow turns it, and it stays active long after (no timeout)
  await touch.tap(a2.x, a2.y);
  await waitAllRest(page);
  expect((await snap(page)).slots[1]).toBe((before + 1) % 3);
  await page.waitForTimeout(2500);
  w = await wheels();
  expect(w[1].active && w[1].a === 1 && w[1].look === 'awake').toBe(true);
});
