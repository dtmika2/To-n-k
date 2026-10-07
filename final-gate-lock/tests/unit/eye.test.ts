import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Eye, LIDS, blinkCurve, type EyeTimings } from '../../src/wheel/Eye';
import { BlinkCoordinator } from '../../src/wheel/BlinkCoordinator';
import { mulberry32 } from '../../src/util/random';

const T: EyeTimings = { blinkIntervalMs: [4000, 9000], glanceIntervalMs: [6000, 14000], settledToDrowsyMs: 2000 };

function mkEye(seed = 1, gate = new BlinkCoordinator(), timings = T) {
  return new Eye({ rng: mulberry32(seed), timings, gate, maxShift: 5, depth: 1.3 });
}

/** Run an eye for `ms` at 60 fps. */
function run(e: Eye, from: number, ms: number, dt = 1000 / 60) {
  let t = from;
  while (t < from + ms) {
    t += dt;
    e.update(t, dt);
  }
  return t;
}

describe('Eye', () => {
  it('starts shut and opens to drowsy when live', () => {
    const e = mkEye();
    expect(e.update(0, 16).lidTop).toBeGreaterThan(0.95);
    e.setMode('live', 0);
    const t = run(e, 0, 3000);
    expect(e.pose.lidTop).toBeGreaterThan(LIDS.drowsy.top - 0.06);
    expect(e.pose.lidTop).toBeLessThan(LIDS.drowsy.top + 0.06);
    expect(e.stateLabel(t)).toMatch(/drowsy|glance|blink/);
  });

  it('awake under a finger: lids open, pupil follows (clamped, pupil ≈ 1.3× iris)', () => {
    const e = mkEye();
    e.setMode('live', 0);
    run(e, 0, 2000);
    e.setTouch({ x: 300, y: 0 }, 2000);
    run(e, 2000, 600);
    expect(e.pose.lidTop).toBeLessThan(0.08);
    expect(e.pose.iris.x).toBeGreaterThan(4);
    expect(e.pose.iris.x).toBeLessThanOrEqual(5.0001);
    expect(e.pose.pupil.x / e.pose.iris.x).toBeCloseTo(1.3);
    expect(e.pose.glow).toBeGreaterThan(0.5);
    expect(e.look).toBe('awake');
    // vertical movement is clamped to the flatter ellipse axis
    e.setTouch({ x: 0, y: -300 }, 2600);
    run(e, 2600, 600);
    expect(e.pose.iris.y).toBeGreaterThanOrEqual(-3.751);
    e.setTouch(null, 3200);
    expect(e.stateLabel(3300)).toMatch(/awake|blink/);
    run(e, 3200, 4000);
    expect(e.pose.lidTop).toBeGreaterThan(0.4);
  });

  it('curious: opens a bit and looks toward the touched neighbour', () => {
    const e = mkEye();
    e.setMode('live', 0);
    run(e, 0, 2500);
    e.setCurious({ x: -280, y: 0 });
    run(e, 2500, 800);
    expect(e.look).toBe('curious');
    expect(e.pose.lidTop).toBeLessThan(LIDS.drowsy.top - 0.15);
    expect(e.pose.iris.x).toBeLessThan(-3);
    e.setCurious(null);
    expect(e.look).toBe('drowsy');
  });

  it('settled: one blink soon, then back to drowsy after settledToDrowsyMs', () => {
    const gate = new BlinkCoordinator();
    const e = mkEye(3, gate);
    e.setMode('live', 0);
    run(e, 0, 1000);
    const before = gate.grants;
    e.settle(1000);
    expect(e.stateLabel(1001)).toBe('settled');
    run(e, 1000, 400);
    expect(gate.grants).toBe(before + 1);
    run(e, 1400, 2500);
    expect(e.stateLabel(3900)).toMatch(/drowsy|glance|blink/);
  });

  it('glances happen within the configured interval and return', () => {
    const e = mkEye(5);
    e.setMode('live', 0);
    let t = 0;
    let glances = 0;
    let wasGlance = false;
    while (t < 60_000) {
      t += 16;
      e.update(t, 16);
      const g = e.stateLabel(t) === 'glance';
      if (g && !wasGlance) glances++;
      wasGlance = g;
    }
    // 60 s with 6–14 s gaps + ~1 s glances → between 3 and 10
    expect(glances).toBeGreaterThanOrEqual(3);
    expect(glances).toBeLessThanOrEqual(10);
  });

  it('asleep ripple: mode change takes effect after its delay', () => {
    const e = mkEye();
    e.setMode('live', 0);
    run(e, 0, 2000);
    e.setMode('asleep', 2000, 500);
    run(e, 2000, 300);
    expect(e.pose.lidTop).toBeLessThan(0.9);
    run(e, 2300, 2500);
    expect(e.pose.lidTop).toBeGreaterThan(0.95);
    expect(e.pose.lidBottom).toBeGreaterThan(0.95);
    expect(e.stateLabel(4800)).toBe('asleep');
  });

  it('wide (success) snaps pupil to centre and dilates; peaceful closes slowly', () => {
    const e = mkEye();
    e.setMode('live', 0);
    e.setTouch({ x: 200, y: 50 }, 0);
    run(e, 0, 500);
    e.setTouch(null, 500);
    e.setMode('wide', 500);
    run(e, 500, 400);
    expect(Math.abs(e.pose.iris.x)).toBeLessThan(0.2);
    expect(e.pose.pupilScale).toBeGreaterThan(1.3);
    expect(e.pose.lidTop).toBeLessThan(0.02);
    e.setMode('peaceful', 900);
    run(e, 900, 400);
    expect(e.pose.lidTop).toBeLessThan(0.8);
    run(e, 1300, 4000);
    expect(e.pose.lidTop).toBeGreaterThan(0.95);
  });

  it('intro openSlowly does one slow blink then drowsy', () => {
    const e = mkEye();
    e.openSlowly(0);
    run(e, 0, 400);
    expect(e.pose.lidTop).toBeLessThan(0.6);
    let sawBlink = false;
    let t = 400;
    while (t < 1400) {
      t += 16;
      e.update(t, 16);
      if (e.blinking) sawBlink = true;
    }
    expect(sawBlink).toBe(true);
  });

  it('blinkCurve closes fully and reopens', () => {
    expect(blinkCurve(0)).toBe(0);
    expect(blinkCurve(0.45)).toBe(1);
    expect(blinkCurve(0.999)).toBeLessThan(0.01);
  });
});

