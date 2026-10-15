import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Vec } from '../pattern/types.ts';
import { lerpColor } from './draw.ts';
import { irisTexture, makeWobble, rng } from './textures.ts';

/** What the scene wants an eye to look like this frame. */
export interface EyeLook {
  /** 0 = closed lid line, 1 = wide open. */
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

/**
 * Plan §7 "organic points": an almond/blob outline perturbed by seeded noise that morphs slowly, wispy
 * lashes, size 0.85–1.15× and a random rotation (no eye has an "up"). The iris is a pre-rendered
 * nebula texture, two counter-rotating copies for the swirl, clipped by the lids.
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
  private readonly lids = new Graphics();

  private readonly w: number;
  private readonly h: number;
  private readonly exponent: number;
  private readonly tilt: number;
  private readonly lashes: { t: number; len: number; bend: number }[] = [];
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
  ) {
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
    this.iris.addChild(this.irisA, this.irisB, this.pupil);
    this.iris.mask = this.mask;

    this.root.addChild(this.glowSprite, this.sclera, this.iris, this.mask, this.lids);
  }

  get position(): Vec {
    return this.home;
  }

  /** Snap the lids shut (flinch). */
  shut(): void {
    this.open = 0;
  }

  update(now: number, dt: number, look: EyeLook): void {
    const tc = look.open > this.open ? 0.06 : look.closeTc;
    this.open += (look.open - this.open) * (1 - Math.exp(-dt / tc));
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
    this.sclera.clear();
    this.mask.clear();
    if (visible) {
      this.sclera.poly(outline, true).fill({ color: 0x0a0720, alpha: 0.92 });
      this.mask.poly(outline, true).fill({ color: 0xffffff });
    }
    this.iris.visible = visible;
    const midY = (upper[SAMPLES + 1] + lower[SAMPLES + 1]) / 2;
    this.iris.position.set(0, midY);
    this.irisA.rotation = time * this.spin;
    this.irisB.rotation = -time * this.spin * 1.7;
    const pulse = 0.85 + 0.15 * Math.sin(time * 3.1 + this.id);
    this.pupil.alpha = Math.min(1, 0.6 + look.glow * 0.5) * pulse;

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
}
