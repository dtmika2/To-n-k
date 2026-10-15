import type { Vec } from './types.ts';

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Distance from point p to the segment a–b. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * First parameter t in [0, 1] at which the segment a→b is inside the circle (c, r), or null.
 * Returns 0 when a is already inside.
 */
export function segmentCircleEntry(a: Vec, b: Vec, c: Vec, r: number): number | null {
  const fx = a.x - c.x;
  const fy = a.y - c.y;
  const cc = fx * fx + fy * fy - r * r;
  if (cc <= 0) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const aa = dx * dx + dy * dy;
  if (aa === 0) return null;
  const bb = 2 * (fx * dx + fy * dy);
  const disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return null;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}
