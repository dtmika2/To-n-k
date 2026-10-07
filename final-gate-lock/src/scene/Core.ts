/**
 * Unlock effects: the glowing gold core behind the plate, falling dust, and the teal pulse across
 * the plate. Glow, dust and sparks stay procedural even in sprite mode (DESIGN), except the core
 * disc itself, which is a manifest layer ('core').
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { LOGICAL, PLATE } from '../layout';
import { registerProcedural, type LayerFactory } from '../render/layers';
import { C } from '../render/palette';
import { godRays, radialLight } from '../render/textures';
import { mulberry32, randBetween, type Rng } from '../util/random';

registerProcedural('core', () => {
  const c = new Container();
  const rays = new Sprite(godRays());
  rays.anchor.set(0.5);
  rays.width = rays.height = 980;
  rays.tint = C.gold;
  rays.blendMode = 'add';
  const disc = new Graphics()
    .circle(0, 0, 118)
    .fill({ color: 0xe0a640, alpha: 0.95 })
    .circle(0, 0, 118)
    .stroke({ width: 6, color: 0xfff1c8, alpha: 0.8 })
    .circle(0, 0, 80)
    .fill({ color: 0xffeab0, alpha: 0.95 })
    .circle(0, 0, 44)
    .fill({ color: 0xffffff, alpha: 0.95 });
  c.addChild(rays, disc);
  return c;
});

interface Mote {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
}

export class UnlockFx {
  /** Behind the plate. */
  readonly core = new Container({ label: 'coreFx' });
  /** Above the plate (dust, teal pulse). */
  readonly front = new Container({ label: 'unlockFront' });
  private coreSlot = new Container({ label: 'slot:core' });
  private halo: Sprite;
  private halo2: Sprite;
  private pulse: Sprite;
  private motes: Mote[] = [];
  private rng: Rng = mulberry32(77);
  private t = 0;
  /** 0…1 core brightness. */
  level = 0;
  /** Spawn rate (motes / s) while > 0. */
  dustRate = 0;
  /** Current horizontal positions of the parting plate edges (left half's edge, right half's). */
  edges: [number, number] = [PLATE.seamX, PLATE.seamX];
  private spawnAcc = 0;

  constructor(private factory: LayerFactory) {
    const cx = LOGICAL.width / 2;
    const cy = LOGICAL.height / 2;
    this.halo = new Sprite(radialLight());
    this.halo.anchor.set(0.5);
    this.halo.width = this.halo.height = 1300;
    this.halo.tint = C.gold;
    this.halo.blendMode = 'add';
    this.halo2 = new Sprite(radialLight());
    this.halo2.anchor.set(0.5);
    this.halo2.width = this.halo2.height = 520;
    this.halo2.tint = 0xfff0c0;
    this.halo2.blendMode = 'add';
    this.coreSlot.position.set(cx, cy);
    this.coreSlot.addChild(factory.create('core'));
    this.halo.position.set(cx, cy);
    this.halo2.position.set(cx, cy);
    this.core.addChild(this.halo, this.coreSlot, this.halo2);
    this.core.visible = false;

    this.pulse = new Sprite(radialLight());
    this.pulse.anchor.set(0.5);
    this.pulse.position.set(cx, cy);
    this.pulse.width = 1800;
    this.pulse.height = 1300;
    this.pulse.tint = C.teal;
    this.pulse.blendMode = 'add';
    this.pulse.alpha = 0;
    this.front.addChild(this.pulse);
  }

  /** Rebuild the core layer (visual mode switch). */
  rebuildLayers(): void {
    for (const ch of this.coreSlot.removeChildren()) ch.destroy();
    this.coreSlot.addChild(this.factory.create('core'));
  }

  setPulse(a: number): void {
    this.pulse.alpha = a;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.t += dt;
    this.core.visible = this.level > 0.001;
    if (this.core.visible) {
      const breathe = 0.9 + 0.1 * Math.sin(this.t * 1.7);
      this.halo.alpha = 0.75 * this.level * breathe;
      this.halo2.alpha = this.level * (0.8 + 0.2 * Math.sin(this.t * 2.9));
      this.coreSlot.alpha = this.level;
      this.coreSlot.rotation += dt * 0.05;
      this.coreSlot.scale.set(0.96 + 0.04 * breathe);
    }
    // dust
    if (this.dustRate > 0) {
      this.spawnAcc += this.dustRate * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawn();
      }
    }
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.age += dt;
      m.vy += 55 * dt;
      m.vx *= Math.exp(-dt * 0.8);
      m.x += m.vx * dt + Math.sin(this.t * 2 + m.size) * 6 * dt;
      m.y += m.vy * dt;
      const k = m.age / m.life;
      if (k >= 1 || m.y > LOGICAL.height + 20) {
        m.s.destroy();
        this.motes.splice(i, 1);
        continue;
      }
      m.s.position.set(m.x, m.y);
      m.s.alpha = Math.min(1, m.age * 4) * (1 - k) * 0.85;
    }
  }

  private spawn() {
    const R = this.rng;
    const fromLeft = R() < 0.5;
    const edge = fromLeft ? this.edges[0] : this.edges[1];
    const s = new Sprite(radialLight(64));
    s.anchor.set(0.5);
    const size = randBetween(R, 3, 9);
    s.width = s.height = size;
    s.tint = R() < 0.3 ? C.gold : 0xd8c8a0;
    s.blendMode = 'add';
    const m: Mote = {
      s,
      x: edge + randBetween(R, -10, 10),
      y: randBetween(R, PLATE.y - 10, PLATE.y + PLATE.height * 0.85),
      vx: (fromLeft ? 1 : -1) * randBetween(R, 5, 40),
      vy: randBetween(R, 5, 40),
      life: randBetween(R, 2.5, 5.5),
      age: 0,
      size,
    };
    this.motes.push(m);
    this.front.addChild(s);
  }

  get moteCount(): number {
    return this.motes.length;
  }

  /** Clear everything (off-screen, during Reset). */
  clear(): void {
    for (const m of this.motes) m.s.destroy();
    this.motes = [];
    this.dustRate = 0;
    this.spawnAcc = 0;
    this.level = 0;
    this.pulse.alpha = 0;
    this.edges = [PLATE.seamX, PLATE.seamX];
    this.core.visible = false;
  }
}
