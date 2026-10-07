/**
 * Procedural plate: dark oak panel, riveted bevelled brass trim, brass bezels around each wheel,
 * engraved filigree scrolls in the free areas, and a central seam where the halves part.
 * The full plate is drawn once; the two halves are the same drawing masked left/right.
 */
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { PLATE, WHEEL, type WheelPlacement } from '../../layout';
import { C } from '../palette';
import { mulberry32 } from '../../util/random';
import { lit, vertical } from './wheel';

const DEG = Math.PI / 180;

function roundedRectPath(g: GraphicsContext, x: number, y: number, w: number, h: number, r: number) {
  g.roundRect(x, y, w, h, r);
}

/** A C-shaped filigree scroll with a leaf, engraved (dark groove + light edge). */
function scroll(g: GraphicsContext, cx: number, cy: number, size: number, flipX: number, flipY: number, rot = 0) {
  const pts: number[] = [];
  const turns = 1.6;
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = rot + t * turns * Math.PI * 2;
    const r = size * (1 - t * 0.82);
    pts.push(cx + Math.cos(a) * r * flipX, cy + Math.sin(a) * r * flipY);
  }
  // tail sweeping outward
  const tail: number[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const a = rot - t * 1.4;
    const r = size * (1 + t * 1.3);
    tail.push(cx + Math.cos(a) * r * flipX, cy + Math.sin(a) * r * flipY);
  }
  for (const [p, w] of [[pts, 3.2], [tail, 2.6]] as const) {
    g.poly(p.map((v, i) => v + (i % 2 === 0 ? 0.9 : 0.9)), false).stroke({ width: w, color: C.white, alpha: 0.18, cap: 'round' });
    g.poly(p, false).stroke({ width: w, color: C.brass, alpha: 0.85, cap: 'round' });
    g.poly(p, false).stroke({ width: w * 0.35, color: C.brassDeep, alpha: 0.7, cap: 'round' });
  }
  // leaves along the tail
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const a = rot - t * 1.4;
    const r = size * (1 + t * 1.3);
    const lx = cx + Math.cos(a) * r * flipX;
    const ly = cy + Math.sin(a) * r * flipY;
    const la = Math.atan2(Math.sin(a) * flipY, Math.cos(a) * flipX) + (flipX * flipY > 0 ? -0.9 : 0.9);
    const L = size * 0.55;
    const tipX = lx + Math.cos(la) * L;
    const tipY = ly + Math.sin(la) * L;
    const nx = -Math.sin(la) * L * 0.28;
    const ny = Math.cos(la) * L * 0.28;
    g.moveTo(lx, ly)
      .quadraticCurveTo((lx + tipX) / 2 + nx, (ly + tipY) / 2 + ny, tipX, tipY)
      .quadraticCurveTo((lx + tipX) / 2 - nx, (ly + tipY) / 2 - ny, lx, ly)
      .fill({ color: C.brass, alpha: 0.75 });
  }
}

function rivet(g: GraphicsContext, x: number, y: number, r = 4.2) {
  g.circle(x + 1.2, y + 1.6, r).fill({ color: C.black, alpha: 0.45 });
  g.circle(x, y, r).fill(lit(C.brassLight, C.brassShadow));
  g.circle(x - r * 0.35, y - r * 0.35, r * 0.35).fill({ color: C.white, alpha: 0.55 });
}

