/**
 * Procedural plate (the door), built from separate layers so each can be swapped for a sprite on
 * its own (bottom → top):
 *   plateShadow  shadow of the door on the wall
 *   oak          the wooden panel
 *   frame        riveted brass trim around the panel
 *   straps       wrought-iron straps across the oak
 *   brackets     iron corner brackets
 *   ornaments    brass filigree scrolls
 *   bezel        brass ring a wheel sits in (one drawing, placed under every wheel)
 *   seam         the dark line where the door parts
 * All but `bezel` are drawn in absolute logical coordinates on the 1280 × 800 canvas. Each door half
 * is the full stack masked to its side, so the split works whatever the layers look like.
 */
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { PLATE, WHEEL, type WheelPlacement } from '../../layout';
import { registerProcedural, type LayerFactory, type LayerId } from '../layers';
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

/** Hammered iron band with a bevel, scattered pitting and big domed rivets. */
function ironStrap(g: GraphicsContext, x: number, y: number, w: number, h: number, rng: () => number) {
  g.rect(x + 3, y - h / 2 + 5, w, h).fill({ color: C.black, alpha: 0.55 }); // cast shadow
  g.rect(x, y - h / 2, w, h).fill(vertical(C.ironLight, C.ironDark));
  g.rect(x, y - h / 2, w, 2).fill({ color: C.white, alpha: 0.18 });
  g.rect(x, y + h / 2 - 2, w, 2).fill({ color: C.black, alpha: 0.6 });
  for (let i = 0; i < 160; i++) {
    g.circle(x + rng() * w, y - h / 2 + 3 + rng() * (h - 6), 0.6 + rng() * 1.3).fill({
      color: rng() > 0.7 ? 0x5a3a22 : C.black,
      alpha: 0.18 + rng() * 0.22,
    });
  }
  for (let rx = x + 30; rx < x + w - 20; rx += 64) ironRivet(g, rx, y, 5.5);
}

function ironRivet(g: GraphicsContext, x: number, y: number, r: number) {
  g.circle(x + 1.5, y + 2.2, r + 0.5).fill({ color: C.black, alpha: 0.6 });
  g.circle(x, y, r).fill(lit(0x777b82, C.ironDark, C.iron));
  g.circle(x - r * 0.35, y - r * 0.35, r * 0.3).fill({ color: C.white, alpha: 0.35 });
}

/** L-shaped iron bracket hugging an inner corner of the panel. */
function ironBracket(g: GraphicsContext, cx: number, cy: number, fx: number, fy: number) {
  const L = 74;
  const T = 20;
  const pts = [0, 0, L, 0, L, T, T, T, T, L, 0, L].map((v, i) => (i % 2 === 0 ? cx + v * fx : cy + v * fy));
  g.poly(pts.map((v, i) => v + (i % 2 === 0 ? 3 : 4))).fill({ color: C.black, alpha: 0.5 });
  g.poly(pts).fill(lit(C.ironLight, C.ironDark, C.iron));
  g.poly(pts).stroke({ width: 1.2, color: C.black, alpha: 0.7 });
  ironRivet(g, cx + 10 * fx, cy + 10 * fy, 5);
  ironRivet(g, cx + (L - 12) * fx, cy + 10 * fy, 4.5);
  ironRivet(g, cx + 10 * fx, cy + (L - 12) * fy, 4.5);
}

function rivet(g: GraphicsContext, x: number, y: number, r = 4.2) {
  g.circle(x + 1.2, y + 1.6, r).fill({ color: C.black, alpha: 0.45 });
  g.circle(x, y, r).fill(lit(C.brassLight, C.brassShadow));
  g.circle(x - r * 0.35, y - r * 0.35, r * 0.35).fill({ color: C.white, alpha: 0.55 });
}

const memo = new Map<string, GraphicsContext>();
function once(key: string, draw: (g: GraphicsContext) => void): GraphicsContext {
  let ctx = memo.get(key);
  if (!ctx) {
    ctx = new GraphicsContext();
    draw(ctx);
    memo.set(key, ctx);
  }
  return ctx;
}

