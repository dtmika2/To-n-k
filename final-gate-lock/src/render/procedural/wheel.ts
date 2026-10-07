/**
 * Procedural wheel layers. Each function returns a shared GraphicsContext (drawn once, instanced
 * by every wheel). Every layer is centred on the wheel pivot (0, 0). Light comes from the top left.
 */
import { FillGradient, GraphicsContext } from 'pixi.js';
import { WHEEL } from '../../layout';
import { C } from '../palette';
import { mulberry32 } from '../../util/random';

const DEG = Math.PI / 180;

/** Top-left → bottom-right linear gradient in local (bounding box) space. */
export function lit(light: number, dark: number, mid?: number): FillGradient {
  const colorStops = mid === undefined
    ? [{ offset: 0, color: light }, { offset: 1, color: dark }]
    : [{ offset: 0, color: light }, { offset: 0.5, color: mid }, { offset: 1, color: dark }];
  return new FillGradient({ type: 'linear', start: { x: 0.15, y: 0.1 }, end: { x: 0.85, y: 0.95 }, colorStops, textureSpace: 'local' });
}

export function vertical(top: number, bottom: number): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }],
    textureSpace: 'local',
  });
}

/** Polygon points for the window wedge (annular sector). */
export function wedgePoints(inner: number, outer: number, startDeg: number, endDeg: number, steps = 24): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (startDeg + ((endDeg - startDeg) * i) / steps) * DEG;
    pts.push(Math.cos(a) * outer, Math.sin(a) * outer);
  }
  for (let i = steps; i >= 0; i--) {
    const a = (startDeg + ((endDeg - startDeg) * i) / steps) * DEG;
    pts.push(Math.cos(a) * inner, Math.sin(a) * inner);
  }
  return pts;
}

/** Highlight arc on the top-left of a circle, shadow arc on the bottom-right. */
function bevelArcs(ctx: GraphicsContext, r: number, width: number, hiAlpha: number, loAlpha: number) {
  arcPath(ctx, r, 160 * DEG, 290 * DEG).stroke({ width, color: C.white, alpha: hiAlpha, cap: 'round' });
  arcPath(ctx, r, -20 * DEG, 110 * DEG).stroke({ width, color: C.black, alpha: loAlpha, cap: 'round' });
}

/** Arc as its own sub-path (Pixi arc() would otherwise join the previous point with a line). */
export function arcPath(ctx: GraphicsContext, r: number, a0: number, a1: number): GraphicsContext {
  return ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).arc(0, 0, r, a0, a1);
}

const memo = new Map<string, GraphicsContext>();
function once(key: string, draw: (ctx: GraphicsContext) => void): GraphicsContext {
  let ctx = memo.get(key);
  if (!ctx) {
    ctx = new GraphicsContext();
    draw(ctx);
    memo.set(key, ctx);
  }
  return ctx;
}

export function ringContext(): GraphicsContext {
  return once('ring', (g) => {
    const R = WHEEL.socketRadius;
    // cast shadow (light top-left → shadow bottom-right)
    g.circle(6, 8, R + 6).fill({ color: C.black, alpha: 0.18 });
    g.circle(4, 5, R + 2).fill({ color: C.black, alpha: 0.4 });
    // stone socket
    g.circle(0, 0, R).fill(lit(C.stoneLight, C.stoneDark, C.stone));
    const rng = mulberry32(7);
    for (let i = 0; i < 70; i++) {
      const a = rng() * Math.PI * 2;
      const d = WHEEL.rimOuter + 1 + rng() * (R - WHEEL.rimOuter - 2);
      g.circle(Math.cos(a) * d, Math.sin(a) * d, 0.5 + rng() * 0.9).fill({
        color: rng() > 0.5 ? C.white : C.black,
        alpha: 0.08 + rng() * 0.1,
      });
    }
    bevelArcs(g, R - 1, 1.5, 0.18, 0.35);
    // brass rim
    g.circle(0, 0, WHEEL.rimOuter).fill(lit(C.brassLight, C.brassShadow, C.brass)).circle(0, 0, WHEEL.rimInner).cut();
    g.circle(0, 0, WHEEL.rimOuter).stroke({ width: 1.2, color: C.brassDeep, alpha: 0.9 });
    bevelArcs(g, WHEEL.rimOuter - 1.5, 1.4, 0.45, 0.4);
    // engraved ticks on the rim
    for (let i = 0; i < 36; i++) {
      const a = i * 10 * DEG;
      const r0 = WHEEL.rimInner + 2;
      const r1 = WHEEL.rimOuter - 2;
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
        .lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
        .stroke({ width: 1, color: C.brassDeep, alpha: 0.45 });
    }
    // dark gap where the disc sits
    g.circle(0, 0, WHEEL.rimInner).stroke({ width: 2, color: C.black, alpha: 0.7 });
  });
}

