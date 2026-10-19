import { Container, Sprite } from 'pixi.js';
import { ASPECT, type Vec } from '../pattern/types.ts';
import { cloudPuffTexture, rng } from './textures.ts';

/**
 * Plan §7 layer 3, the cloud cover, built the way final-gate-lock builds its mist: big soft puffs that
 * drift, turn slowly and breathe. One `density` (0 = thin wisps, 1 = shrouded) blends every puff
 * between its wisp and shroud alpha. At the reveal the puffs are pushed outward from a point and thin
 * out; afterwards they roll back in from the edges. Unlike final-gate-lock there is no black veil, and
 * the whole layer is capped at `opacity`, so the backdrop always shows through slightly.
 */

export interface CloudConfig {
  count: number;
  /** Puff alpha when shrouded, as a random range. */
  shroudAlpha: [number, number];
  /** Alpha of the puffs (every fourth) that linger as wisps after the reveal. */
  wispAlpha: [number, number];
  /** Opacity of the whole layer (< 1 keeps it see-through). */
  opacity: number;
  tints: number[];
}

interface Puff {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Impulse velocity from part/roll; decays to zero. */
  ix: number;
  iy: number;
  aShroud: number;
  aThin: number;
  vr: number;
  phase: number;
}

const MARGIN = 0.2; // world units beyond the edges where puffs wrap

export class CloudCover {
  readonly root = new Container();
  private readonly puffs: Puff[] = [];
  private readonly rand: () => number;
  /** Current density, 0 (wisps) … 1 (shrouded). */
  density = 1;
  private target = 1;
  private rate = 2;
  private t = 0;

  constructor(cfg: CloudConfig, seed = 9) {
    this.rand = rng(seed);
    const R = this.rand;
    const between = (a: number, b: number) => a + R() * (b - a);
    const textures = [0, 1, 2, 3].map((v) => cloudPuffTexture(v));
    for (let i = 0; i < cfg.count; i++) {
      const s = new Sprite(textures[i % 4]);
      s.anchor.set(0.5);
      s.tint = cfg.tints[i % cfg.tints.length];
      const size = between(0.4, 0.72);
      s.width = s.height = size;
      s.rotation = R() * Math.PI * 2;
      const wisp = i % 4 === 0; // a quarter of the puffs linger as thin wisps
      this.puffs.push({
        s,
        x: between(-0.08, 1.08),
        y: between(-0.08, ASPECT + 0.08),
        vx: between(0.005, 0.012) * (R() < 0.5 ? -1 : 1),
        vy: between(-0.003, 0.003),
        ix: 0,
        iy: 0,
        aShroud: between(cfg.shroudAlpha[0], cfg.shroudAlpha[1]),
        aThin: wisp ? between(cfg.wispAlpha[0], cfg.wispAlpha[1]) : 0,
        vr: between(-0.03, 0.03),
        phase: R() * Math.PI * 2,
      });
      this.root.addChild(s);
    }
    this.root.alpha = cfg.opacity;
    this.apply();
  }

  /** Heading for (or at) full cover. */
  get shrouded(): boolean {
    return this.target > 0.5;
  }

  /** Move the density toward `d` over roughly `ms`. */
  setDensity(d: number, ms = 1500): void {
    this.target = Math.min(1, Math.max(0, d));
    this.rate = 3000 / Math.max(ms, 1);
  }

  /** Part outward from `origin`, thinning to wisps over `ms`. */
  part(origin: Vec, ms: number): void {
    for (const p of this.puffs) {
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      const d = Math.max(Math.hypot(dx, dy), 0.001);
      const speed = 0.86 * (0.6 + 0.4 * (1 - Math.min(d / 1.1, 1)));
      p.ix += (dx / d) * speed;
      p.iy += (dy / d) * speed;
    }
    this.setDensity(0, ms);
  }

  /** Roll back over everything from the edges over `ms`. */
  roll(ms: number): void {
    const R = this.rand;
    for (const p of this.puffs) {
      const side = Math.floor(R() * 4);
      if (side === 0) p.x = -MARGIN * 0.6;
      else if (side === 1) p.x = 1 + MARGIN * 0.6;
      else if (side === 2) p.y = -MARGIN * 0.6;
      else p.y = ASPECT + MARGIN * 0.6;
      const tx = 0.15 + R() * 0.7;
      const ty = 0.12 + R() * (ASPECT - 0.24);
      const d = Math.max(Math.hypot(tx - p.x, ty - p.y), 0.001);
      const speed = 0.3 + R() * 0.14;
      p.ix = ((tx - p.x) / d) * speed;
      p.iy = ((ty - p.y) / d) * speed;
    }
    this.setDensity(1, ms);
  }

  update(dt: number): void {
    this.t += dt;
    this.density += (this.target - this.density) * (1 - Math.exp(-this.rate * dt));
    if (Math.abs(this.density - this.target) < 0.002) this.density = this.target;
    const damp = Math.exp(-dt * 1.1);
    const W = 1 + MARGIN * 2;
    const H = ASPECT + MARGIN * 2;
    for (const p of this.puffs) {
      p.x += (p.vx + p.ix) * dt;
      p.y += (p.vy + p.iy) * dt;
      p.ix *= damp;
      p.iy *= damp;
      // wrap around only while drifting, not while being pushed
      if (Math.abs(p.ix) + Math.abs(p.iy) < 0.023) {
        if (p.x < -MARGIN) p.x += W;
        else if (p.x > 1 + MARGIN) p.x -= W;
        if (p.y < -MARGIN) p.y += H;
        else if (p.y > ASPECT + MARGIN) p.y -= H;
      }
      p.s.rotation += p.vr * dt;
    }
    this.apply();
  }

  private apply(): void {
    for (const p of this.puffs) {
      const breathe = 0.85 + 0.15 * Math.sin(this.t * 0.35 + p.phase);
      const a = (p.aThin + (p.aShroud - p.aThin) * this.density) * breathe;
      p.s.alpha = a;
      p.s.visible = a > 0.004;
      p.s.position.set(p.x, p.y);
    }
  }
}
