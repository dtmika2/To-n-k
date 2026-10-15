import { Texture } from 'pixi.js';

/** Small seeded PRNG (mulberry32), so every eye looks the same on every start. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth, slowly varying 1D noise in about −1…1 from a few seeded sines. */
export function makeWobble(seed: number): (x: number) => number {
  const r = rng(seed);
  const terms = [0, 1, 2].map((i) => ({ f: 0.7 + r() * 1.6, p: r() * 6.283, a: 0.6 / (i + 1) }));
  return (x) => terms[0].a * Math.sin(x * terms[0].f + terms[0].p) + terms[1].a * Math.sin(x * terms[1].f + terms[1].p) + terms[2].a * Math.sin(x * terms[2].f + terms[2].p);
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** White radial falloff; `hardness` 0 = very soft, 1 = disc with a soft rim. */
export function softDotTexture(size = 64, hardness = 0): Texture {
  const [c, g] = canvas(size, size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(Math.min(0.95, 0.15 + hardness * 0.7), 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** Sky: deep indigo → violet → near-black, top to bottom of the portrait layout. */
export function skyTexture(): Texture {
  const [c, g] = canvas(4, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#120c3c');
  grad.addColorStop(0.45, '#22104a');
  grad.addColorStop(0.75, '#100826');
  grad.addColorStop(1, '#040209');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  return Texture.from(c);
}

const IRIS_PALETTES = [
  ['#2d5bff', '#8fd8ff', '#f3d99a'],
  ['#7a3cff', '#ff8ad8', '#ffe6a8'],
  ['#1fa59a', '#9effe0', '#fff2b8'],
  ['#3b4cff', '#c08aff', '#ffd27a'],
  ['#c0429a', '#ffb0e0', '#fff0c8'],
];

/** A nebula-like iris: coloured haze plus spiral arms of tiny stars, unique per seed. */
export function irisTexture(seed: number, size = 128): Texture {
  const r = rng(seed * 7919 + 13);
  const [c, g] = canvas(size, size);
  const h = size / 2;
  const pal = IRIS_PALETTES[Math.floor(r() * IRIS_PALETTES.length)];
  const base = g.createRadialGradient(h, h, 0, h, h, h);
  base.addColorStop(0, pal[2]);
  base.addColorStop(0.25, pal[1]);
  base.addColorStop(0.7, pal[0]);
  base.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  const arms = 2 + Math.floor(r() * 3);
  const twist = 2.5 + r() * 3;
  for (let i = 0; i < 260; i++) {
    const t = r();
    const arm = Math.floor(r() * arms);
    const ang = (arm / arms) * Math.PI * 2 + t * twist + (r() - 0.5) * 0.5;
    const rad = t * h * 0.95;
    const x = h + Math.cos(ang) * rad;
    const y = h + Math.sin(ang) * rad;
    const s = 0.6 + r() * 2.2 * (1 - t);
    g.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.35})`;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const vignette = g.createRadialGradient(h, h, h * 0.55, h, h, h);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(6,3,20,0.85)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, size, size);
  return Texture.from(c);
}
