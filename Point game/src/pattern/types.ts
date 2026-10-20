export interface PatternPoint {
  id: number;
  /** Normalized portrait x (0 = left edge, 1 = right edge). */
  x: number;
  /** Normalized portrait y (0 = top edge, 1 = bottom edge). */
  y: number;
  /** Visual radius in portrait-width units. */
  r: number;
  seed: number;
  note: string;
}

export interface Pattern {
  points: PatternPoint[];
  sequence: number[];
  /** The reveal figure: eye ids joined in order after a solve, drawing the hidden number. */
  figure?: number[];
}

export interface Vec {
  x: number;
  y: number;
}

/** Portrait height / width. World units: x in [0, 1], y in [0, ASPECT], so distances are isotropic. */
export const ASPECT = 16 / 9;

export const POINT_COUNT = 18;
export const SEQUENCE_LENGTH = 13;

export function toWorld(p: { x: number; y: number }): Vec {
  return { x: p.x, y: p.y * ASPECT };
}

export function toNormalized(p: Vec): Vec {
  return { x: p.x, y: p.y / ASPECT };
}
