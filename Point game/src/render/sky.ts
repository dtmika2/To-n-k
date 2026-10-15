import { Container, Particle, ParticleContainer, Sprite, type Texture } from 'pixi.js';
import { ASPECT } from '../pattern/types.ts';
import { rng, skyTexture } from './textures.ts';

interface Star {
  p: Particle;
  depth: number;
  base: number;
  twinkle: number;
  phase: number;
}

const DEPTHS = [
  { size: 0.0028, speed: 0.0016, alpha: 0.55, share: 0.55 },
  { size: 0.0042, speed: 0.0032, alpha: 0.75, share: 0.3 },
  { size: 0.0062, speed: 0.0056, alpha: 0.95, share: 0.15 },
];
const TINTS = [0xffffff, 0xdfe6ff, 0xfff1d6, 0xd8ccff];

/** Plan §7 layer 1: night gradient plus ~600 twinkling stars on three depths with parallax drift. */
export class Sky {
  readonly root = new Container();
  private readonly stars: Star[] = [];

  constructor(dot: Texture, count: number) {
    const bg = new Sprite(skyTexture());
    bg.width = 1;
    bg.height = ASPECT;
    const pc = new ParticleContainer({ dynamicProperties: { position: true, color: true } });
    pc.blendMode = 'add';
    const r = rng(4242);
    for (let i = 0; i < count; i++) {
      const roll = r();
      const depth = roll < DEPTHS[0].share ? 0 : roll < DEPTHS[0].share + DEPTHS[1].share ? 1 : 2;
      const d = DEPTHS[depth];
      const size = (d.size * (0.6 + r() * 0.8)) / dot.width;
      const p = new Particle({
        texture: dot,
        x: r(),
        y: r() * ASPECT,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: size,
        scaleY: size,
        tint: TINTS[Math.floor(r() * TINTS.length)],
      });
      pc.addParticle(p);
      this.stars.push({ p, depth, base: d.alpha * (0.4 + r() * 0.6), twinkle: 0.6 + r() * 2.2, phase: r() * 6.283 });
    }
    this.root.addChild(bg, pc);
  }

  update(now: number, dt: number): void {
    const t = now / 1000;
    for (const s of this.stars) {
      const d = DEPTHS[s.depth];
      s.p.x += d.speed * dt;
      s.p.y += d.speed * 0.35 * dt;
      if (s.p.x > 1.01) s.p.x -= 1.02;
      if (s.p.y > ASPECT + 0.01) s.p.y -= ASPECT + 0.02;
      s.p.alpha = s.base * (0.55 + 0.45 * Math.sin(t * s.twinkle + s.phase));
    }
  }
}
