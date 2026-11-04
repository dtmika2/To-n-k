import { describe, expect, it } from 'vitest';
import { assignDepths, atDepth, BANDS, bandOf, eyesBelow, lineLayer, orbitAlpha, orbitPoint, splitByLayer, type Orbit } from '../../src/render/depth.ts';
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
