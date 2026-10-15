import { describe, expect, it } from 'vitest';
import { settings } from '../../src/config/settings.ts';
import pattern from '../../src/config/pattern.json';
import { segmentCircleEntry } from '../../src/pattern/geometry.ts';
import { noteToFreq } from '../../src/pattern/notes.ts';
import { assignPitches } from '../../src/pattern/pitches.ts';
import type { Pattern } from '../../src/pattern/types.ts';
import { validatePattern } from '../../src/pattern/validate.ts';

const base = pattern as Pattern;
const clone = (): Pattern => JSON.parse(JSON.stringify(base)) as Pattern;

describe('geometry', () => {
  it('segmentCircleEntry finds the first entry along the segment', () => {
    expect(segmentCircleEntry({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, 1)).toBeCloseTo(0.4);
    expect(segmentCircleEntry({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 2 }, 1)).toBeNull();
    expect(segmentCircleEntry({ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, 1)).toBe(0);
    expect(segmentCircleEntry({ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 5, y: 0 }, 1)).toBeNull();
  });

  it('notes map to equal-tempered frequencies', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440);
    expect(noteToFreq('A3')).toBeCloseTo(220);
    expect(noteToFreq('E3')).toBeCloseTo(164.81, 1);
  });
});

describe('validator', () => {
  it('accepts the shipped pattern', () => {
    expect(validatePattern(base, settings).errors).toEqual([]);
  });

  const broken: [string, (p: Pattern) => void, RegExp][] = [
    ['wrong point count', (p) => p.points.pop(), /16 points/],
    ['wrong sequence length', (p) => p.sequence.pop(), /13 touches/],
    ['start equals end', (p) => (p.sequence[12] = p.sequence[0]), /start and end/],
    ['start repeated', (p) => (p.sequence[5] = p.sequence[0]), /start point .* more than once/],
    ['point follows itself', (p) => (p.sequence[3] = p.sequence[2]), /follows itself/],
    ['unknown id', (p) => (p.sequence[4] = 99), /unknown id/],
    ['missing note', (p) => (p.points[3].note = ''), /note is missing/],
    ['overlap', (p) => Object.assign(p.points[1], { x: p.points[0].x + 0.01, y: p.points[0].y }), /overlap/],
    [
      'segment through a point',
      (p) => {
        const [a, b] = [p.points[p.sequence[0]], p.points[p.sequence[1]]];
        const free = p.points.find((q) => !p.sequence.includes(q.id))!;
        Object.assign(free, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      },
      /passes too close/,
    ],
  ];
  for (const [name, mutate, msg] of broken) {
    it(`rejects: ${name}`, () => {
      const p = clone();
      mutate(p);
      expect(validatePattern(p, settings).errors.join('\n')).toMatch(msg);
    });
  }

  it('rejects a point on the creative button', () => {
    const p = clone();
    const free = p.points.find((q) => !p.sequence.includes(q.id))!;
    Object.assign(free, { x: settings.creative.x, y: settings.creative.y - 0.02 });
    expect(validatePattern(p, settings).errors.join('\n')).toMatch(/creative button/);
  });

  it('warns about points near the edge', () => {
    const p = clone();
    p.points[1].x = 0.06;
    expect(validatePattern(p, settings).warnings.join('\n')).toMatch(/edge/);
  });
});

describe('pitch assignment', () => {
  it('follows the plan for the placeholder sequence', () => {
    const p: Pattern = { points: base.points, sequence: [0, 4, 9, 5, 4, 11, 13, 9, 14, 6, 11, 2, 15] };
    const n = assignPitches(p).notes;
    expect(n.get(0)).toBe('A3');
    expect(n.get(15)).toBe('A4');
    expect([4, 9, 5, 11, 13, 14, 6, 2].map((id) => n.get(id))).toEqual(['C4', 'D4', 'E4', 'G4', 'C5', 'D5', 'E5', 'G5']);
    expect([1, 3, 7, 8, 10, 12].map((id) => n.get(id))).toEqual(['E3', 'G3', 'A5', 'C6', 'D6', 'E6']);
  });

  it('gives every point a distinct note when fewer points are used', () => {
    const p: Pattern = { points: base.points, sequence: [0, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 3] };
    const n = assignPitches(p).notes;
    expect(new Set(n.values()).size).toBe(16);
    expect([n.get(1), n.get(2)]).toEqual(['G4', 'C5']); // most central notes
  });

  it('the shipped pattern has its pitches assigned', () => {
    const n = assignPitches(base).notes;
    for (const pt of base.points) expect(pt.note).toBe(n.get(pt.id));
  });
});
