import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LockModel, stepSlot } from '../../src/state/lockModel';

const cfg = JSON.parse(readFileSync('public/config.json', 'utf8'));
const model = () => new LockModel(cfg.wheels);

describe('stepSlot', () => {
  it('wraps 0 ↔ 2 in both directions', () => {
    expect(stepSlot(0, 'cw')).toBe(1);
    expect(stepSlot(2, 'ccw')).toBe(1);
    expect(stepSlot(1, 'cw')).toBe(2);
    expect(stepSlot(2, 'cw')).toBe(0);
    expect(stepSlot(1, 'ccw')).toBe(0);
    expect(stepSlot(0, 'ccw')).toBe(2);
  });
  it('three steps return to the same slot', () => {
    for (const d of ['cw', 'ccw'] as const) {
      for (let s = 0; s < 3; s++) expect(stepSlot(stepSlot(stepSlot(s, d), d), d)).toBe(s);
    }
  });
});

describe('LockModel', () => {
  it('starts on the configured start slots', () => {
    const m = model();
    expect(m.snapshot()).toEqual(cfg.wheels.map((w: { start: number }) => w.start));
    expect(m.ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('start state is never solved, and no wheel starts correct', () => {
    const m = model();
    expect(m.isSolved()).toBe(false);
    expect(m.correctCount()).toBe(0);
  });

  it('rotate wraps and returns the new slot', () => {
    const m = model();
    m.setSlot(1, 0);
    expect(m.rotate(1, 'cw')).toBe(1);
    expect(m.rotate(1, 'ccw')).toBe(0);
    expect(m.rotate(1, 'ccw')).toBe(2);
  });

  it('value() reports the number in the window', () => {
    const m = model();
    m.setSlot(1, 2);
    expect(m.value(1)).toBe(9);
    expect(m.spec(1).slots).toEqual([57, 23, 9]);
  });

  it('solved only when all 10 are correct', () => {
    const m = model();
    for (const w of cfg.wheels) m.setSlot(w.id, w.correct);
    expect(m.isSolved()).toBe(true);
    expect(m.correctCount()).toBe(10);
    for (const w of cfg.wheels) {
      m.rotate(w.id, 'cw');
      expect(m.isSolved()).toBe(false);
      expect(m.isCorrect(w.id)).toBe(false);
      m.rotate(w.id, 'ccw');
      expect(m.isCorrect(w.id)).toBe(true);
    }
    expect(m.isSolved()).toBe(true);
  });

  it('reaches the solution by arrow-style rotations from start', () => {
    const m = model();
    for (const w of cfg.wheels) {
      let guard = 0;
      while (!m.isCorrect(w.id) && guard++ < 3) m.rotate(w.id, 'cw');
    }
    expect(m.isSolved()).toBe(true);
    expect(m.snapshot().map((s, i) => cfg.wheels[i].slots[s])).toEqual([9, 12, 88, 14, 5, 3, 79, 0, 6, 31]);
  });

  it('reset returns to start', () => {
    const m = model();
    m.setAllCorrectMinusOne();
    m.reset();
    expect(m.snapshot()).toEqual(cfg.wheels.map((w: { start: number }) => w.start));
  });

  it('correct-minus-one: every wheel one cw step from correct', () => {
    const m = model();
    m.setAllCorrectMinusOne();
    expect(m.correctCount()).toBe(0);
    for (const w of cfg.wheels) m.rotate(w.id, 'cw');
    expect(m.isSolved()).toBe(true);
  });

  it('one move from solved: nine correct, last needs one cw step', () => {
    const m = model();
    m.setOneMoveFromSolved();
    expect(m.correctCount()).toBe(9);
    expect(m.isCorrect(10)).toBe(false);
    m.rotate(10, 'cw');
    expect(m.isSolved()).toBe(true);
  });

  it('rejects unknown ids and bad slots', () => {
    const m = model();
    expect(() => m.get(99)).toThrow('unknown wheel id 99');
    expect(() => m.setSlot(1, 3)).toThrow('bad slot');
    expect(() => m.setSlot(1, 1.5)).toThrow('bad slot');
  });

  it('does not share state with the input specs', () => {
    const specs = [{ id: 1, slots: [1, 2, 3], correct: 1, start: 0 }];
    const m = new LockModel(specs);
    specs[0].slots[0] = 99;
    expect(m.spec(1).slots[0]).toBe(1);
  });
});
