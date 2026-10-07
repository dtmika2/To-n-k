// Generates the PWA icons (brass eye on dark oak) by drawing on a canvas in headless Chrome.
// Usage: npm run icons
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const draw = (size, maskable) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 512;
  g.fillStyle = '#1a110b';
  g.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const R = (maskable ? 150 : 210) * s;
  const ring = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  ring.addColorStop(0, '#e8c46a'); ring.addColorStop(0.5, '#b8913a'); ring.addColorStop(1, '#5e4418');
  g.fillStyle = ring; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a3a40'; g.beginPath(); g.arc(cx, cy, R * 0.86, 0, Math.PI * 2); g.fill();
  const iris = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  iris.addColorStop(0, '#d9b45a'); iris.addColorStop(1, '#6e5220');
  g.fillStyle = iris; g.beginPath(); g.arc(cx, cy, R * 0.78, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(60,40,10,0.55)'; g.lineWidth = 3 * s;
  for (let a = 0; a < 360; a += 10) {
    const r = (a * Math.PI) / 180;
    g.beginPath(); g.moveTo(cx + Math.cos(r) * R * 0.3, cy + Math.sin(r) * R * 0.3);
    g.lineTo(cx + Math.cos(r) * R * 0.74, cy + Math.sin(r) * R * 0.74); g.stroke();
  }
  // wedge window
  g.fillStyle = '#1c130d'; g.beginPath();
  g.arc(cx, cy, R * 0.74, (13 * Math.PI) / 180, (77 * Math.PI) / 180);
  g.arc(cx, cy, R * 0.3, (77 * Math.PI) / 180, (13 * Math.PI) / 180, true); g.closePath(); g.fill();
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.45);
  glow.addColorStop(0, 'rgba(127,227,212,0.9)'); glow.addColorStop(1, 'rgba(127,227,212,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, R * 0.45, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#071010'; g.beginPath(); g.arc(cx, cy, R * 0.17, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx - R * 0.06, cy - R * 0.07, R * 0.045, 0, Math.PI * 2); g.fill();
  return c.toDataURL('image/png');
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
mkdirSync('public/icons', { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
]) {
  const data = await page.evaluate(
    ([sz, m]) => (0, eval)(`(${m.fn})`)(sz, m.mask),
    [size, { fn: draw.toString(), mask: maskable }],
  );
  writeFileSync(`public/icons/${name}`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote', name);
}
await browser.close();
