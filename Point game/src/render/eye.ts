import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Vec } from '../pattern/types.ts';
import { lerpColor } from './draw.ts';
import { irisPalette, irisTexture, makeWobble, rng } from './textures.ts';
import { cssHex } from './vfx/shaders.ts';
import { PortalIris } from './vfx/portal.ts';

/** What the scene wants an eye to look like this frame. */
export interface EyeLook {
  /** 0 = closed lid line, 1 = wide open (the eye clamps this to its minimum openness). */
  open: number;
  /** Lid closing time constant (s): short for a blink, long for the slow close after the reveal. */
  closeTc: number;
  glow: number;
  glowColor: number;
  /** Sideways shudder amplitude (world units), for the flinch. */
  shudder: number;
}

const SAMPLES = 22;
const LID = 0xe9dcff;
const LID_WARM = 0xf3d99a;
const LASH_SAMPLES = 7;

/** Lid drawing: 'drawn' = the original constant-width strokes; 'refined' = tapered, glowing, iris-tinted. */
export type LidStyle = 'drawn' | 'refined';

/** Refined lid colour: 'cream' (pale, from the iris's light tone), 'iris' (the iris's own colour) or a fixed colour. */
export type LidColor = 'cream' | 'iris' | number;

interface Lash {
  t: number;
  len: number;
  bend: number;
}

/**
 * Fill a stroke whose half-width varies along it (`halfWidth(i)` for point i): offsets on both sides
 * along the averaged normal, joined into one polygon. Tapers to points where the width is 0.
 */
function taperedStroke(g: Graphics, pts: readonly number[], halfWidth: (i: number) => number): Graphics {
  const n = pts.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = pts[b * 2] - pts[a * 2];
    const dy = pts[b * 2 + 1] - pts[a * 2 + 1];
    const l = Math.hypot(dx, dy) || 1;
    const w = halfWidth(i);
    const nx = (-dy / l) * w;
    const ny = (dx / l) * w;
    left.push(pts[i * 2] + nx, pts[i * 2 + 1] + ny);
    right.push(pts[i * 2] - nx, pts[i * 2 + 1] - ny);
  }
  const poly = [...left];
  for (let i = n - 1; i >= 0; i--) poly.push(right[i * 2], right[i * 2 + 1]);
  return g.poly(poly, true);
}

/**
 * Plan §7 "organic points": an almond/blob outline perturbed by seeded noise that morphs slowly, wispy
 * lashes, size 0.85–1.15× and a random rotation (no eye has an "up"). The iris is a pre-rendered
 * nebula texture, two counter-rotating copies for the swirl, clipped by the lids. In the "vfx" look a
 * portal shader (vfx/portal.ts) replaces the iris and pupil inside the same lids.
 */
export class Eye {
  readonly root = new Container();
  private readonly glowSprite: Sprite;
  private readonly sclera = new Graphics();
  private readonly mask = new Graphics();
  private readonly iris = new Container();
  private readonly irisA: Sprite;
  private readonly irisB: Sprite;
  private readonly pupil: Sprite;
  private readonly portal: PortalIris;
  private readonly lids = new Graphics();
  /** Refined lids: additive halo under the lid lines. */
  private readonly lidGlow = new Graphics();
  /** Refined lids: the lid's shadow and a rim of light just inside the opening (clipped with the iris). */
  private readonly innerShade = new Graphics();
  /** Lid drawing style: 'refined' in the game (both looks); 'drawn' is kept for comparison in the lab. */
  lidStyle: LidStyle = 'refined';
  /** Colour of the refined lids (the iris's own colour in the game); they warm slightly towards gold as the eye glows. */
  lidColor: LidColor = 'iris';

