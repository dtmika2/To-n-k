import { Particle, ParticleContainer, type Texture } from 'pixi.js';
import type { Vec } from '../pattern/types.ts';
import { makeOrbit, orbitAlpha, orbitPoint, type Orbit } from './depth.ts';
import { rng } from './textures.ts';

const SIZE = 0.0075; // world units, at normal eye size
const ALPHA = 0.9;

interface Orbiter {
  orbit: Orbit;
  back: Particle;
  front: Particle;
  twinkle: number;
}

interface EyeOrbit {
  id: number;
  home: Vec;
  /** Particle size relative to normal: further eyes have smaller ones. */
  scale: number;
  alpha: number;
  orbiters: Orbiter[];
}

/**
 * Depth mode: particles circling the eyes of one band on tilted paths. `back` is drawn under the eyes and
 * `front` over them. Each orbiter has a particle in both, with only the one on its current side showing,
 * so it passes in front of an eye and then behind it.
 */
export class Orbiters {
  readonly back: ParticleContainer;
  readonly front: ParticleContainer;
  private eyes: EyeOrbit[] = [];

  constructor(private readonly texture: Texture) {
    const make = () => {
      const c = new ParticleContainer({ dynamicProperties: { position: true, color: true, vertex: true } });
      c.blendMode = 'add';
      return c;
    };
    this.back = make();
    this.front = make();
  }

  clear(): void {
    this.back.removeParticles();
    this.front.removeParticles();
    this.eyes = [];
  }

  add(id: number, home: Vec, seed: number, count: number, tint: number, scale: number, alpha: number): void {
    const rand = rng(seed * 13 + 5);
    const orbiters: Orbiter[] = [];
    for (let i = 0; i < count; i++) {
      const make = () => new Particle({ texture: this.texture, anchorX: 0.5, anchorY: 0.5, alpha: 0, scaleX: 0, scaleY: 0, tint });
      const orbiter = { orbit: makeOrbit(rand), back: make(), front: make(), twinkle: rand() * Math.PI * 2 };
      this.back.addParticle(orbiter.back);
      this.front.addParticle(orbiter.front);
      orbiters.push(orbiter);
    }
    this.eyes.push({ id, home, scale, alpha, orbiters });
  }

  /** `radiusOf`: the eye's current visual radius. */
  update(time: number, radiusOf: (id: number) => number): void {
    for (const eye of this.eyes) {
      const r = radiusOf(eye.id);
      for (const o of eye.orbiters) {
        const pathRadius = o.orbit.radius * r;
        const p = orbitPoint(o.orbit, time, r);
        const inFront = p.z >= 0;
        const [shown, hidden] = inFront ? [o.front, o.back] : [o.back, o.front];
        hidden.alpha = 0;
        shown.x = eye.home.x + p.x;
        shown.y = eye.home.y + p.y;
        // closer to the viewer looks bigger, on top of the eye's own depth
        const size = (SIZE * eye.scale * (1 + 0.4 * (p.z / pathRadius))) / this.texture.width;
        shown.scaleX = shown.scaleY = size;
        const twinkle = 0.75 + 0.25 * Math.sin(time * 2.1 + o.twinkle);
        shown.alpha = ALPHA * eye.alpha * twinkle * orbitAlpha(p, r, pathRadius);
      }
    }
  }
}
