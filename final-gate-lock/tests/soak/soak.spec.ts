/**
 * 8-hour soak (simulated): the game clock runs at SOAK_SPEED× (default 100×, ≈ 5–6 min real) while a
 * synthetic player taps, drags, idles (so the plate falls asleep) and solves the lock about every
 * 20 simulated minutes. Every simulated hour we sample heap (after GC), display objects, GPU memory
 * and frame times. Fails on any page error, memory growth, or a stuck state machine.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Touch, waitForBoot } from '../e2e/helpers';

const HOURS = Number(process.env.SOAK_HOURS ?? 8);
const SPEED = Number(process.env.SOAK_SPEED ?? 100);

type Fgl = {
  snap(): { state: string; loops: number; asleep: boolean };
  diag(): { objects: number; tweens: number; timers: number; splitTextures: number; motes: number; gpu: { totalMB: number } };
  stats: { reset(): void; summary(): { avg: number; p95: number; max: number } };
  clock: { now: number };
  toClient(x: number, y: number): { x: number; y: number };
  arrow(id: number, dir: string): { x: number; y: number };
  wheelPos(id: number): { x: number; y: number };
  game: { setCorrectMinusOne(): void };
};
const g = <T>(page: Page, fn: (g: Fgl) => T) => page.evaluate(`(${fn.toString()})(window.__fgl)`) as Promise<T>;

async function heapMB(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
  await cdp.detach();
  return usedSize / 2 ** 20;
}

test(`soak: ${HOURS} simulated hours of play at ${SPEED}×`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
  });
  await page.goto(`/?speed=${SPEED}`);
  await waitForBoot(page);
  const touch = await Touch.create(page);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tapLogical = async (x: number, y: number) => {
    const c = await g(page, new Function('x', `return x.toClient(${x}, ${y})`) as (x: Fgl) => { x: number; y: number });
    await touch.tap(c.x, c.y);
  };

  const samples: Record<string, number | string>[] = [];
  let nextSampleH = 1;
  let nextSolveAt = 20 * 60_000;
  let solves = 0;
  let actions = 0;
  const endMs = HOURS * 3600_000;

  for (;;) {
    const now = await g(page, (x) => x.clock.now);
    if (now >= endMs) break;
    const s = await g(page, (x) => x.snap());

    if (now >= nextSampleH * 3600_000 && s.state === 'Shrouded') {
      await g(page, (x) => x.stats.reset());
      await page.waitForTimeout(1000);
      const f = await g(page, (x) => x.stats.summary());
      const d = await g(page, (x) => x.diag());
      samples.push({ hour: nextSampleH, heapMB: +(await heapMB(page)).toFixed(2), objects: d.objects, gpuMB: +d.gpu.totalMB.toFixed(1), splitTextures: d.splitTextures, motes: d.motes, timers: d.timers, loops: s.loops, p95: +f.p95.toFixed(1), errors: errors.length });
      console.log(samples[samples.length - 1]);
      nextSampleH++;
      continue;
    }

    if (s.state === 'Shrouded') {
      await tapLogical(300 + rnd() * 700, 200 + rnd() * 400);
    } else if (s.state === 'Playable') {
      if (now >= nextSolveAt) {
        // players finally get it: all wheels one step away, then the last 10 moves
        await g(page, (x) => x.game.setCorrectMinusOne());
        for (let id = 1; id <= 10; id++) {
          const a = await g(page, new Function('x', `return x.toClient(x.arrow(${id}, 'ccw').x, x.arrow(${id}, 'ccw').y)`) as (x: Fgl) => { x: number; y: number });
          await touch.tap(a.x, a.y);
          await page.waitForTimeout(30);
        }
        nextSolveAt = now + 20 * 60_000;
        solves++;
      } else {
        const r = rnd();
        const id = 1 + Math.floor(rnd() * 10);
        if (r < 0.45) {
          const a = await g(page, new Function('x', `return x.toClient(x.arrow(${id}, '${rnd() < 0.5 ? 'cw' : 'ccw'}').x, x.arrow(${id}, 'cw').y)`) as (x: Fgl) => { x: number; y: number });
          await touch.tap(a.x, a.y);
        } else if (r < 0.75) {
          const p = await g(page, new Function('x', `return x.wheelPos(${id})`) as (x: Fgl) => { x: number; y: number });
          const a0 = rnd() * Math.PI * 2;
          const span = (rnd() - 0.5) * 4;
          for (let k = 0; k <= 6; k++) {
            const a = a0 + (span * k) / 6;
            const c = await g(page, new Function('x', `return x.toClient(${p.x + Math.cos(a) * 55}, ${p.y + Math.sin(a) * 55})`) as (x: Fgl) => { x: number; y: number });
            await touch.send(k === 0 ? 'touchStart' : 'touchMove', [{ ...c, id: 1 }]);
          }
          await touch.send('touchEnd', []);
        } else {
          // idle for a while (long enough at times to fall asleep)
          await page.waitForTimeout(rnd() < 0.2 ? 1000 : 150);
        }
        actions++;
      }
    } else {
      await page.waitForTimeout(100); // Intro / Success / Open / Reset run on their own
    }
  }

  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/soak.json', JSON.stringify({ hours: HOURS, speed: SPEED, solves, actions, samples, errors }, null, 2));
  console.table(samples);
  console.log({ solves, actions, errors: errors.slice(0, 5) });

  expect(errors).toEqual([]);
  expect(samples.length).toBeGreaterThanOrEqual(HOURS - 1);
  expect(solves).toBeGreaterThanOrEqual(HOURS * 2);
  const first = samples[0];
  const last = samples[samples.length - 1];
  expect(last.objects).toBe(first.objects);
  expect(last.splitTextures).toBe(0);
  expect(Number(last.heapMB) - Number(first.heapMB)).toBeLessThan(5);
  expect(Number(last.gpuMB) - Number(first.gpuMB)).toBeLessThan(5);
});