export function plateContext(wheels: readonly WheelPlacement[]): GraphicsContext {
  const g = new GraphicsContext();
  const { x, y, width: w, height: h, radius: r, border: b, seamX } = PLATE;
  const rng = mulberry32(19);

  // shadow on the wall
  roundedRectPath(g, x + 10, y + 14, w, h, r);
  g.fill({ color: C.black, alpha: 0.55 });

  // brass trim
  roundedRectPath(g, x, y, w, h, r);
  g.fill(lit(0xc9a453, 0x4f3a15, 0x977532));
  roundedRectPath(g, x + 3, y + 3, w - 6, h - 6, r - 3);
  g.stroke({ width: 1.5, color: C.white, alpha: 0.25 });
  roundedRectPath(g, x, y, w, h, r);
  g.stroke({ width: 2, color: C.brassDeep, alpha: 0.9 });
  // engraved double line on the trim
  roundedRectPath(g, x + b / 2 - 2, y + b / 2 - 2, w - b + 4, h - b + 4, r - b / 2);
  g.stroke({ width: 1, color: C.brassDeep, alpha: 0.55 });

  // oak panel
  const ix = x + b;
  const iy = y + b;
  const iw = w - 2 * b;
  const ih = h - 2 * b;
  roundedRectPath(g, ix, iy, iw, ih, r - b + 6);
  g.fill(vertical(C.oakLight, C.oakDark));
  // wood grain
  for (let i = 0; i < 70; i++) {
    const gy = iy + 6 + rng() * (ih - 12);
    const amp = 1.5 + rng() * 4;
    const freq = 0.004 + rng() * 0.01;
    const ph = rng() * 10;
    const pts: number[] = [];
    for (let gx = ix + 4; gx <= ix + iw - 4; gx += 16) pts.push(gx, gy + Math.sin(gx * freq + ph) * amp);
    g.poly(pts, false).stroke({ width: 0.6 + rng() * 1.4, color: rng() > 0.6 ? 0x4a3020 : C.black, alpha: 0.12 + rng() * 0.18 });
  }
  // inner bevel of the panel (light from top-left: shadow along top/left inner edge)
  roundedRectPath(g, ix, iy, iw, ih, r - b + 6);
  g.stroke({ width: 4, color: C.black, alpha: 0.5 });
  roundedRectPath(g, ix - 1.5, iy - 1.5, iw + 3, ih + 3, r - b + 7);
  g.stroke({ width: 1.2, color: C.brassLight, alpha: 0.5 });

  // rivets around the trim
  const step = 58;
  for (let px = x + 40; px <= x + w - 40; px += step) {
    if (Math.abs(px - seamX) < 20) continue;
    rivet(g, px, y + b / 2);
    rivet(g, px, y + h - b / 2);
  }
  for (let py = y + 40; py <= y + h - 40; py += step) {
    rivet(g, x + b / 2, py);
    rivet(g, x + w - b / 2, py);
  }

  // filigree in the corners (mirrored per quadrant)
  const corners: [number, number, number, number][] = [
    [ix + 62, iy + 62, 1, 1],
    [ix + iw - 62, iy + 62, -1, 1],
    [ix + 62, iy + ih - 62, 1, -1],
    [ix + iw - 62, iy + ih - 62, -1, -1],
  ];
  for (const [cx, cy, fx, fy] of corners) scroll(g, cx, cy, 20, fx, fy, 200 * DEG);
  // small scrolls between the top/bottom wheels, close to the trim
  for (const sx of [500, 780]) {
    scroll(g, sx - 26, iy + 40, 11, -1, 1, 180 * DEG);
    scroll(g, sx + 26, iy + 40, 11, 1, 1, 180 * DEG);
    scroll(g, sx - 26, iy + ih - 40, 11, -1, -1, 180 * DEG);
    scroll(g, sx + 26, iy + ih - 40, 11, 1, -1, 180 * DEG);
  }

  // brass bezels the wheels sit in
  for (const p of wheels) {
    const R = WHEEL.socketRadius + 9;
    g.circle(p.x + 5, p.y + 7, R + 2).fill({ color: C.black, alpha: 0.45 });
    g.circle(p.x, p.y, R).fill(lit(0xc9a453, 0x4f3a15, 0x977532));
    g.circle(p.x, p.y, R).stroke({ width: 1.5, color: C.brassDeep, alpha: 0.9 });
    for (let i = 0; i < 40; i++) {
      const a = i * 9 * DEG;
      g.circle(p.x + Math.cos(a) * (R - 4.5), p.y + Math.sin(a) * (R - 4.5), 1.1).fill({ color: C.brassDeep, alpha: 0.6 });
    }
  }

  // the seam where the doors part
  g.rect(seamX - 1.5, y, 3, h).fill({ color: C.black, alpha: 0.75 });
  g.rect(seamX + 1.5, y, 1, h).fill({ color: C.white, alpha: 0.12 });
  return g;
}

/** Two halves of the same drawing, each masked to its side. Cached as textures (static). */
export function buildPlateHalves(wheels: readonly WheelPlacement[]): { left: Container; right: Container } {
  const ctx = plateContext(wheels);
  const half = (side: 'left' | 'right') => {
    const c = new Container({ label: `plate:${side}` });
    const body = new Graphics(ctx);
    const pad = 40;
    const mx = side === 'left' ? PLATE.x - pad : PLATE.seamX;
    const mw = side === 'left' ? PLATE.seamX - mx : PLATE.x + PLATE.width + pad - PLATE.seamX;
    const mask = new Graphics().rect(mx, PLATE.y - pad, mw, PLATE.height + pad * 2).fill(0xffffff);
    body.mask = mask;
    c.addChild(body, mask);
    return c;
  };
  return { left: half('left'), right: half('right') };
}
