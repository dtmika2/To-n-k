import type { Graphics } from 'pixi.js';

/**
 * Circles as explicit polygons: Pixi chooses circle tessellation from the local-space radius, and world
 * units are tiny (r ≈ 0.045), which would give diamonds.
 */
const CIRCLE_SEGMENTS = 64;
const UNIT_CIRCLE = Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => (i / CIRCLE_SEGMENTS) * Math.PI * 2);

export function circle(g: Graphics, x: number, y: number, r: number): Graphics {
  const pts: number[] = [];
  for (const a of UNIT_CIRCLE) pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  return g.poly(pts, true);
}

/**
 * A circle whose radius wobbles slightly: a few integer harmonics around the circle (so it closes
 * seamlessly) with phases drifting over `time` (seconds). `amp` is the relative deviation (0.04 = ±4 %).
 */
export function wobblyCircle(g: Graphics, x: number, y: number, r: number, amp: number, time: number, seed = 0): Graphics {
  const pts: number[] = [];
  for (const a of UNIT_CIRCLE) {
    const n =
      0.5 * Math.sin(3 * a + time * 0.9 + seed * 1.7) +
      0.3 * Math.sin(5 * a - time * 1.3 + seed * 2.9) +
      0.2 * Math.sin(2 * a + time * 0.5 + seed * 0.6);
    const rr = r * (1 + amp * n);
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  return g.poly(pts, true);
}

/** Eye outline: two mirrored arcs meeting at (x ± hw, y), half-height hh. */
export function almond(g: Graphics, x: number, y: number, hw: number, hh: number): Graphics {
  const pts: number[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n;
    pts.push(x + t * hw, y - (1 - t * t) * hh);
  }
  for (let i = n - 1; i > 0; i--) {
    const t = -1 + (2 * i) / n;
    pts.push(x + t * hw, y + (1 - t * t) * hh);
  }
  return g.poly(pts, true);
}

/** Smoothstep of t clamped to 0…1. */
export function smooth(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

export function easeOutElastic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1;
}

export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (c: number, s: number) => (c >> s) & 255;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k) << s;
  return mix(16) | mix(8) | mix(0);
}

export function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