describe('Blink coordination across 10 eyes', () => {
  it('no two wheels blink in the same frame over a 5-minute run (60 fps)', () => {
    const gate = new BlinkCoordinator();
    const eyes = Array.from({ length: 10 }, (_, i) => mkEye(100 + i, gate));
    eyes.forEach((e) => e.setMode('live', 0));
    const dt = 1000 / 60;
    let collisions = 0;
    let blinkFrames = 0;
    for (let t = dt; t <= 5 * 60_000; t += dt) {
      let n = 0;
      for (const e of eyes) {
        e.update(t, dt);
        if (e.blinking) n++;
      }
      if (n > 1) collisions++;
      if (n > 0) blinkFrames++;
      // occasional settles (players moving wheels) also blink through the gate
      if (Math.floor(t / 997) !== Math.floor((t - dt) / 997)) eyes[Math.floor(t / 997) % 10].settle(t);
    }
    expect(collisions).toBe(0);
    expect(blinkFrames).toBeGreaterThan(100);
    // every eye blinked at a believable rate (≈ one per 4–9 s → 33–75 per 5 min, plus settles)
    expect(gate.grants).toBeGreaterThan(10 * 25);
    // grants never overlap
    const log = gate.log;
    for (let i = 1; i < log.length; i++) expect(log[i][0]).toBeGreaterThanOrEqual(log[i - 1][1]);
  });

  it('gate refuses overlapping requests', () => {
    const g = new BlinkCoordinator(60);
    expect(g.tryBlink(0, 150)).toBe(true);
    expect(g.tryBlink(100, 150)).toBe(false);
    expect(g.tryBlink(209, 150)).toBe(false);
    expect(g.tryBlink(210, 150)).toBe(true);
  });
});

describe('Idle behaviour cannot depend on correctness (code review check)', () => {
  it('Eye and BlinkCoordinator do not import the lock model or mention correctness', () => {
    for (const f of ['src/wheel/Eye.ts', 'src/wheel/BlinkCoordinator.ts']) {
      const src = readFileSync(f, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/lockModel|LockModel|isCorrect|isSolved|correct/);
    }
  });

  it('Game only feeds eyes touch / curious / settle / mode / timings — never correctness', () => {
    const src = readFileSync('src/app/Game.ts', 'utf8');
    const eyeCalls = [...src.matchAll(/\.eye\.(\w+)\(/g)].map((m) => m[1]);
    expect(new Set(eyeCalls)).toEqual(new Set(['setTouch', 'setMode', 'setCurious', 'setTimings']));
    // settle() is called by Wheel on every settle, regardless of slot
    const wheelSrc = readFileSync('src/wheel/Wheel.ts', 'utf8');
    expect(wheelSrc).toMatch(/this\.eye\.settle\(now\);/);
    expect(wheelSrc).not.toMatch(/correct/i);
  });

  it('same seed → identical idle behaviour, whatever the wheel shows', () => {
    const a = mkEye(42);
    const b = mkEye(42);
    a.setMode('live', 0);
    b.setMode('live', 0);
    for (let t = 16; t < 30_000; t += 16) {
      a.update(t, 16);
      b.update(t, 16);
    }
    expect(a.pose).toEqual(b.pose);
  });
});
