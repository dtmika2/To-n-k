/**
 * Heavy-mechanism math (pure, unit-tested): the notch field that makes a dragged plate stick near
 * each number, the critically damped spring that gives it mass, and the release curve that keeps
 * the plate's momentum and lands it on the detent with a hard stop.
 */
import { STEP } from './snap';

/**
 * Notch mapping: θ − (A/3)·sin(3θ). Period 120° (one slot), zero offset at every detent (θ = k·STEP),
 * slope 1 − A at a detent (sticky) and 1 + A halfway between (quick). Monotonic for A < 1.
 */
export function notch(theta: number, strength: number): number {
  // 2π / STEP = 3: one full sine period per slot
  return theta - (strength / 3) * Math.sin(((2 * Math.PI) / STEP) * theta);
}

/** Critically damped spring towards a moving target. Exact for any dt (stable at high `?speed`). */
export class HeavySpring {
  constructor(
    public x: number,
    public v = 0,
    public omega = 24,
  ) {}

  /** Advance by dt seconds towards `target` (treated as constant over the step). */
  step(target: number, dtSec: number): void {
    if (dtSec <= 0) return;
    const w = this.omega;
    const c1 = this.x - target;
    const c2 = this.v + w * c1;
    const e = Math.exp(-w * dtSec);
    this.x = target + (c1 + c2 * dtSec) * e;
    this.v = (c2 - w * (c1 + c2 * dtSec)) * e;
  }
}

/**
 * Release curve from (x0, v0) to `to` over `durMs`: a cubic Hermite that keeps the plate's momentum
 * at the start (clamped so it never overshoots or runs backwards) and still has some speed at the
 * end — the hard stop. Returns angle(u) for u ∈ [0, 1].
 */
export function releaseCurve(x0: number, v0PerMs: number, to: number, durMs: number, arrivalShare: number) {
  const d = to - x0;
  if (Math.abs(d) < 1e-9) return () => to;
  // start slope (in units of d per unit u): momentum in the travel direction only, ≤ 2.5·d
  let m0 = (v0PerMs * durMs) / d;
  if (!(m0 > 0)) m0 = 0;
  m0 = Math.min(m0, 2.5);
  const m1 = Math.max(0, Math.min(arrivalShare * 1.5, 2.5));
  return (u: number) => {
    const u2 = u * u;
    const u3 = u2 * u;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    // normalised Hermite: p(0) = 0, p(1) = 1, p'(0) = m0, p'(1) = m1
    return x0 + d * (h10 * m0 + h01 + h11 * m1);
  };
}

/** Recoil after the hard stop: back by `amount` (signed against the travel), then settle. */
export function recoil(v: number): number {
  // v ∈ [0, 1]: quick bounce back, slower settle, exactly 0 at both ends
  return Math.sin(Math.PI * Math.min(1, v)) * Math.pow(1 - Math.min(1, v), 0.6);
}
