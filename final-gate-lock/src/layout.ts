/** Every layout number lives here (logical px on the 1280 × 800 canvas). */
import type { Row } from './config';

export const LOGICAL = { width: 1280, height: 800 } as const;

export const PLATE = {
  x: 50,
  y: 30,
  width: 1180,
  height: 740,
  radius: 38,
  border: 26,
  seamX: 640,
} as const;

/** Wheel geometry, relative to the wheel pivot. Diameter of the socket ≈ 180. */
export const WHEEL = {
  socketRadius: 88,
  rimOuter: 84,
  rimInner: 77,
  discRadius: 76,
  /** Dark enamel band on the disc that carries the numerals. */
  bandInner: 22,
  bandOuter: 70,
  irisRadius: 72,
  /** Window (wedge cutout) in the iris, degrees clockwise from 3 o'clock. */
  windowStartDeg: 13,
  windowEndDeg: 77,
  windowInner: 25,
  windowOuter: 69,
  numeralRadius: 48,
  numeralSize: 34,
  pupilRadius: 13,
  eyeRadius: 72,
  /** Drag starts when the pointer lands inside this radius. */
  dragRadius: 84,
  /** Pointer closer than this to the centre does not change the angle (unstable). */
  dragDeadRadius: 14,
  irisMaxShift: 5,
  pupilDepth: 1.3,
} as const;

export const ARROW = {
  offsetX: 46,
  offsetY: -108,
  /** Square hit area per arrow; plan requires ≥ 56. */
  hit: 60,
  iconRadius: 15,
} as const;

export const ROWS: Record<Row, { y: number; xs: number[] }> = {
  top: { y: 215, xs: [360, 640, 920] },
  middle: { y: 420, xs: [220, 500, 780, 1060] },
  bottom: { y: 625, xs: [360, 640, 920] },
};

/** Bottom-left operator gesture zone; nothing interactive may sit here. */
export const OPERATOR_ZONE = { x: 0, y: LOGICAL.height - 120, width: 120, height: 120 } as const;

/** Wheels within this distance react ("curious") when a neighbour is touched. */
export const CURIOUS_RADIUS = 430;

export interface WheelPlacement {
  id: number;
  x: number;
  y: number;
}

/** Assign positions by order of appearance within each row. */
export function placeWheels(wheels: { id: number; row: Row }[]): WheelPlacement[] {
  const used: Record<Row, number> = { top: 0, middle: 0, bottom: 0 };
  return wheels.map((w) => {
    const row = ROWS[w.row];
    const x = row.xs[used[w.row]++] ?? row.xs[row.xs.length - 1];
    return { id: w.id, x, y: row.y };
  });
}

export function arrowCenters(cx: number, cy: number) {
  return {
    ccw: { x: cx - ARROW.offsetX, y: cy + ARROW.offsetY },
    cw: { x: cx + ARROW.offsetX, y: cy + ARROW.offsetY },
  };
}