export function discContext(): GraphicsContext {
  return once('disc', (g) => {
    const R = WHEEL.discRadius;
    g.circle(0, 0, R).fill(lit(C.brassLight, C.brassShadow, C.brass));
    g.circle(0, 0, R - 2).stroke({ width: 1, color: C.brassDeep, alpha: 0.5 });
    // enamel band that carries the numerals
    const outer = Math.max(WHEEL.bandOuter, WHEEL.windowOuter + 1);
    g.circle(0, 0, outer).fill(vertical(0x2a1c12, 0x120b07)).circle(0, 0, WHEEL.bandInner).cut();
    g.circle(0, 0, outer).stroke({ width: 1.2, color: C.brassLight, alpha: 0.35 });
    g.circle(0, 0, WHEEL.bandInner).stroke({ width: 1.2, color: C.black, alpha: 0.6 });
    // faint engraved guide circles inside the band
    g.circle(0, 0, outer - 4).stroke({ width: 0.8, color: C.brass, alpha: 0.18 });
    g.circle(0, 0, WHEEL.bandInner + 4).stroke({ width: 0.8, color: C.brass, alpha: 0.18 });
    // separators between numerals (seen only while turning)
    const W = ((WHEEL.windowStartDeg + WHEEL.windowEndDeg) / 2) * DEG;
    for (let i = 0; i < 3; i++) {
      const a = W + (i * 120 + 60) * DEG;
      const r = WHEEL.numeralRadius;
      g.circle(Math.cos(a) * r, Math.sin(a) * r, 3).fill(C.brass);
      g.circle(Math.cos(a) * r - 0.8, Math.sin(a) * r - 0.8, 1.2).fill({ color: C.brassLight, alpha: 0.8 });
    }
  });
}

export function irisContext(): GraphicsContext {
  return once('iris', (g) => {
    const R = WHEEL.irisRadius;
    const ws = WHEEL.windowStartDeg;
    const we = WHEEL.windowEndDeg;
    const wedge = wedgePoints(WHEEL.windowInner, WHEEL.windowOuter, ws, we);
    g.circle(0, 0, R).fill(lit(0xd6b25e, 0x5a4219, C.brass)).poly(wedge).cut();
    const inWindow = (deg: number) => {
      const d = ((deg % 360) + 360) % 360;
      return d >= ws - 1.5 && d <= we + 1.5;
    };
    // radial striations (the "iris")
    for (let i = 0; i < 96; i++) {
      const deg = i * 3.75;
      const a = deg * DEG;
      const r0 = 19;
      const r1 = inWindow(deg) ? WHEEL.windowInner - 1 : R - 3;
      const dark = i % 2 === 0;
      const lenJitter = dark ? 0 : 6 + (i % 5) * 3;
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
        .lineTo(Math.cos(a) * Math.max(r0 + 1, r1 - lenJitter), Math.sin(a) * Math.max(r0 + 1, r1 - lenJitter))
        .stroke({ width: dark ? 1.3 : 0.9, color: dark ? 0x3b2a0c : 0xf2d68c, alpha: dark ? 0.42 : 0.22 });
    }
    // concentric engraved rings (broken by the window)
    arcPath(g, R - 4, (we + 2) * DEG, (ws + 358) * DEG).stroke({ width: 1.2, color: 0x3b2a0c, alpha: 0.55 });
    arcPath(g, R - 9, (we + 2) * DEG, (ws + 358) * DEG).stroke({ width: 0.8, color: 0xf2d68c, alpha: 0.25 });
    // dark collar around the pupil
    g.circle(0, 0, 20).fill(lit(0x4d3912, 0x1c1206));
    g.circle(0, 0, 20).stroke({ width: 1.2, color: 0xf2d68c, alpha: 0.35 });
    // window bevel: shadow falling onto the disc, light catching the far edge
    g.poly(wedge).stroke({ width: 3, color: C.black, alpha: 0.55, alignment: 0.5 });
    arcPath(g, WHEEL.windowOuter + 1.5, (ws + 3) * DEG, (we - 3) * DEG).stroke({ width: 1, color: 0xf2d68c, alpha: 0.4 });
    // outer edge
    g.circle(0, 0, R).stroke({ width: 1.5, color: C.black, alpha: 0.55 });
    bevelArcs(g, R - 1.5, 1.2, 0.35, 0.25);
  });
}