  private readonly w: number;
  private readonly h: number;
  private readonly exponent: number;
  private readonly tilt: number;
  private readonly lashes: Lash[] = [];
  private readonly upperLashes: Lash[] = [];
  private readonly lowerLashes: Lash[] = [];
  /** Iris palette as colours: deep, mid, hot. */
  private readonly pal: [number, number, number];
  private readonly wobA: (x: number) => number;
  private readonly wobB: (x: number) => number;
  private readonly spin: number;
  open = 0;

  constructor(
    readonly id: number,
    private readonly home: Vec,
    r: number,
    seed: number,
    dot: Texture,
    /** The lids never close further than this (0 = fully closed line, 1 = wide open). */
    private readonly minOpen = 0,
  ) {
    this.open = minOpen;
    const rand = rng(seed);
    const size = 0.85 + rand() * 0.3;
    this.w = r * 1.12 * size;
    this.h = this.w * (0.55 + rand() * 0.2);
    this.exponent = 0.6 + rand() * 0.5;
    this.tilt = (rand() - 0.5) * 0.35;
    this.spin = (rand() < 0.5 ? -1 : 1) * (0.15 + rand() * 0.2);
    this.wobA = makeWobble(seed * 3 + 1);
    this.wobB = makeWobble(seed * 5 + 2);
    const nLashes = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < nLashes; i++) {
      this.lashes.push({ t: -0.78 + (1.56 * (i + 0.5)) / nLashes + (rand() - 0.5) * 0.08, len: 0.5 + rand() * 0.5, bend: (rand() - 0.5) * 0.8 });
    }
    // refined lashes: their own generator, so the drawn eyes keep their exact shapes
    const lr = rng(seed * 11 + 7);
    const nUpper = 9 + Math.floor(lr() * 4);
    for (let i = 0; i < nUpper; i++) {
      const t = -0.84 + (1.68 * (i + 0.5)) / nUpper + (lr() - 0.5) * 0.06;
      // curl towards the nearer corner, with some individual variation
      this.upperLashes.push({ t, len: 0.55 + lr() * 0.45, bend: Math.sign(t) * 0.55 + (lr() - 0.5) * 0.5 });
    }
    const nLower = 4 + Math.floor(lr() * 3);
    for (let i = 0; i < nLower; i++) {
      const t = -0.55 + (1.1 * (i + 0.5)) / nLower + (lr() - 0.5) * 0.08;
      this.lowerLashes.push({ t, len: 0.3 + lr() * 0.2, bend: Math.sign(t) * 0.3 + (lr() - 0.5) * 0.3 });
    }
    this.pal = irisPalette(seed).map(cssHex) as [number, number, number];

    this.root.position.set(home.x, home.y);
    this.root.rotation = rand() * Math.PI * 2;

    this.glowSprite = new Sprite(dot);
    this.glowSprite.anchor.set(0.5);
    this.glowSprite.blendMode = 'add';
    const glowSize = this.w * 3.6;
    this.glowSprite.width = glowSize;
    this.glowSprite.height = glowSize;

    const tex = irisTexture(seed);
    this.irisA = new Sprite(tex);
    this.irisB = new Sprite(tex);
    this.pupil = new Sprite(dot);
    for (const s of [this.irisA, this.irisB, this.pupil]) s.anchor.set(0.5);
    const irisSize = this.h * 2.1;
    this.irisA.width = this.irisA.height = irisSize;
    this.irisB.width = this.irisB.height = irisSize * 0.8;
    this.irisB.alpha = 0.55;
    this.irisB.blendMode = 'add';
    this.pupil.width = this.pupil.height = this.h * 0.75;
    this.pupil.tint = 0xfff6e0;
    this.portal = new PortalIris(seed, irisPalette(seed), this.h * 1.2, this.spin * 1.6);
    this.portal.mesh.visible = false;
    this.iris.addChild(this.irisA, this.irisB, this.pupil, this.portal.mesh, this.innerShade);
    this.iris.mask = this.mask;
    this.lidGlow.blendMode = 'add';

