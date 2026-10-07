import { test, expect } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import { shot, waitForBoot } from './helpers';

test('boots with the default config and renders a canvas', async ({ page }) => {
  await page.goto('/');
  expect(await waitForBoot(page)).toBe('ok');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('error-screen')).toHaveCount(0);
});

test('invalid config shows the red error screen with reasons', async ({ page }) => {
  await page.route('**/config.json*', async (route) => {
    const res = await route.fetch();
    const cfg = await res.json();
    cfg.wheels[0].start = cfg.wheels[0].correct; // start === correct
    cfg.wheels[1].slots[0] = cfg.wheels[2].slots[0]; // duplicate number
    cfg.wheels.pop(); // only 9 wheels
    await route.fulfill({ response: res, json: cfg });
  });
  await page.goto('/');
  expect(await waitForBoot(page)).toBe('config-error');
  const err = page.getByTestId('error-screen');
  await expect(err).toBeVisible();
  await expect(err).toContainText('expected 10 wheels');
  await expect(err).toContainText('"start" must differ from "correct"');
  await expect(err).toContainText('already used');
  const bg = await err.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(122, 0, 0)');
  await shot(page, 'M0-config-error');
});

test('is installable: manifest is fullscreen landscape with icons', async ({ page, request }) => {
  await page.goto('/');
  await waitForBoot(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest.display).toBe('fullscreen');
  expect(manifest.orientation).toBe('landscape');
  expect(manifest.background_color).toBe('#050405');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
});

test('loads offline once the service worker has installed (server really stopped)', async ({ page }) => {
  // A private preview server we can kill: true offline, not emulated.
  const port = 4199;
  const server = spawn(`npx vite preview --port ${port} --strictPort`, {
    shell: true,
    stdio: 'ignore',
  });
  const url = `http://localhost:${port}/`;
  try {
    await expect
      .poll(async () => (await fetch(url).then((r) => r.ok).catch(() => false)), { timeout: 30_000 })
      .toBe(true);
    await page.goto(url);
    await waitForBoot(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await waitForBoot(page);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  } finally {
    killTree(server.pid!);
  }
  await expect.poll(async () => fetch(url).then(() => 'up').catch(() => 'down'), { timeout: 15_000 }).toBe('down');
  await page.reload();
  expect(await waitForBoot(page)).toBe('ok');
  await expect(page.locator('canvas')).toBeVisible();
  await shot(page, 'M0-offline-boot');
});

function killTree(pid: number) {
  if (process.platform === 'win32') execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
  else process.kill(-pid, 'SIGKILL');
}

test('touch lockdown CSS and viewport are in place', async ({ page }) => {
  await page.goto('/');
  await waitForBoot(page);
  const css = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { ta: s.touchAction, ob: s.overscrollBehaviorY, us: s.userSelect || s.webkitUserSelect };
  });
  expect(css.ta).toBe('none');
  expect(css.ob).toBe('none');
  expect(css.us).toBe('none');
  const vp = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(vp).toContain('user-scalable=no');
});
