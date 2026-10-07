/**
 * Drifting mist made of soft procedural puffs. One `density` value (0 = thin wisps, 1 = shrouded)
 * blends every puff between its wisp alpha and its shroud alpha. The mist can part outward from a
 * point (intro) or roll back in from the edges (reset).
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { LOGICAL } from '../layout';
import { mistPuff } from '../render/textures';
import { approach, clamp, lerp } from '../util/tween';
import { mulberry32, randBetween, type Rng } from '../util/random';

interface Puff {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Extra (impulse) velocity, decays to zero. */
  ix: number;
  iy: number;
  aShroud: number;
  aThin: number;
  size: number;
  vr: number;
  phase: number;
}

const MARGIN = 260;

export class Mist {
  readonly root = new Container({ label: 'mist' });
  private puffs: Puff[] = [];
  private rng: Rng;
  /** Current and target density. */
  density = 1;
  private target = 1;
  private rate = 1;
  private t = 0;

  constructor(count = 30, seed = 9, texture?: (variant: number) => Texture) {
    this.rng = mulberry32(seed);
    const R = this.rng;
    for (let i = 0; i < count; i++) {
      const tex = texture ? texture(i % 4) : mistPuff(i % 4);
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.tint = i % 5 === 0 ? 0x5fa89e : 0x7c8c8a;
      const size = randBetween(R, 520, 900);
      s.width = s.height = size;
      const wisp = i % 4 === 0; // a quarter of the puffs linger as thin wisps
      const p: Puff = {
        s,
        x: randBetween(R, -100, LOGICAL.width + 100),
        y: randBetween(R, -100, LOGICAL.height + 100),
        vx: randBetween(R, 6, 16) * (R() < 0.5 ? -1 : 1),
        vy: randBetween(R, -4, 4),
        ix: 0,
        iy: 0,
        aShroud: randBetween(R, 0.16, 0.3),
        aThin: wisp ? randBetween(R, 0.025, 0.05) : 0,
        size,
        vr: randBetween(R, -0.03, 0.03),
        phase: R() * Math.PI * 2,
      };
      s.rotation = R() * Math.PI * 2;
      this.puffs.push(p);
      this.root.addChild(s);
    }
    this.apply();
  }

  /** Swap the puff texture (visual mode change); motion and alpha are untouched. */
  retexture(texture: (variant: number) => Texture): void {
    this.puffs.forEach((p, i) => {
      const size = p.size;
      p.s.texture = texture(i % 4);
      p.s.width = p.s.height = size;
    });
  }

  /** Move density toward `d` over roughly `ms`. */
  setDensity(d: number, ms = 1500): void {
    this.target = clamp(d, 0, 1);
    this.rate = 3000 / Math.max(ms, 1);
  }

  /** Snap density (no transition). */
  setDensityNow(d: number): void {
    this.target = this.density = clamp(d, 0, 1);
    this.apply();
  }

  /** Part outward from (x, y), thinning to wisps. */
  part(x: number, y: number, ms = 2000): void {
    for (const p of this.puffs) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const speed = 1100 * (0.6 + 0.4 * (1 - Math.min(d / 1400, 1)));
      p.ix += (dx / d) * speed;
      p.iy += (dy / d) * speed;
    }
    this.setDensity(0, ms);
  }

  /** Roll back over everything from the edges. */
  roll(ms = 3000): void {
    const R = this.rng;
    for (const p of this.puffs) {
      // place just outside a random edge, push inward
      const side = Math.floor(R() * 4);
      if (side === 0) p.x = -MARGIN * 0.6;
      else if (side === 1) p.x = LOGICAL.width + MARGIN * 0.6;
      else if (side === 2) p.y = -MARGIN * 0.6;
      else p.y = LOGICAL.height + MARGIN * 0.6;
      const tx = randBetween(R, 200, LOGICAL.width - 200);
      const ty = randBetween(R, 150, LOGICAL.height - 150);
      const d = Math.max(Math.hypot(tx - p.x, ty - p.y), 1);
      const speed = randBetween(R, 380, 560);
      p.ix = ((tx - p.x) / d) * speed;
      p.iy = ((ty - p.y) / d) * speed;
    }
    this.setDensity(1, ms);
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.t += dt;
    this.density = lerp(this.density, this.target, approach(this.rate, dtMs));
    if (Math.abs(this.density - this.target) < 0.002) this.density = this.target;
    const damp = Math.exp(-dt * 1.1);
    const W = LOGICAL.width + MARGIN * 2;
    const H = LOGICAL.height + MARGIN * 2;
    for (const p of this.puffs) {
      p.x += (p.vx + p.ix) * dt;
      p.y += (p.vy + p.iy) * dt;
      p.ix *= damp;
      p.iy *= damp;
      // wrap around (only drift, not while being pushed)
      if (Math.abs(p.ix) + Math.abs(p.iy) < 30) {
        if (p.x < -MARGIN) p.x += W;
        else if (p.x > LOGICAL.width + MARGIN) p.x -= W;
        if (p.y < -MARGIN) p.y += H;
        else if (p.y > LOGICAL.height + MARGIN) p.y -= H;
      }
      p.s.rotation += p.vr * dt;
    }
    this.apply();
  }

  private apply() {
    for (const p of this.puffs) {
      const breathe = 0.85 + 0.15 * Math.sin(this.t * 0.35 + p.phase);
      const a = lerp(p.aThin, p.aShroud, this.density) * breathe;
      p.s.alpha = a;
      p.s.visible = a > 0.004;
      p.s.position.set(p.x, p.y);
    }
  }

  get visibleCount(): number {
    return this.puffs.filter((p) => p.s.visible).length;
  }
}
