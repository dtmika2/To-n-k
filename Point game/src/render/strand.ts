import type { Graphics } from 'pixi.js';
import { dist } from '../pattern/geometry.ts';
import type { Vec } from '../pattern/types.ts';
import { hash } from './draw.ts';
import type { BeamBatch, BeamPoint } from './vfx/beam.ts';

export interface StrandStyle {
  color: number;
  alpha: number;
  /** 0…1: the strand jitters, gaps and thins out (the unsettled line). */
  u?: number;
  /** White-hot core strength. */
  hot?: number;
}

const HOT = 0xfffbe8;

/**
 * The points of a luminous, slightly wavy strand from a to b, split into unbroken runs where `u` opens
 * gaps (unless `gaps` is false: beams fray in their shader instead). Shared by both looks, so a beam
 * follows exactly the line the classic look would draw.
 */
export function strandRuns(a: Vec, b: Vec, now: number, seed: number, u: number, gaps = true): BeamPoint[][] {
  const len = dist(a, b);
  if (len < 1e-4) return [];
  const n = Math.max(6, Math.min(90, Math.ceil(len / 0.01)));
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const time = now / 1000;
  const frame = Math.floor(now / 120);
  const runs: BeamPoint[][] = [];
  let run: BeamPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const env = Math.sin(Math.PI * s);
    const wave = (0.0028 + u * 0.009) * env * Math.sin(2 * Math.PI * s * len * 5 - time * 1.7 + seed * 1.3);
    const jitter = u * 0.006 * env * Math.sin(time * 13 + i * 2.3 + seed) * hash(seed * 31 + i, frame);
    const gap = gaps && u > 0 && i < n && hash(seed * 97 + i, frame) < u * 0.5;
    if (gap) {
      if (run.length > 1) runs.push(run);
      run = [];
    } else {
      run.push({ x: a.x + (b.x - a.x) * s + nx * (wave + jitter), y: a.y + (b.y - a.y) * s + ny * (wave + jitter), s });
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** Classic look: glow, line and (if hot) a white core, stroked into `g`. */
export function strokeStrand(g: Graphics, runs: readonly BeamPoint[][], o: StrandStyle): void {
  const u = o.u ?? 0;
  const strokes: [number, number, number][] = [
    [0.014 * (1 - 0.3 * u), o.color, 0.13 * o.alpha],
    [0.0034 * (1 - 0.35 * u), o.color, 0.9 * o.alpha],
  ];
  if ((o.hot ?? 0) > 0) strokes.push([0.0014, HOT, 0.7 * (o.hot ?? 0) * o.alpha]);
  for (const [width, color, alpha] of strokes) {
    for (const r of runs) {
      g.moveTo(r[0].x, r[0].y);
      for (let i = 1; i < r.length; i++) g.lineTo(r[i].x, r[i].y);
      g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
    }
  }
}

/** VFX look: each run becomes part of a beam. */
export function beamStrand(beams: BeamBatch, a: Vec, b: Vec, runs: readonly BeamPoint[][], seed: number, o: StrandStyle): void {
  const len = dist(a, b);
  for (const r of runs) beams.add(r, len, { color: o.color, alpha: o.alpha, u: o.u ?? 0, hot: o.hot ?? 0, seed });
}
