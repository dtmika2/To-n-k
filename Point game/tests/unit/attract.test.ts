import { describe, expect, it } from 'vitest';
import { settings } from '../../src/config/settings.ts';
import pattern from '../../src/config/pattern.json';
import { AttractPlayer, type AttractView } from '../../src/game/attract.ts';
import { buildContext } from '../../src/game/context.ts';
import { distToSegment } from '../../src/pattern/geometry.ts';
import type { Pattern } from '../../src/pattern/types.ts';

const ctx = buildContext(pattern as Pattern, settings);
const T = settings.timing.attract;

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 2 ** 32;
  };
}

interface Frame {
  now: number;
  notes: number[];
  view: AttractView | null;
}

function run(seed: number, ms: number, start = 1000, step = 16): Frame[] {
  const player = new AttractPlayer(ctx, T, seeded(seed));
  const frames: Frame[] = [];
  for (let now = start; now <= start + ms; now += step) {
    const r = player.update(now);
    frames.push({ now, notes: r.events.map((e) => e.point), view: r.view });
  }
  return frames;
}

/** Triples in the order they appear. */
function triples(frames: Frame[]): number[][] {
  const out: number[][] = [];
  for (const f of frames) {
    const t = f.view?.points;
    if (t && (out.length === 0 || out[out.length - 1].join() !== t.join())) out.push([...t]);
  }
  return out;
}

describe('attract demo', () => {
  const player = new AttractPlayer(ctx, T, seeded(1));
  const cycle = player.cycleMs;

  it('plays A, B, C at the configured times', () => {
    const p = new AttractPlayer(ctx, T, seeded(7));
    const first = p.update(1000);
    expect(first.events).toHaveLength(1);
    const [a, b, c] = first.view!.points;
    expect(first.events[0]).toEqual({ type: 'note', point: a, noteMs: T.noteMs });
    expect(p.update(1000 + T.drawMs - 1).events).toEqual([]);
    expect(p.update(1000 + T.drawMs).events.map((e) => e.point)).toEqual([b]);
    expect(p.update(1000 + 2 * T.drawMs).events.map((e) => e.point)).toEqual([c]);
    expect(p.update(1000 + 2 * T.drawMs + T.holdMs).events).toEqual([]);
  });

  it('picks three distinct points whose segments stay clear of every other point', () => {
    for (const t of triples(run(3, cycle * 25))) {
      expect(new Set(t).size).toBe(3);
      for (const [from, to] of [
        [t[0], t[1]],
        [t[1], t[2]],
      ]) {
        const a = ctx.points.find((p) => p.id === from)!.pos;
        const b = ctx.points.find((p) => p.id === to)!.pos;
        for (const p of ctx.points) {
          if (p.id === from || p.id === to) continue;
          expect(distToSegment(p.pos, a, b)).toBeGreaterThanOrEqual(ctx.hit.wrongScale * p.r + 0.015);
        }
      }
    }
  });

  it('draws forward, then un-draws from the start to the end before the next triple', () => {
    const frames = run(5, cycle * 6);
    let prev: AttractView | null = null;
    for (const f of frames) {
      const v = f.view;
      if (v && prev && v.points.join() === prev.points.join()) {
        expect(v.head).toBeGreaterThanOrEqual(prev.head);
        expect(v.tail).toBeGreaterThanOrEqual(prev.tail);
        expect(v.tail).toBeLessThanOrEqual(v.head);
      }
      if (v && prev && v.points.join() !== prev.points.join()) {
        throw new Error('a new triple started before the previous line was fully un-drawn');
      }
      prev = v;
    }
    expect(frames.some((f) => f.view === null)).toBe(true); // the gap between triples
  });

  it('consecutive triples use different points', () => {
    const ts = triples(run(9, cycle * 20));
    expect(ts.length).toBeGreaterThanOrEqual(15);
    for (let i = 1; i < ts.length; i++) expect(ts[i].some((id) => ts[i - 1].includes(id))).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    expect(triples(run(11, cycle * 5))).toEqual(triples(run(11, cycle * 5)));
  });
});