    this.root.addChild(this.glowSprite, this.sclera, this.iris, this.mask, this.lidGlow, this.lids);
  }

  get position(): Vec {
    return this.home;
  }

  /** Snap the lids shut, as far as they go (flinch). */
  shut(): void {
    this.open = this.minOpen;
  }

  /** `vfx`: draw the portal instead of the nebula iris. */
  update(now: number, dt: number, look: EyeLook, vfx = false): void {
    const target = Math.max(this.minOpen, look.open);
    const tc = target > this.open ? 0.06 : look.closeTc;
    this.open += (target - this.open) * (1 - Math.exp(-dt / tc));
    const time = now / 1000;
    const open = this.open;

    this.root.x = this.home.x + Math.sin(now * 0.09) * look.shudder;

    this.glowSprite.tint = look.glowColor;
    this.glowSprite.alpha = Math.min(1, look.glow);
    const gs = this.w * (3 + 1.2 * look.glow);
    this.glowSprite.width = this.glowSprite.height = gs;

    // lid curves: upper and lower meet in a drooping line when closed
    const upper: number[] = [];
    const lower: number[] = [];
    const morph = 1 + 0.06 * this.wobB(time * 0.23);
    for (let i = 0; i <= SAMPLES; i++) {
      const t = -1 + (2 * i) / SAMPLES;
      const x = t * this.w * morph;
      const base = Math.pow(Math.max(0, 1 - t * t), this.exponent);
      const n = 1 + 0.14 * this.wobA(time * 0.31 + t * 2.1);
      const closedY = this.h * 0.3 * (1 - t * t) + this.tilt * t * this.h * 0.3;
      upper.push(x, closedY + (-this.h * base * n - closedY) * open);
      lower.push(x, closedY + (this.h * 0.78 * base * (2 - n) - closedY) * open);
    }
    const outline: number[] = [...upper];
    for (let i = SAMPLES - 1; i > 0; i--) outline.push(lower[i * 2], lower[i * 2 + 1]);

    const visible = open > 0.03;
    const refined = this.lidStyle === 'refined';
    this.sclera.clear();
    this.mask.clear();
    if (visible) {
      this.sclera.poly(outline, true).fill({ color: refined ? lerpColor(0x0a0720, this.pal[0], 0.1) : 0x0a0720, alpha: 0.92 });
      this.mask.poly(outline, true).fill({ color: 0xffffff });
    }
    this.iris.visible = visible;
    this.irisA.visible = this.irisB.visible = this.pupil.visible = !vfx;
    this.portal.mesh.visible = vfx && visible;
    const midY = (upper[SAMPLES + 1] + lower[SAMPLES + 1]) / 2;
    this.iris.position.set(0, midY);
    this.irisA.rotation = time * this.spin;
    this.irisB.rotation = -time * this.spin * 1.7;
    const pulse = 0.85 + 0.15 * Math.sin(time * 3.1 + this.id);
    this.pupil.alpha = Math.min(1, 0.6 + look.glow * 0.5) * pulse;
    if (vfx && visible) this.portal.update(now, look.glow * pulse, open);

    if (refined) {
      this.drawRefined(time, look, upper, lower, outline, midY, visible);
      return;
    }
    this.innerShade.clear();
    this.lidGlow.clear();

    // lids and lashes
    const lidColor = lerpColor(LID, LID_WARM, Math.min(1, look.glow));
    const lidAlpha = 0.45 + 0.5 * Math.min(1, look.glow + open * 0.5);
    const g = this.lids;
    g.clear();
    g.moveTo(upper[0], upper[1]);
    for (let i = 1; i <= SAMPLES; i++) g.lineTo(upper[i * 2], upper[i * 2 + 1]);
    g.stroke({ width: this.h * 0.12, color: lidColor, alpha: lidAlpha });
    if (visible) {
      g.moveTo(lower[0], lower[1]);
      for (let i = 1; i <= SAMPLES; i++) g.lineTo(lower[i * 2], lower[i * 2 + 1]);
      g.stroke({ width: this.h * 0.07, color: lidColor, alpha: lidAlpha * 0.7 });
    }
    const dirY = 1 - 2 * Math.min(1, open * 1.6); // lashes hang down when closed, lift when open
    for (const lash of this.lashes) {
      const i = Math.round(((lash.t + 1) / 2) * SAMPLES);
      const bx = upper[i * 2];
      const by = upper[i * 2 + 1];
      const len = this.h * 0.55 * lash.len * (1 - Math.abs(lash.t) * 0.4) * (1 + 0.15 * this.wobA(time * 0.5 + lash.t * 5));
      const dx = lash.t * 0.7;
      const dl = Math.hypot(dx, dirY) || 1;
      const ux = dx / dl;
      const uy = dirY / dl;
      const mx = bx + ux * len * 0.55 - uy * lash.bend * len * 0.25;
      const my = by + uy * len * 0.55 + ux * lash.bend * len * 0.25;
      g.moveTo(bx, by)
        .lineTo(mx, my)
        .lineTo(bx + ux * len + -uy * lash.bend * len * 0.4, by + uy * len + ux * lash.bend * len * 0.4)
        .stroke({ width: this.h * 0.05, color: lidColor, alpha: lidAlpha * 0.75 });
    }
  }

  /**
   * Refined lids: brush-like tapered lid lines with an additive halo and a sheen, curved tapered lashes
   * (a few small ones on the lower lid when open), and inside the opening the lid's soft shadow plus a
   * thin rim of light, so the iris sits in the eye. Colours come from the eye's iris palette.
   */
  private drawRefined(time: number, look: EyeLook, upper: number[], lower: number[], outline: number[], midY: number, visible: boolean): void {
    const open = this.open;
    const [, mid, hot] = this.pal;
    const glow = Math.min(1, look.glow);
    const base = this.lidColor === 'cream' ? lerpColor(LID, hot, 0.55) : this.lidColor === 'iris' ? lerpColor(mid, 0xffffff, 0.2) : this.lidColor;
    // a glowing eye warms its lids towards gold, lightly, so the chosen colour stays readable
    const lidColor = lerpColor(base, LID_WARM, glow * 0.35);
    // cream lids keep a halo in the iris colour; the others glow in their own colour
    const haloColor = lerpColor(this.lidColor === 'cream' || this.lidColor === 'iris' ? mid : base, LID_WARM, glow * 0.35);
    const lidAlpha = 0.55 + 0.45 * Math.min(1, look.glow + open * 0.5);
    const h = this.h;
    const profile = (i: number, max: number, min: number) => {
      const t = -1 + (2 * i) / SAMPLES;
      return min + max * Math.pow(Math.max(0, 1 - t * t), 0.7);
    };

    // inside the opening (drawn in the iris container, which sits at midY and is clipped by the lids)
    const sh = this.innerShade;
    sh.clear();
    if (visible) {
      const inner = outline.map((v, k) => (k % 2 ? v - midY : v));
      // feathered: many strokes of growing width and small alpha overlap most at the edge, so the
      // shadow fades smoothly inwards instead of ending in bands
      const depth = 0.3 + 0.7 * open;
      const SHADE_LAYERS = 8;
      for (let k = 1; k <= SHADE_LAYERS; k++) {
        sh.poly(inner, true).stroke({ width: h * 0.65 * depth * (k / SHADE_LAYERS), color: 0x05030f, alpha: 0.09, join: 'round' });
      }
      for (let k = 1; k <= 3; k++) {
        sh.poly(inner, true).stroke({ width: h * 0.1 * (k / 3), color: haloColor, alpha: (0.35 + 0.3 * glow) / 3, join: 'round' });
      }
    }

    // halo under the lid lines: stacked widening layers with small alphas add up to a soft falloff
    const gl = this.lidGlow;
    gl.clear();
    const haloAlpha = 0.045 + 0.07 * glow;
    for (const k of [0.05, 0.09, 0.14, 0.2]) {
      taperedStroke(gl, upper, (i) => profile(i, h * k, h * k * 0.1)).fill({ color: haloColor, alpha: haloAlpha });
      if (visible) taperedStroke(gl, lower, (i) => profile(i, h * k * 0.6, h * k * 0.06)).fill({ color: haloColor, alpha: haloAlpha * 0.8 });
    }

    const g = this.lids;
    g.clear();
    // upper lid: swells in the middle, fine points at the corners, with a lighter sheen along its middle
    taperedStroke(g, upper, (i) => profile(i, h * 0.065, h * 0.006)).fill({ color: lidColor, alpha: lidAlpha });
    taperedStroke(g, upper, (i) => profile(i, h * 0.022, 0)).fill({ color: lerpColor(lidColor, 0xffffff, 0.6), alpha: lidAlpha * 0.8 });
    if (visible) {
      const k = Math.min(1, (open - 0.03) / 0.15);
      taperedStroke(g, lower, (i) => profile(i, h * 0.045, h * 0.005)).fill({ color: lidColor, alpha: lidAlpha * 0.9 * k });
    }

    // lashes: hang down when closed, lift when open (as the drawn lids), as curved tapered strokes
    const dirY = 1 - 2 * Math.min(1, open * 1.6);
    for (const lash of this.upperLashes) this.lash(g, upper, lash, dirY, h * 0.75, time, lidColor, lidAlpha * 0.9);
    const lowerK = Math.max(0, Math.min(1, (open - 0.3) / 0.3));
    if (visible && lowerK > 0) {
      for (const lash of this.lowerLashes) this.lash(g, lower, lash, 1, h * 0.5, time, lidColor, lidAlpha * 0.6 * lowerK);
    }
  }

  /** One curved lash from the lid curve `line` at `lash.t`, tapering from base to tip. */
  private lash(g: Graphics, line: number[], lash: Lash, dirY: number, scale: number, time: number, color: number, alpha: number): void {
    const i = Math.round(((lash.t + 1) / 2) * SAMPLES);
    const bx = line[i * 2];
    const by = line[i * 2 + 1];
    const len = scale * lash.len * (1 - Math.abs(lash.t) * 0.35) * (1 + 0.12 * this.wobA(time * 0.5 + lash.t * 5));
    const bend = lash.bend + 0.12 * this.wobB(time * 0.6 + lash.t * 4);
    const dx = lash.t * 0.9;
    const dl = Math.hypot(dx, dirY) || 1;
    const ux = dx / dl;
    const uy = dirY / dl;
    // quadratic curve: the control point pushes sideways, the tip curls further
    const cx = bx + ux * len * 0.5 - uy * bend * len * 0.3;
    const cy = by + uy * len * 0.5 + ux * bend * len * 0.3;
    const ex = bx + ux * len - uy * bend * len * 0.75;
    const ey = by + uy * len + ux * bend * len * 0.75;
    const pts: number[] = [];
    for (let k = 0; k <= LASH_SAMPLES; k++) {
      const s = k / LASH_SAMPLES;
      const a = (1 - s) * (1 - s);
      const b = 2 * (1 - s) * s;
      const c = s * s;
      pts.push(a * bx + b * cx + c * ex, a * by + b * cy + c * ey);
    }
    const w0 = this.h * 0.022;
    const taper = (k: number) => w0 * Math.pow(1 - k / LASH_SAMPLES, 1.4);
    taperedStroke(g, pts, taper).fill({ color, alpha: alpha * 0.5 });
    taperedStroke(g, pts.slice(0, (Math.ceil(LASH_SAMPLES * 0.6) + 1) * 2), (k) => taper(k) * 0.8).fill({ color, alpha: alpha * 0.6 });
  }
}
