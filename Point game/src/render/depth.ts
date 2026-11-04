import { hash, smooth } from './draw.ts';
import type { CloudLayers } from './clouds.ts';

/**
 * Depth mode (on by default; Z key, `?depth=0` for off): the rules, kept free of rendering. Every eye gets a depth
 * z, 0 (far) … 1 (near), which sets its place in the draw order, its band (the clouds pass between the
 * bands), its size, its haze and the width of the lines reaching it. Purely visual: the hit radii don't
 * use any of it.
 */

/** A value at the far and at the near end of the depth range. */
export type DepthRange = readonly [far: number, near: number];

export interface DepthConfig {
  enabled: boolean;
  /** Eye size, as a multiple of its normal size. */
  eyeScale: DepthRange;
  /** How far an eye's colours shift towards the dim mist tone (fades as the eye glows). */
  haze: DepthRange;
  lineWidth: DepthRange;
  lineAlpha: DepthRange;
  /** How far an eye's region reaches, as a multiple of its radius: a dragged line starts to change there. */
  lineRegion: number;
  orbitersPerEye: number;
  /** Share of the mist drawn above the far band (the rest stays under it). */
  mistOver: number;
  clouds: CloudLayers;
}

export const BANDS = 3;

export function bandOf(z: number): number {
  return Math.max(0, Math.min(BANDS - 1, Math.floor(z * BANDS)));
}

export function atDepth(range: DepthRange, z: number): number {
  return range[0] + (range[1] - range[0]) * z;
}

/**
 * Depth from each eye's seed, so an eye keeps its depth between runs. Ranked, not random per eye: the
 * bands always get an even share, and each eye varies inside its band.
 */
export function assignDepths(points: readonly { id: number; seed: number }[]): Map<number, number> {
  const ranked = [...points].sort((a, b) => hash(a.seed, 1) - hash(b.seed, 1) || a.id - b.id);
  const depths = new Map<number, number>();
  ranked.forEach((p, rank) => {
    const band = Math.min(BANDS - 1, Math.floor((rank * BANDS) / ranked.length));
    depths.set(p.id, (band + 0.15 + 0.7 * hash(p.seed, 2)) / BANDS);
  });
  return depths;
}

/** How many eyes are strictly further than `z`; `eyeZs` ascending. An eye's own z gives its own place. */
export function eyesBelow(eyeZs: readonly number[], z: number): number {
  let n = 0;
  while (n < eyeZs.length && eyeZs[n] < z) n++;
  return n;
}

/**
 * A line counts as above an eye when it is nearer or about level with it, so two eyes at practically the
 * same depth don't make a line dip under one of them for part of its length.
 */
export const LEVEL_MARGIN = 0.01;

/**
 * Which draw layer a point of a line belongs to: layer k is above k eyes and below the rest. Within
 * `reach` of either end it stays under that end's own eye, so a line always seems to leave from behind
 * the eyes it joins, even when it rises towards the viewer.
 */
export function lineLayer(eyeZs: readonly number[], z: number, ends: readonly { z: number; dist: number; reach: number }[]): number {
  let layer = eyesBelow(eyeZs, z + LEVEL_MARGIN);
  for (const end of ends) if (end.dist < end.reach) layer = Math.min(layer, eyesBelow(eyeZs, end.z));
  return layer;
}

/**
 * Cuts a run of line points where its draw layer changes; neighbouring pieces share a point, so the line
 * stays unbroken even though it passes over some eyes and clouds and under others.
 */
export function splitByLayer<T>(run: readonly T[], layerOf: (p: T) => number): { layer: number; pts: T[] }[] {
  const pieces: { layer: number; pts: T[] }[] = [];
  let current: { layer: number; pts: T[] } | null = null;
  for (const p of run) {
    const layer = layerOf(p);
    if (current && current.layer !== layer) {
      current.pts.push(p);
      pieces.push(current);
      current = null;
    }
    current ??= { layer, pts: [] };
    current.pts.push(p);
  }
  if (current) pieces.push(current);
  return pieces.filter((piece) => piece.pts.length > 1);
}

/** An eye as `fingerDepth` sees it: where it is, how deep, and how far its region reaches. */
export interface DepthRegion {
  x: number;
  y: number;
  z: number;
  /** Inside this distance the finger is at the eye's depth exactly. */
  inner: number;
  /** Beyond this distance the eye has no effect. */
  outer: number;
}

/**
 * The depth of a moving line tip. Away from every eye it stays at `from`, the depth of the eye it left, so
 * the line keeps its width; entering an eye's region it eases towards that eye's depth, reaching it inside
 * `inner`, where the finger reaches the eye. Where regions overlap, the closest eye counts the most. The
 * line therefore arrives at the eye's depth already and doesn't change when it locks on.
 */
export function fingerDepth(x: number, y: number, from: number, regions: readonly DepthRegion[]): number {
  let strongest = 0;
  let weights = 0;
  let sum = 0;
  for (const r of regions) {
    const d = Math.hypot(x - r.x, y - r.y);
    if (d <= r.inner) return r.z;
    if (d >= r.outer) continue;
    const pull = smooth((r.outer - d) / (r.outer - r.inner));
    const gap = d - r.inner;
    const weight = pull / (gap * gap);
    strongest = Math.max(strongest, pull);
    weights += weight;
    sum += weight * r.z;
  }
  if (weights === 0) return from;
  return from + (sum / weights - from) * strongest;
}

/** A particle's circular path around an eye, on a plane tilted out of the screen. */
export interface Orbit {
  /** Path radius, as a multiple of the eye's radius. */
  radius: number;
  /** Radians per second, signed. */
  speed: number;
  phase: number;
  /** Tilt of the plane: 0 = flat on the screen, π/2 = seen edge-on. */
  tilt: number;
  /** Direction on the screen of the line the plane tilts around. */
  node: number;
}

export function makeOrbit(rand: () => number): Orbit {
  return {
    radius: 1.2 + rand() * 0.56,
    speed: (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.6),
    phase: rand() * Math.PI * 2,
    tilt: ((55 + rand() * 25) * Math.PI) / 180,
    node: rand() * Math.PI * 2,
  };
}

/** Where the particle is at `time` (s) for an eye of radius `r`: x, y on the screen, z towards the viewer. */
export function orbitPoint(o: Orbit, time: number, r: number): { x: number; y: number; z: number } {
  const a = o.phase + o.speed * time;
  const [c, s] = [Math.cos(a) * o.radius * r, Math.sin(a) * o.radius * r];
  const [cn, sn] = [Math.cos(o.node), Math.sin(o.node)];
  const ct = Math.cos(o.tilt);
  return { x: c * cn - s * sn * ct, y: c * sn + s * cn * ct, z: s * Math.sin(o.tilt) };
}

/**
 * How visible the particle is: full in front, dimmer on the far side of its path, and gone while it
 * passes behind the eye (z < 0 and inside `occluder`, the eye's radius).
 */
export function orbitAlpha(p: { x: number; y: number; z: number }, occluder: number, pathRadius: number): number {
  if (p.z >= 0) return 1;
  const dim = 1 - 0.45 * Math.min(1, -p.z / pathRadius);
  return dim * smooth((Math.hypot(p.x, p.y) - occluder * 0.8) / (occluder * 0.5));
}
