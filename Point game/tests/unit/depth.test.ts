import { describe, expect, it } from 'vitest';
import { assignDepths, atDepth, BANDS, bandOf, crossfadeByLayer, eyesBelow, fingerDepth, lineLayer, orbitAlpha, orbitPoint, splitByLayer, type Orbit } from '../../src/render/depth.ts';
import pattern from '../../src/config/pattern.json';

const points = pattern.points.map((p) => ({ id: p.id, seed: p.seed }));

describe('assignDepths', () => {
  it('gives every eye a depth in range', () => {
    const depths = assignDepths(points);
    expect(depths.size).toBe(points.length);
    for (const z of depths.values()) {
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(1);
    }
  });

  it('is the same on every run, whatever the order of the points', () => {
    const shuffled = [...points].reverse();
    expect([...assignDepths(shuffled)].sort((a, b) => a[0] - b[0])).toEqual([...assignDepths(points)].sort((a, b) => a[0] - b[0]));
  });

  it('shares the eyes evenly between the bands', () => {
    const counts = new Array(BANDS).fill(0);
    for (const z of assignDepths(points).values()) counts[bandOf(z)]++;
    expect(counts).toEqual(new Array(BANDS).fill(points.length / BANDS));
  });

  it('varies the depth inside a band', () => {
    expect(new Set(assignDepths(points).values()).size).toBe(points.length);
  });
});

describe('atDepth', () => {
  it('runs from the far value to the near value', () => {
    expect(atDepth([0.72, 1.2], 0)).toBeCloseTo(0.72);
    expect(atDepth([0.72, 1.2], 1)).toBeCloseTo(1.2);
    expect(atDepth([0.72, 1.2], 0.25)).toBeLessThan(atDepth([0.72, 1.2], 0.75));
  });
});

describe('lineLayer', () => {
  // Eyes at these depths, furthest first; layer k is above k eyes.
  const eyeZs = [0.1, 0.5, 0.851, 0.885];
  const far = { z: 0, dist: 1, reach: 0.1 }; // an end too far away to matter

  it('puts an eye in its own place', () => {
    expect(eyesBelow(eyeZs, 0.1)).toBe(0);
    expect(eyesBelow(eyeZs, 0.885)).toBe(3);
    expect(eyesBelow(eyeZs, 1)).toBe(4);
  });

  it('goes over an eye when nearer than it, and under when further', () => {
    expect(lineLayer(eyeZs, 0.7, [far])).toBe(2); // above 0.1 and 0.5, below 0.851
    expect(lineLayer(eyeZs, 0.3, [far])).toBe(1);
  });

  it('counts an eye about level with the line as below it', () => {
    expect(lineLayer(eyeZs, 0.847, [far])).toBe(3); // over the eye at 0.851, as a line from 10 to 5 goes over 4
  });

  it('stays under its own end eye close to it, even when rising towards the viewer', () => {
    const start = { z: 0.5, dist: 0.02, reach: 0.1 };
    expect(lineLayer(eyeZs, 0.7, [start])).toBe(eyesBelow(eyeZs, 0.5));
    expect(lineLayer(eyeZs, 0.7, [{ ...start, dist: 0.2 }])).toBe(2);
  });
});

describe('splitByLayer', () => {
  const run = Array.from({ length: 11 }, (_, i) => ({ s: i / 10 }));
  const byThirds = (p: { s: number }) => bandOf(p.s);

  it('keeps a line inside one layer whole', () => {
    expect(splitByLayer(run, () => 4)).toEqual([{ layer: 4, pts: run }]);
  });

  it('cuts a line wherever its layer changes, in order', () => {
    expect(splitByLayer(run, byThirds).map((p) => p.layer)).toEqual([0, 1, 2]);
  });

  it('leaves no gap: neighbouring pieces share a point', () => {
    const pieces = splitByLayer(run, byThirds);
    for (let i = 1; i < pieces.length; i++) expect(pieces[i].pts[0]).toBe(pieces[i - 1].pts.at(-1));
    expect(pieces[0].pts[0]).toBe(run[0]);
    expect(pieces.at(-1)!.pts.at(-1)).toBe(run.at(-1));
  });
});

