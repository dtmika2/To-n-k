/**
 * Iris angle math (pure). The numbered disc is fixed with slot s at WINDOW_CENTER + s·STEP; the iris
 * plate (with the window) rotates by ρ (radians, clockwise positive on screen), so slot s shows in
 * the window when ρ ≡ s · STEP (mod 2π). Angles stay continuous (no wrapping) while moving.
 */
export const STEP = (2 * Math.PI) / 3;

const mod3 = (n: number) => ((n % 3) + 3) % 3;

/** Index k of the nearest detent: detent angle = k · STEP. */
export function nearestDetent(angle: number): number {
  return Math.round(angle / STEP);
}

export function slotOfDetent(k: number): number {
  return mod3(k);
}

export function slotOfAngle(angle: number): number {
  return slotOfDetent(nearestDetent(angle));
}

/** Detent angle closest to `near` that shows `slot`. */
export function angleForSlot(slot: number, near = 0): number {
  const base = slot * STEP;
  const turns = Math.round((near - base) / (2 * Math.PI));
  return base + turns * 2 * Math.PI;
}

/** Wrap an angle delta into (−π, π]. */
export function wrapDelta(d: number): number {
  let x = d % (2 * Math.PI);
  if (x <= -Math.PI) x += 2 * Math.PI;
  if (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

export interface SnapOpts {
  /** How far ahead (ms) to project the release velocity. */
  projectMs: number;
  /** Minimum |velocity| (rad/ms) for a flick to add a slot. */
  flickVelocity: number;
}

export const DEFAULT_SNAP: SnapOpts = { projectMs: 140, flickVelocity: 0.0045 };

/**
 * Release target: nearest detent, but a fast flick may advance at most one extra slot in the
 * direction of motion.
 */
export function snapTarget(angle: number, velocity: number, opts: SnapOpts = DEFAULT_SNAP): number {
  const near = nearestDetent(angle);
  if (Math.abs(velocity) < opts.flickVelocity) return near * STEP;
  const projected = nearestDetent(angle + velocity * opts.projectMs);
  const k = Math.max(near - 1, Math.min(near + 1, projected));
  // never snap backwards against the flick
  if (Math.sign(k - near) === -Math.sign(velocity) && k !== near) return near * STEP;
  return k * STEP;
}

/** Keep angles small after a settle (visually identical). */
export function normalizeAngle(angle: number): number {
  const twoPi = 2 * Math.PI;
  return angle - Math.round(angle / twoPi) * twoPi;
}

/** Velocity (rad/ms) from recent samples within `windowMs` of the last one. */
export function releaseVelocity(samples: { t: number; a: number }[], windowMs = 90): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.a - first.a) / dt : 0;
}