export function pupilContext(): GraphicsContext {
  return once('pupil', (g) => {
    const r = WHEEL.pupilRadius;
    g.circle(0, 0, r + 1.5).fill({ color: C.teal, alpha: 0.55 });
    g.circle(0, 0, r).fill(C.pupil);
    g.circle(0, 0, r - 4).stroke({ width: 1, color: C.teal, alpha: 0.22 });
  });
}

export function highlightContext(): GraphicsContext {
  return once('highlight', (g) => {
    g.ellipse(-4.5, -5, 3.2, 2.4).fill({ color: C.white, alpha: 0.92 });
    g.circle(3.5, 4, 1.2).fill({ color: C.white, alpha: 0.45 });
  });
}

/** Lid edge curvature: edge y(x) = ∓k·x²/R. */
export const LID_K = 0.32;

function lidEdge(sign: 1 | -1, offset = 0): number[] {
  const R = WHEEL.eyeRadius;
  const pts: number[] = [];
  for (let x = -R - 8; x <= R + 8; x += 6) pts.push(x, sign * -1 * ((LID_K * x * x) / R) + offset);
  return pts;
}

export function lidTopContext(): GraphicsContext {
  return once('lidTop', (g) => {
    const R = WHEEL.eyeRadius;
    const edge = lidEdge(1);
    const body = [...edge, R + 8, -2.4 * R, -R - 8, -2.4 * R];
    // cast shadow onto the eye just below the lid edge
    g.poly(lidEdge(1, 4), false).stroke({ width: 7, color: C.black, alpha: 0.35 });
    g.poly(body).fill(vertical(0x4a3612, 0x9a7630));
    for (const off of [-9, -19, -31]) {
      g.poly(lidEdge(1, off), false).stroke({ width: 1, color: 0x2e2008, alpha: 0.45 });
    }
    // lip
    g.poly(edge, false).stroke({ width: 3, color: C.brassLight, alpha: 0.9 });
    g.poly(lidEdge(1, -2.5), false).stroke({ width: 1, color: C.brassDeep, alpha: 0.6 });
  });
}

export function lidBottomContext(): GraphicsContext {
  return once('lidBottom', (g) => {
    const R = WHEEL.eyeRadius;
    const edge = lidEdge(-1);
    const body = [...edge, R + 8, 2.4 * R, -R - 8, 2.4 * R];
    g.poly(body).fill(vertical(0x8a6a2a, 0x3a2a0e));
    for (const off of [9, 19, 31]) {
      g.poly(lidEdge(-1, off), false).stroke({ width: 1, color: 0x2e2008, alpha: 0.45 });
    }
    g.poly(edge, false).stroke({ width: 2.5, color: 0xd6b25e, alpha: 0.75 });
    g.poly(lidEdge(-1, 2.5), false).stroke({ width: 1, color: C.brassDeep, alpha: 0.5 });
  });
}