describe('crossfadeByLayer', () => {
  const run = Array.from({ length: 31 }, (_, i) => ({ i, s: i / 30, a: 1 }));
  const byThirds = (p: { s: number }) => bandOf(p.s);
  const weigh = (p: { i: number; s: number; a: number }, w: number) => ({ ...p, a: p.a * w });

  it('keeps a line inside one layer whole, at full strength', () => {
    expect(crossfadeByLayer(run, () => 4, 3, weigh)).toEqual([{ layer: 4, pts: run }]);
  });

  it('cuts a line wherever its layer changes, in order', () => {
    expect(crossfadeByLayer(run, byThirds, 3, weigh).map((p) => p.layer)).toEqual([0, 1, 2]);
  });

  it('keeps the line at full strength at every point: the pieces\' weights add up to 1', () => {
    const total = new Map<number, number>();
    for (const piece of crossfadeByLayer(run, byThirds, 3, weigh))
      for (const p of piece.pts) total.set(p.i, (total.get(p.i) ?? 0) + p.a);
    expect(total.size).toBe(run.length);
    for (const sum of total.values()) expect(sum).toBeCloseTo(1, 10);
  });

  it('fades each piece out to nothing at a cut, rather than stopping at full strength', () => {
    const [first, second] = crossfadeByLayer(run, byThirds, 3, weigh);
    expect(first.pts.at(-1)!.a).toBe(0);
    expect(second.pts[0].a).toBe(0);
    expect(first.pts[0].a).toBe(1); // the line's own ends stay whole
  });

  it('works for cuts closer together than the fade', () => {
    const zigzag = (p: { i: number }) => (p.i >= 10 && p.i < 12 ? 1 : 0);
    const total = new Map<number, number>();
    for (const piece of crossfadeByLayer(run, zigzag, 3, weigh))
      for (const p of piece.pts) total.set(p.i, (total.get(p.i) ?? 0) + p.a);
    for (const sum of total.values()) expect(sum).toBeCloseTo(1, 10);
  });
});

describe('fingerDepth', () => {
  const near = { x: 0, y: 0, z: 0.9, inner: 0.07, outer: 0.2 };
  const far = { x: 1, y: 0, z: 0.1, inner: 0.07, outer: 0.2 };
  const regions = [near, far];
  const from = 0.5;

  it('keeps the depth of the eye it left, away from every eye', () => {
    expect(fingerDepth(0.5, 0, from, regions)).toBe(from);
  });

  it('reaches the eye\'s depth exactly where the finger reaches the eye', () => {
    expect(fingerDepth(0.05, 0, from, regions)).toBe(near.z);
    expect(fingerDepth(0.98, 0, from, regions)).toBe(far.z);
  });

  it('grows steadily on the way to a nearer eye, and shrinks towards a further one', () => {
    const towards = (eye: typeof near, sign: number) => [0.19, 0.15, 0.11, 0.08].map((d) => fingerDepth(eye.x + sign * d, 0, from, regions));
    const rising = towards(near, 1);
    const falling = towards(far, -1);
    for (let i = 1; i < rising.length; i++) {
      expect(rising[i]).toBeGreaterThan(rising[i - 1]);
      expect(falling[i]).toBeLessThan(falling[i - 1]);
    }
    expect(rising[0]).toBeGreaterThan(from);
    expect(falling[0]).toBeLessThan(from);
  });

  it('has no jump at the edges of a region', () => {
    expect(fingerDepth(near.outer - 1e-4, 0, from, regions)).toBeCloseTo(from, 3);
    expect(fingerDepth(near.inner + 1e-4, 0, from, regions)).toBeCloseTo(near.z, 3);
  });

  it('where regions overlap, favours the closer eye without jumping', () => {
    const close = [near, { ...far, x: 0.25 }];
    const steps = Array.from({ length: 11 }, (_, i) => fingerDepth(0.075 + i * 0.01, 0, from, close));
    expect(steps[0]).toBeCloseTo(near.z, 1);
    expect(steps[10]).toBeCloseTo(far.z, 1);
    for (let i = 1; i < steps.length; i++) expect(Math.abs(steps[i] - steps[i - 1])).toBeLessThan(0.25);
  });
});

describe('orbits', () => {
  // Starts in front of the eye; a quarter turn at speed 1 takes π/2 s, and half a turn later it is behind.
  const orbit: Orbit = { radius: 2, speed: 1, phase: 0, tilt: Math.PI / 2 - 0.01, node: 0 };
  const r = 1;
  const pathRadius = orbit.radius * r;

  it('keeps to its path radius', () => {
    for (const t of [0, 1, 2.5, 7]) {
      const p = orbitPoint(orbit, t, r);
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(pathRadius);
    }
  });

  it('is fully visible in front of the eye', () => {
    const front = orbitPoint(orbit, Math.PI / 2, r);
    expect(front.z).toBeGreaterThan(0);
    expect(orbitAlpha(front, r, pathRadius)).toBe(1);
  });

  it('disappears while it passes behind the eye', () => {
    const behind = orbitPoint(orbit, -Math.PI / 2, r);
    expect(behind.z).toBeLessThan(0);
    expect(Math.hypot(behind.x, behind.y)).toBeLessThan(r);
    expect(orbitAlpha(behind, r, pathRadius)).toBe(0);
  });

  it('shows again on the far side once it clears the eye, dimmer than in front', () => {
    const clear = { x: 1.7, y: 0, z: -0.5 };
    const a = orbitAlpha(clear, r, pathRadius);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
  });
});
