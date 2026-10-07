/**
 * Wall (behind everything), the top-left light pass over the plate, and the faint teal glimmers
 * that hint at the wheels while the screen is shrouded.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { LOGICAL, type WheelPlacement } from '../layout';
import { registerProcedural } from '../render/layers';
import { C } from '../render/palette';
import { radialLight, stoneWall } from '../render/textures';
import { mulberry32 } from '../util/random';

registerProcedural('wall', () => {
  const s = new Sprite(stoneWall());
  s.anchor.set(0.5);
  return s;
});

let lightTex: Texture | null = null;
/** Soft light from the top left: transparent where lit, dark toward the bottom right and edges. */
function lightPassTexture(): Texture {
  if (lightTex) return lightTex;
  const w = 640;
  const h = 400;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(w * 0.32, h * 0.22, 40, w * 0.4, h * 0.35, w * 0.85);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  lightTex = Texture.from(c);
  return lightTex;
}

export function createLightPass(): Sprite {
  const s = new Sprite(lightPassTexture());
  s.label = 'lightPass';
  s.width = LOGICAL.width;
  s.height = LOGICAL.height;
  return s;
}

export class Glimmers {
  readonly root = new Container({ label: 'glimmers' });
  private items: { s: Sprite; phase: number; speed: number }[] = [];
  private t = 0;
  level = 1;

  constructor(placements: readonly WheelPlacement[]) {
    const rng = mulberry32(31);
    for (const p of placements) {
      const s = new Sprite(radialLight());
      s.anchor.set(0.5);
      s.width = s.height = 150;
      s.position.set(p.x, p.y);
      s.tint = C.teal;
      s.blendMode = 'add';
      this.items.push({ s, phase: rng() * Math.PI * 2, speed: 0.6 + rng() * 0.9 });
      this.root.addChild(s);
    }
  }

  update(dtMs: number): void {
    this.t += dtMs / 1000;
    for (const it of this.items) {
      const f = 0.5 + 0.5 * Math.sin(this.t * it.speed + it.phase);
      const flicker = 0.85 + 0.15 * Math.sin(this.t * 7.3 * it.speed + it.phase * 3);
      it.s.alpha = this.level * (0.05 + 0.14 * f) * flicker;
    }
    this.root.visible = this.level > 0.002;
  }
}