/** Lid edge-centre Y for a closure c ∈ [0, 1] (0 = fully open, 1 = closed with overlap). */
export function lidTopY(c: number): number {
  const R = WHEEL.eyeRadius;
  return -R - 4 + (R + 4 + 0.35 * R) * c;
}
export function lidBottomY(c: number): number {
  const R = WHEEL.eyeRadius;
  return R + 4 - (R + 4 + 0.35 * R) * c;
}

export function arrowContext(dir: 'cw' | 'ccw', pressed: boolean): GraphicsContext {
  return once(`arrow_${dir}_${pressed ? 'p' : 'n'}`, (g) => {
    const r = 17;
    const off = pressed ? 1 : 0;
    g.circle(2.5, 3.5, r + 1).fill({ color: C.black, alpha: pressed ? 0.3 : 0.5 });
    g.circle(off, off, r).fill(pressed ? lit(0x9c7a30, 0x4a3612) : lit(C.brassLight, C.brassShadow, C.brass));
    g.circle(off, off, r).stroke({ width: 1.2, color: C.brassDeep, alpha: 0.9 });
    g.circle(off, off, r - 3).stroke({ width: 0.8, color: pressed ? C.black : C.white, alpha: pressed ? 0.25 : 0.3 });
    // curved arrow glyph; drawn for clockwise, mirrored for counter-clockwise
    const s = dir === 'cw' ? 1 : -1;
    const ar = 8;
    const a0 = -200 * DEG;
    const a1 = -25 * DEG;
    const pts: number[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = a0 + ((a1 - a0) * i) / 16;
      pts.push(s * Math.cos(a) * ar + off, Math.sin(a) * ar + off + 1.5);
    }
    g.poly(pts, false).stroke({ width: 3, color: 0x24180a, alpha: 0.95, cap: 'round' });
    // arrowhead at a1, pointing along the clockwise tangent
    const ex = Math.cos(a1) * ar;
    const ey = Math.sin(a1) * ar + 1.5;
    const tx = -Math.sin(a1);
    const ty = Math.cos(a1);
    const nx = -ty;
    const ny = tx;
    const head = [
      ex + tx * 5, ey + ty * 5,
      ex - tx * 1.5 + nx * 4.5, ey - ty * 1.5 + ny * 4.5,
      ex - tx * 1.5 - nx * 4.5, ey - ty * 1.5 - ny * 4.5,
    ];
    g.poly(head.map((v, i) => (i % 2 === 0 ? s * v + off : v + off))).fill({ color: 0x24180a, alpha: 0.95 });
  });
}

/** Brass locking collar that contracts onto the wheel on unlock (outer 92, inner 66). */
export function lockRingContext(): GraphicsContext {
  return once('lockRing', (g) => {
    const ro = WHEEL.socketRadius + 4;
    const ri = 66;
    g.circle(3, 4, ro + 1).fill({ color: C.black, alpha: 0.45 }).circle(3, 4, ri).cut();
    g.circle(0, 0, ro).fill(lit(0xd9b85f, 0x4f3a15, 0x9c7a34)).circle(0, 0, ri).cut();
    g.circle(0, 0, ro).stroke({ width: 1.5, color: C.brassDeep, alpha: 0.9 });
    g.circle(0, 0, ri).stroke({ width: 2.5, color: C.black, alpha: 0.6 });
    bevelArcs(g, ro - 2, 1.4, 0.45, 0.35);
    // six bolts / latches
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 + 30) * DEG;
      const r = (ro + ri) / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      g.circle(x + 1, y + 1.4, 5).fill({ color: C.black, alpha: 0.45 });
      g.circle(x, y, 5).fill(lit(C.brassLight, C.brassShadow));
      g.moveTo(x - 3, y).lineTo(x + 3, y).stroke({ width: 1.2, color: C.brassDeep, alpha: 0.9 });
    }
    // engraved ring
    g.circle(0, 0, (ro + ri) / 2 + 9).stroke({ width: 0.8, color: C.brassDeep, alpha: 0.5 });
    g.circle(0, 0, (ro + ri) / 2 - 9).stroke({ width: 0.8, color: C.brassDeep, alpha: 0.5 });
  });
}
