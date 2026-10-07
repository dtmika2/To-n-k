import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, hasTouch: true });
p.on('pageerror', e => console.log('pageerror:', e.message));
p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
await p.goto('http://localhost:4173/');
await p.waitForFunction(() => window.__fglBoot !== undefined);
await p.waitForTimeout(2000);
await p.screenshot({ path: 'screenshots/M5-shrouded.png' });
await p.touchscreen.tap(400, 300);
for (const [ms, name] of [[700, 'M5-intro-0.7s'], [1500, 'M5-intro-2.2s'], [1500, 'M5-intro-3.7s'], [2500, 'M5-playable']]) {
  await p.waitForTimeout(ms); await p.screenshot({ path: `screenshots/${name}.png` });
}
console.log(await p.evaluate(() => window.__fgl.snap()));
await b.close();
