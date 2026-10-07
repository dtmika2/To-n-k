/**
 * Procedurally generated textures (canvas 2D → Pixi texture), created once and cached.
 * Used for soft radial light and mist, which vector Graphics can't do cheaply.
 */
import { Texture } from 'pixi.js';
import { mulberry32 } from '../util/random';

const cache = new Map<string, Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function cached(key: string, make: () => HTMLCanvasElement): Texture {
  let t = cache.get(key);
  if (!t) {
    t = Texture.from(make());
    cache.set(key, t);
  }
  return t;
}

/** Soft radial light, white → transparent (tint it). Smooth falloff. */
export function radialLight(size = 256): Texture {
  return cached(`radial${size}`, () => {
    const [c, g] = canvas(size, size);
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = Math.pow(1 - t, 2.2);
      grad.addColorStop(t, `rgba(255,255,255,${a.toFixed(3)})`);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  });
}

/** Irregular soft cloud puff for mist particles (white, tint it). */
export function mistPuff(variant: number, size = 256): Texture {
  return cached(`mist${variant}_${size}`, () => {
    const [c, g] = canvas(size, size);
    const rng = mulberry32(1000 + variant * 77);
    const r = size / 2;
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * r * 0.42;
      const cx = r + Math.cos(a) * d;
      const cy = r + Math.sin(a) * d * 0.7;
      const rr = r * (0.28 + rng() * 0.3);
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      grad.addColorStop(0, 'rgba(255,255,255,0.22)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.08)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    }
    return c;
  });
}

/** Near-black stone wall with blocks, mortar, speckle noise and a vignette (1280 × 800). */
export function stoneWall(w = 1280, h = 800): Texture {
  return cached(`wall${w}x${h}`, () => {
    const [c, g] = canvas(w, h);
    const rng = mulberry32(42);
    g.fillStyle = '#0b0a0c';
    g.fillRect(0, 0, w, h);
    const rowH = 64;
    for (let row = 0, y = 0; y < h; row++, y += rowH) {
      let x = row % 2 ? -60 : 0;
      while (x < w) {
        const bw = 110 + rng() * 70;
        const shade = 14 + Math.floor(rng() * 9);
        g.fillStyle = `rgb(${shade},${shade - 1},${shade + 2})`;
        g.fillRect(x + 3, y + 3, bw - 6, rowH - 6);
        // top-left light on each block
        g.fillStyle = 'rgba(255,255,255,0.025)';
        g.fillRect(x + 3, y + 3, bw - 6, 3);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x + 3, y + rowH - 6, bw - 6, 3);
        x += bw;
      }
    }
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rng() - 0.5) * 10;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    return c;
  });
}

/** Total texture bytes created here (for the memory budget report). */
export function proceduralTextureBytes(): number {
  let n = 0;
  for (const t of cache.values()) n += t.source.pixelWidth * t.source.pixelHeight * 4;
  return n;
}
