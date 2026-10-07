import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateConfig, loadConfig } from '../../src/config';
import { parseFlags } from '../../src/flags';

const base = () => JSON.parse(readFileSync('public/config.json', 'utf8'));

describe('validateConfig', () => {
  it('accepts the shipped config', () => {
    const r = validateConfig(base());
    expect(r.ok).toBe(true);
  });

  it('shipped correct numbers match the plan', () => {
    const r = validateConfig(base());
    if (!r.ok) throw new Error('invalid');
    expect(r.config.wheels.map((w) => w.slots[w.correct])).toEqual([9, 12, 88, 14, 5, 3, 79, 0, 6, 31]);
  });

  it('rejects non-objects', () => {
    expect(validateConfig(null)).toEqual({ ok: false, errors: ['config is not a JSON object'] });
    expect(validateConfig([1])).toMatchObject({ ok: false });
  });

  const cases: [string, (c: any) => void, string][] = [
    ['wheels not array', (c) => (c.wheels = 3), '"wheels" must be an array'],
    ['9 wheels', (c) => c.wheels.pop(), 'expected 10 wheels'],
    ['start equals correct', (c) => (c.wheels[3].start = c.wheels[3].correct), 'must differ'],
    ['duplicate number', (c) => (c.wheels[1].slots[2] = c.wheels[0].slots[0]), 'already used'],
    ['2 slots', (c) => (c.wheels[2].slots = [1, 2]), 'exactly 3'],
    ['slot out of range', (c) => (c.wheels[2].slots[1] = 140), 'integer 0–99'],
    ['bad row', (c) => (c.wheels[0].row = 'side'), '"row" must be'],
    ['row order', (c) => {
      c.wheels[0].row = 'bottom';
    }, 'rows must be listed'],
    ['row count', (c) => (c.wheels[3].row = 'top'), 'row "top" must have 3'],
    ['duplicate id', (c) => (c.wheels[1].id = 1), 'duplicate id'],
    ['non-int id', (c) => (c.wheels[1].id = 'x'), '"id" must be an integer'],
    ['wheel not object', (c) => (c.wheels[4] = 7), 'not an object'],
    ['bad correct', (c) => (c.wheels[4].correct = 3), '"correct" must be a slot'],
    ['bad start', (c) => (c.wheels[4].start = -1), '"start" must be a slot'],
    ['timings missing', (c) => delete c.timings, '"timings" must be an object'],
    ['negative timing', (c) => (c.timings.resetAfterSuccessMs = -5), 'resetAfterSuccessMs'],
    ['bad range', (c) => (c.timings.blinkIntervalMs = [9000, 4000]), 'blinkIntervalMs'],
    ['bad pin', (c) => (c.operator.pin = '12a4'), 'operator.pin'],
    ['bad visual', (c) => (c.visual.mode = 'fancy'), 'visual must be'],
    ['bad volume', (c) => (c.audio.masterVolume = 2), 'masterVolume'],
  ];
  for (const [name, mutate, msg] of cases) {
    it(`rejects: ${name}`, () => {
      const c = base();
      mutate(c);
      const r = validateConfig(c);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join('\n')).toContain(msg);
    });
  }
});

describe('loadConfig', () => {
  it('loads and validates', async () => {
    const f = (async () => new Response(JSON.stringify(base()))) as unknown as typeof fetch;
    expect((await loadConfig('config.json', f)).ok).toBe(true);
  });
  it('reports HTTP errors', async () => {
    const f = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    const r = await loadConfig('config.json', f);
    expect(r).toEqual({ ok: false, errors: ['could not load config.json (HTTP 404)'] });
  });
  it('reports parse errors', async () => {
    const f = (async () => new Response('{oops')) as unknown as typeof fetch;
    const r = await loadConfig('config.json', f);
    expect(r.ok).toBe(false);
  });
});

describe('parseFlags', () => {
  it('parses dev flags', () => {
    const f = parseFlags('?debug&skip-intro&solve&placeholderSfx&speed=20&sprites');
    expect(f).toMatchObject({ debug: true, skipIntro: true, solve: true, placeholderSfx: true, speed: 20, visualMode: 'sprites' });
  });
  it('defaults and rejects unsafe config paths', () => {
    const f = parseFlags('?config=../../etc.json&speed=-3');
    expect(f.configUrl).toBe('config.json');
    expect(f.speed).toBe(1);
    expect(parseFlags('?config=tests/x.json').configUrl).toBe('tests/x.json');
    expect(parseFlags('?procedural').visualMode).toBe('procedural');
  });
});
