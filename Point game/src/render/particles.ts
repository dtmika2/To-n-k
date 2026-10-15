import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import type { Vec } from '../pattern/types.ts';

interface Live {
  p: Particle;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
  grow: number;
  alpha: number;
  alive: boolean;
}

export interface Emit {
  pos: Vec;
  /** Speed (world units / s) of the random initial velocity. */
  speed: number;
  life: number;
  size: number;
  /** Size multiplier reached at the end of life (puffs grow, dust shrinks). */
  grow?: number;
  tint: number;
  alpha?: number;
  drift?: Vec;
}

/** Fixed-size pool of soft additive sprites: stardust off the tether, sparks, the collapse puff. */
export class Particles {
  readonly container: ParticleContainer;
  private readonly pool: Live[] = [];
  private next = 0;
  private readonly texSize: number;

  constructor(texture: Texture, count: number, blend: 'add' | 'normal' = 'add') {
    this.container = new ParticleContainer({ dynamicProperties: { position: true, color: true, vertex: true } });
    this.container.blendMode = blend;
    this.texSize = texture.width;
    for (let i = 0; i < count; i++) {
      const p = new Particle({ texture, anchorX: 0.5, anchorY: 0.5, alpha: 0, scaleX: 0, scaleY: 0 });
      this.container.addParticle(p);
      this.pool.push({ p, vx: 0, vy: 0, born: 0, life: 1, size: 0, grow: 1, alpha: 1, alive: false });
    }
  }

  emit(now: number, e: Emit): void {
    const l = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const a = Math.random() * Math.PI * 2;
    const sp = e.speed * (0.3 + Math.random() * 0.7);
    l.vx = Math.cos(a) * sp + (e.drift?.x ?? 0);
    l.vy = Math.sin(a) * sp + (e.drift?.y ?? 0);
    l.p.x = e.pos.x;
    l.p.y = e.pos.y;
    l.p.tint = e.tint;
    l.born = now;
    l.life = e.life * (0.6 + Math.random() * 0.6);
    l.size = e.size * (0.6 + Math.random() * 0.8);
    l.grow = e.grow ?? 0.3;
    l.alpha = e.alpha ?? 1;
    l.alive = true;
  }

  burst(now: number, n: number, e: Emit): void {
    for (let i = 0; i < n; i++) this.emit(now, e);
  }

  update(now: number, dt: number): void {
    for (const l of this.pool) {
      if (!l.alive) continue;
      const t = (now - l.born) / (l.life * 1000);
      if (t >= 1) {
        l.alive = false;
        l.p.alpha = 0;
        continue;
      }
      l.p.x += l.vx * dt;
      l.p.y += l.vy * dt;
      l.vx *= 0.985;
      l.vy *= 0.985;
      const s = (l.size * (1 + (l.grow - 1) * t)) / this.texSize;
      l.p.scaleX = s;
      l.p.scaleY = s;
      l.p.alpha = l.alpha * Math.sin(Math.PI * Math.min(1, t * 1.3 + 0.05)) * (1 - t * 0.3);
    }
  }
}
