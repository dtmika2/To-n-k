import { describe, it, expect } from 'vitest';
import {
  STEP,
  angleForSlot,
  nearestDetent,
  normalizeAngle,
  releaseVelocity,
  slotOfAngle,
  snapTarget,
  wrapDelta,
} from '../../src/wheel/snap';
import { stepSlot } from '../../src/state/lockModel';

describe('snap math', () => {
  it('slot ↔ angle round trip', () => {
    for (let s = 0; s < 3; s++) {
      expect(slotOfAngle(angleForSlot(s))).toBe(s);
      expect(slotOfAngle(angleForSlot(s, 20))).toBe(s);
      expect(Math.abs(angleForSlot(s, 20) - 20)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('turning the disc one STEP clockwise matches lockModel cw', () => {
    for (let s = 0; s < 3; s++) {
      expect(slotOfAngle(angleForSlot(s) + STEP)).toBe(stepSlot(s, 'cw'));
      expect(slotOfAngle(angleForSlot(s) - STEP)).toBe(stepSlot(s, 'ccw'));
    }
  });

  it('always snaps onto a detent (one of 3 slots) for any angle', () => {
    for (let a = -20; a <= 20; a += 0.0137) {
      for (const v of [0, 0.002, -0.002, 0.01, -0.01, 0.05, -0.05]) {
        const t = snapTarget(a, v);
        const k = t / STEP;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
        expect([0, 1, 2]).toContain(slotOfAngle(t));
        // at most one extra slot beyond the nearest detent
        expect(Math.abs(Math.round(k) - nearestDetent(a))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('slow release snaps to nearest; flick advances one extra', () => {
    const a = 0.3 * STEP;
    expect(snapTarget(a, 0)).toBe(0);
    expect(snapTarget(a, 0.02)).toBeCloseTo(STEP);
    expect(snapTarget(-a, -0.02)).toBeCloseTo(-STEP);
    // a flick can never snap backwards
    expect(snapTarget(0.45 * STEP, -0.006)).toBeCloseTo(0);
    expect(snapTarget(0.55 * STEP, -0.006)).toBeCloseTo(0);
  });

  it('wrapDelta stays in (−π, π]', () => {
    expect(wrapDelta(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(wrapDelta(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(wrapDelta(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapDelta(0.1)).toBeCloseTo(0.1);
  });

  it('normalizeAngle keeps the slot', () => {
    const a = angleForSlot(2) + 14 * Math.PI;
    expect(slotOfAngle(normalizeAngle(a))).toBe(2);
    expect(Math.abs(normalizeAngle(a))).toBeLessThanOrEqual(Math.PI);
  });

  it('releaseVelocity uses only recent samples', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ t: 0, a: 0 }])).toBe(0);
    const v = releaseVelocity([
      { t: 0, a: 0 },
      { t: 500, a: 0 },
      { t: 550, a: 0.5 },
      { t: 600, a: 1 },
    ]);
    expect(v).toBeCloseTo(0.01);
  });
});
