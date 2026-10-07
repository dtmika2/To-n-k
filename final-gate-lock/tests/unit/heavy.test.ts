import { describe, it, expect } from 'vitest';
import { HeavySpring, notch, recoil, releaseCurve } from '../../src/wheel/heavy';
import { STEP, nearestDetent, slotOfAngle, snapTarget } from '../../src/wheel/snap';
import { ease } from '../../src/util/tween';
import { FEEL } from '../../src/feel';

const A = FEEL.wheel.notch;

describe('notch field', () => {
  it('leaves every detent exactly where it is', () => {
    for (let k = -6; k <= 6; k++) expect(notch(k * STEP, A)).toBeCloseTo(k * STEP, 12);
  });

  it('is periodic per slot (120°)', () => {
    for (let x = -3; x <= 3; x += 0.173) expect(notch(x + STEP, A) - notch(x, A)).toBeCloseTo(STEP, 10);
  });

  it('is strictly monotonic (the plate never runs backwards against the finger)', () => {
    let prev = notch(-10, A);
    for (let x = -10 + 0.001; x <= 10; x += 0.001) {
      const y = notch(x, A);
      expect(y).toBeGreaterThan(prev);
      prev = y;
    }
  });

  it('is sticky near a number and quick between numbers', () => {
    const h = 1e-4;
    const slopeAtDetent = (notch(h, A) - notch(-h, A)) / (2 * h);
    const mid = STEP / 2;
    const slopeBetween = (notch(mid + h, A) - notch(mid - h, A)) / (2 * h);
    expect(slopeAtDetent).toBeCloseTo(1 - A, 6);
    expect(slopeBetween).toBeCloseTo(1 + A, 6);
  });
});

describe('heavy spring (the plate trails the finger)', () => {
  it('tracks a steadily turning finger with a bounded lag of ≈ 2/ω', () => {
    const s = new HeavySpring(0, 0, FEEL.wheel.dragOmega);
    const speed = 3; // rad/s
    let target = 0;
    for (let t = 0; t < 1.5; t += 1 / 60) {
      target += speed / 60;
      s.step(target, 1 / 60);
    }
    const lagSeconds = (target - s.x) / speed;
    expect(lagSeconds).toBeGreaterThan(0.05);
    expect(lagSeconds).toBeLessThan(0.12);
  });

  it('settles on a still target without overshooting (critically damped)', () => {
    const s = new HeavySpring(0, 0, 24);
    let max = 0;
    for (let t = 0; t < 1; t += 1 / 60) {
      s.step(1, 1 / 60);
      max = Math.max(max, s.x);
    }
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
    expect(s.x).toBeCloseTo(1, 4);
  });

  it('is stable for huge time steps (`?speed=100`)', () => {
    const s = new HeavySpring(0, 50, 24);
    s.step(2, 10);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(s.x).toBeCloseTo(2, 6);
  });
});

describe('release curve', () => {
  it('starts at the plate, ends exactly on the detent, never overshoots or runs back', () => {
    for (const v0 of [-0.02, 0, 0.003, 0.01, 0.05]) {
      const x0 = 0.4 * STEP;
      const to = snapTarget(x0, v0);
      const c = releaseCurve(x0, v0, to, 600, FEEL.wheel.arrivalSpeed);
      expect(c(0)).toBeCloseTo(x0, 12);
      expect(c(1)).toBeCloseTo(to, 12);
      const dir = Math.sign(to - x0);
      let prev = c(0);
      for (let u = 0.01; u <= 1.0001; u += 0.01) {
        const y = c(Math.min(1, u));
        if (dir !== 0) expect((y - prev) * dir).toBeGreaterThanOrEqual(-1e-9);
        if (dir > 0) expect(y).toBeLessThanOrEqual(to + 1e-9);
        if (dir < 0) expect(y).toBeGreaterThanOrEqual(to - 1e-9);
        prev = y;
      }
    }
  });

  it('keeps momentum: with release speed the plate starts moving immediately', () => {
    const still = releaseCurve(0, 0, STEP, 600, 0.55);
    const moving = releaseCurve(0, 0.004, STEP, 600, 0.55);
    expect(moving(0.05)).toBeGreaterThan(still(0.05));
  });

  it('lands with a hard stop (still moving when it reaches the detent)', () => {
    const c = releaseCurve(0, 0, STEP, 600, 0.55);
    expect(c(1) - c(0.99)).toBeGreaterThan(0.002 * STEP);
  });

  it('any release still ends on one of the 3 slots, at most one past the nearest', () => {
    for (let a = -8; a <= 8; a += 0.0731) {
      for (const v of [0, 0.002, -0.002, 0.01, -0.01, 0.05, -0.05]) {
        const to = snapTarget(a, v);
        const c = releaseCurve(a, v, to, 500, 0.55);
        const end = c(1);
        expect([0, 1, 2]).toContain(slotOfAngle(end));
        expect(Math.abs(Math.round(end / STEP) - nearestDetent(a))).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('heavy easing and recoil', () => {
  it('heavyDetent starts from rest and arrives with speed (hard stop)', () => {
    const e = ease.heavyDetent;
    expect(e(0)).toBe(0);
    expect(e(1)).toBeCloseTo(1, 12);
    expect(e(0.01)).toBeLessThan(0.001); // mass: barely moves at first
    expect((e(1) - e(0.99)) / 0.01).toBeGreaterThan(0.5);
    for (let t = 0; t < 1; t += 0.01) expect(e(t + 0.01)).toBeGreaterThanOrEqual(e(t)); // no overshoot
  });

  it('heavySpin winds down but still lands with a little speed', () => {
    const e = ease.heavySpin;
    expect(e(0)).toBe(0);
    expect(e(1)).toBeCloseTo(1, 12);
    expect((e(1) - e(0.99)) / 0.01).toBeGreaterThan(0.1);
  });

  it('recoil is a small bounce that returns exactly to rest', () => {
    expect(recoil(0)).toBeCloseTo(0, 12);
    expect(recoil(1)).toBeCloseTo(0, 12);
    expect(Math.max(...[0.2, 0.3, 0.4].map(recoil))).toBeGreaterThan(0.3);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => recoil(i / 100)))).toBeLessThanOrEqual(1);
  });
});