const P = PLATE;
const inner = () => ({ ix: P.x + P.border, iy: P.y + P.border, iw: P.width - 2 * P.border, ih: P.height - 2 * P.border, ir: P.radius - P.border + 6 });

export function plateShadowContext(): GraphicsContext {
  return once('plateShadow', (g) => {
    roundedRectPath(g, P.x + 10, P.y + 14, P.width, P.height, P.radius);
    g.fill({ color: C.black, alpha: 0.55 });
  });
}

export function oakContext(): GraphicsContext {
  return once('oak', (g) => {
    const { ix, iy, iw, ih, ir } = inner();
    const rng = mulberry32(19);
    // extends a few px under the frame so the edge never shows a gap
    roundedRectPath(g, ix - 4, iy - 4, iw + 8, ih + 8, ir + 4);
    g.fill(vertical(C.oakLight, C.oakDark));
    for (let i = 0; i < 70; i++) {
      const gy = iy + 6 + rng() * (ih - 12);
      const amp = 1.5 + rng() * 4;
      const freq = 0.004 + rng() * 0.01;
      const ph = rng() * 10;
      const pts: number[] = [];
      for (let gx = ix + 4; gx <= ix + iw - 4; gx += 16) pts.push(gx, gy + Math.sin(gx * freq + ph) * amp);
      g.poly(pts, false).stroke({ width: 0.6 + rng() * 1.4, color: rng() > 0.6 ? 0x4a3020 : C.black, alpha: 0.12 + rng() * 0.18 });
    }
    // the frame casts a shadow onto the wood along the inner edge
    roundedRectPath(g, ix, iy, iw, ih, ir);
    g.stroke({ width: 6, color: C.black, alpha: 0.5, alignment: 1 });
  });
}

export function frameContext(): GraphicsContext {
  return once('frame', (g) => {
    const { x, y, width: w, height: h, radius: r, border: b, seamX } = P;
    const { ix, iy, iw, ih, ir } = inner();
    // brass trim ring (the panel opening is cut out, so whatever is behind shows through)
    roundedRectPath(g, x, y, w, h, r);
    g.fill(lit(0xb08e45, 0x3f2e10, 0x7e6128));
    roundedRectPath(g, ix, iy, iw, ih, ir);
    g.cut();
    roundedRectPath(g, x + 3, y + 3, w - 6, h - 6, r - 3);
    g.stroke({ width: 1.5, color: C.white, alpha: 0.25 });
    roundedRectPath(g, x, y, w, h, r);
    g.stroke({ width: 2, color: C.brassDeep, alpha: 0.9 });
    // engraved double line on the trim
    roundedRectPath(g, x + b / 2 - 2, y + b / 2 - 2, w - b + 4, h - b + 4, r - b / 2);
    g.stroke({ width: 1, color: C.brassDeep, alpha: 0.55 });
    // inner lip catching the light
    roundedRectPath(g, ix - 1.5, iy - 1.5, iw + 3, ih + 3, ir + 1);
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
  });
}

export function strapsContext(): GraphicsContext {
  return once('straps', (g) => {
    const { ix, iw } = inner();
    const rng = mulberry32(23);
    // in the gaps between the rows; drawn under the bezels
    for (const sy of [318, 523]) ironStrap(g, ix - 2, sy, iw + 4, 24, rng);
  });
}

export function bracketsContext(): GraphicsContext {
  return once('brackets', (g) => {
    const { ix, iy, iw, ih } = inner();
    for (const [cx, cy, fx, fy] of [
      [ix, iy, 1, 1],
      [ix + iw, iy, -1, 1],
      [ix, iy + ih, 1, -1],
      [ix + iw, iy + ih, -1, -1],
    ] as const) ironBracket(g, cx, cy, fx, fy);
  });
}

