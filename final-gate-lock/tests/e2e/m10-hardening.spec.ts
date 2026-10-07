import { test, expect, chromium, type Page } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Touch, waitForBoot } from './helpers';

type Diag = {
  gpu: { textures: number; count: number; backBuffer: number; totalMB: number };
  resolution: number;
  updateCostMs: number;
  wakeLocks: number;
  wakeActive: boolean;
};
type Fgl = {
  diag(): Diag;
  snap(): { state: string };
  stats: { reset(): void; summary(): { fps: number; avg: number; p95: number; max: number; frames: number } };
  toClient(x: number, y: number): { x: number; y: number };
  arrow(id: number, dir: string): { x: number; y: number };
  game: { wake: { sentinel: { release(): Promise<void> } | null }; adaptQuality(dt: number): void; stage: { app: { renderer: { resolution: number } } } };
};
const g = <T>(page: Page, fn: (g: Fgl) => T | Promise<T>) => page.evaluate(`(${fn.toString()})(window.__fgl)`) as Promise<T>;

async function measure(page: Page, ms: number) {
  await g(page, (x) => x.stats.reset());
  await page.waitForTimeout(ms);
  return g(page, (x) => x.stats.summary());
}

test('performance budget: 60 fps shrouded (dense mist), playable (idle eyes + mist), and open; GPU memory < 150 MB', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?solve');
  await waitForBoot(page);
  await page.waitForTimeout(1500);
  const shrouded = await measure(page, 4000);
  const touch = await Touch.create(page);
  const c = await g(page, (x) => x.toClient(640, 400));
  await touch.tap(c.x, c.y);
  await expect.poll(() => g(page, (x) => x.snap().state), { timeout: 10_000 }).toBe('Playable');
  await page.waitForTimeout(1500);
  const playable = await measure(page, 5000);
  const cost = await g(page, (x) => x.diag().updateCostMs);
  const memPlayable = (await g(page, (x) => x.diag())).gpu;
  const a = await g(page, (x) => {
    const p = x.arrow(10, 'cw');
    return x.toClient(p.x, p.y);
  });
  await touch.tap(a.x, a.y);
  await expect.poll(() => g(page, (x) => x.snap().state), { timeout: 15_000 }).toBe('Open');
  const open = await measure(page, 3000);
  const memOpen = (await g(page, (x) => x.diag())).gpu;
  console.table({ shrouded, playable, open });
  console.log('update cost (ms/frame)', cost.toFixed(3), 'GPU playable', memPlayable, 'GPU open (peak)', memOpen);
  for (const s of [shrouded, playable, open]) {
    expect(s.avg).toBeLessThan(16.9);
    expect(s.p95).toBeLessThan(20);
  }
  expect(cost).toBeLessThan(3);
  expect(memOpen.totalMB).toBeLessThan(150);
  expect(memPlayable.totalMB).toBeLessThan(150);
});

test('CPU headroom: with 4× CPU throttling the game update still fits the frame', async ({ page }) => {
  await page.goto('/?skip-intro');
  await waitForBoot(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(4000);
  const cost = await g(page, (x) => x.diag().updateCostMs);
  const s = await measure(page, 3000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log('throttled 4×: update cost', cost.toFixed(2), 'ms; frames', s);
  expect(cost).toBeLessThan(8);
});

test('screen wake lock: requested on first touch, re-requested when the page becomes visible again', async ({ page }) => {
  await page.goto('/');
  await waitForBoot(page);
  expect((await g(page, (x) => x.diag())).wakeLocks).toBe(0);
  const touch = await Touch.create(page);
  const c = await g(page, (x) => x.toClient(640, 400));
  await touch.tap(c.x, c.y);
  await expect.poll(async () => (await g(page, (x) => x.diag())).wakeActive).toBe(true);
  // the browser drops the lock when the page is hidden; simulate that and the return
  await g(page, async (x) => {
    await x.game.wake.sentinel?.release();
  });
  await expect.poll(async () => (await g(page, (x) => x.diag())).wakeActive).toBe(false);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(async () => (await g(page, (x) => x.diag())).wakeActive).toBe(true);
  expect((await g(page, (x) => x.diag())).wakeLocks).toBe(2);
});

test('adaptive quality lowers the resolution after sustained slow frames, never below 1', async ({ page }) => {
  await page.goto('/?skip-intro');
  await waitForBoot(page);
  const r0 = await g(page, (x) => x.diag().resolution);
  expect(r0).toBe(2);
  await g(page, (x) => {
    for (let i = 0; i < 400; i++) x.game.adaptQuality(25); // 3 windows of ~2 s at 40 fps
  });
  expect(await g(page, (x) => x.diag().resolution)).toBe(1.75);
  await g(page, (x) => {
    for (let i = 0; i < 4000; i++) x.game.adaptQuality(25);
  });
  expect(await g(page, (x) => x.diag().resolution)).toBe(1);
  // still renders and maps touches correctly at the lower resolution
  const touch = await Touch.create(page);
  const a = await g(page, (x) => {
    const p = x.arrow(1, 'cw');
    return x.toClient(p.x, p.y);
  });
  await touch.tap(a.x, a.y);
  // a heavy step takes ~650 ms: wait for the wheel to settle
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __fgl: { snap(): { slots: number[] } } }).__fgl.snap().slots[0]))
    .toBe(1);
});

test('WebGL context loss reloads the page (kiosk self-healing)', async ({ page }) => {
  await page.goto('/?skip-intro');
  await waitForBoot(page);
  const reloaded = page.waitForEvent('load', { timeout: 15_000 });
  await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await reloaded;
  expect(await waitForBoot(page)).toBe('ok');
});

test('offline after reboot: browser restarted with the server gone still boots the lock', async () => {
  test.setTimeout(120_000);
  const port = 4198;
  const url = `http://localhost:${port}/`;
  const profile = mkdtempSync(join(tmpdir(), 'fgl-reboot-'));
  const server = spawn(`npx vite preview --port ${port} --strictPort`, { shell: true, stdio: 'ignore' });
  const opts = { channel: 'chrome' as const, viewport: { width: 1280, height: 800 }, args: ['--use-angle=d3d11'] };
  try {
    await expect.poll(async () => fetch(url).then((r) => r.ok).catch(() => false), { timeout: 30_000 }).toBe(true);
    const ctx1 = await chromium.launchPersistentContext(profile, opts);
    const p1 = await ctx1.newPage();
    await p1.goto(url);
    await waitForBoot(p1);
    await p1.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await p1.reload();
    await waitForBoot(p1);
    await ctx1.close(); // "power off"
  } finally {
    if (process.platform === 'win32') execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
    else server.kill('SIGKILL');
  }
  await expect.poll(async () => fetch(url).then(() => 'up').catch(() => 'down'), { timeout: 15_000 }).toBe('down');
  const ctx2 = await chromium.launchPersistentContext(profile, opts); // "reboot"
  try {
    const p2 = await ctx2.newPage();
    await p2.goto(url);
    expect(await waitForBoot(p2)).toBe('ok');
    await p2.waitForTimeout(500);
    await p2.screenshot({ path: 'screenshots/M10-offline-after-reboot.png' });
  } finally {
    await ctx2.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