export function ornamentsContext(): GraphicsContext {
  return once('ornaments', (g) => {
    const { ix, iy, iw, ih } = inner();
    for (const [cx, cy, fx, fy] of [
      [ix + 62, iy + 62, 1, 1],
      [ix + iw - 62, iy + 62, -1, 1],
      [ix + 62, iy + ih - 62, 1, -1],
      [ix + iw - 62, iy + ih - 62, -1, -1],
    ] as const) scroll(g, cx, cy, 20, fx, fy, 200 * DEG);
    for (const sx of [500, 780]) {
      scroll(g, sx - 26, iy + 40, 11, -1, 1, 180 * DEG);
      scroll(g, sx + 26, iy + 40, 11, 1, 1, 180 * DEG);
      scroll(g, sx - 26, iy + ih - 40, 11, -1, -1, 180 * DEG);
      scroll(g, sx + 26, iy + ih - 40, 11, 1, -1, 180 * DEG);
    }
  });
}

/** Brass ring a wheel sits in, centred on (0, 0); placed under every wheel. */
export function bezelContext(): GraphicsContext {
  return once('bezel', (g) => {
    const R = WHEEL.socketRadius + 9;
    g.circle(9, 12, R + 6).fill({ color: C.black, alpha: 0.3 });
    g.circle(5, 7, R + 2).fill({ color: C.black, alpha: 0.55 });
    g.circle(0, 0, R).fill(lit(0xb08e45, 0x3f2e10, 0x7e6128));
    g.circle(0, 0, R).stroke({ width: 1.5, color: C.brassDeep, alpha: 0.9 });
    for (let i = 0; i < 40; i++) {
      const a = i * 9 * DEG;
      g.circle(Math.cos(a) * (R - 4.5), Math.sin(a) * (R - 4.5), 1.1).fill({ color: C.brassDeep, alpha: 0.6 });
    }
  });
}

export function seamContext(): GraphicsContext {
  return once('seam', (g) => {
    g.rect(P.seamX - 1.5, P.y, 3, P.height).fill({ color: C.black, alpha: 0.75 });
    g.rect(P.seamX + 1.5, P.y, 1, P.height).fill({ color: C.white, alpha: 0.12 });
  });
}

/** Door layers drawn in absolute canvas coordinates, bottom → top (bezels go between ornaments and seam). */
export const PLATE_LAYERS = ['plateShadow', 'oak', 'frame', 'straps', 'brackets', 'ornaments'] as const satisfies readonly LayerId[];

registerProcedural('plateShadow', () => new Graphics(plateShadowContext()));
registerProcedural('oak', () => new Graphics(oakContext()));
registerProcedural('frame', () => new Graphics(frameContext()));
registerProcedural('straps', () => new Graphics(strapsContext()));
registerProcedural('brackets', () => new Graphics(bracketsContext()));
registerProcedural('ornaments', () => new Graphics(ornamentsContext()));
registerProcedural('bezel', () => new Graphics(bezelContext()));
registerProcedural('seam', () => new Graphics(seamContext()));

/**
 * One door half: the whole layer stack, masked to its side of the seam. Built through the factory,
 * so any layer can be a sprite.
 */
export function buildPlateHalf(side: 'left' | 'right', factory: LayerFactory, wheels: readonly WheelPlacement[]): Container {
  const c = new Container({ label: `plate:${side}` });
  const body = new Container({ label: 'plateBody' });
  for (const id of PLATE_LAYERS) body.addChild(factory.create(id));
  for (const p of wheels) {
    const b = factory.create('bezel');
    b.position.set(p.x, p.y);
    body.addChild(b);
  }
  body.addChild(factory.create('seam'));
  const pad = 40;
  const mx = side === 'left' ? P.x - pad : P.seamX;
  const mw = side === 'left' ? P.seamX - mx : P.x + P.width + pad - P.seamX;
  const mask = new Graphics().rect(mx, P.y - pad, mw, P.height + pad * 2).fill(0xffffff);
  body.mask = mask;
  c.addChild(body, mask);
  return c;
}
