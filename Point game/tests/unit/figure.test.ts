import { describe, expect, it } from 'vitest';
import { settings } from '../../src/config/settings.ts';
import pattern from '../../src/config/pattern.json';
import { buildContext } from '../../src/game/context.ts';
import { SURGE, figureProgress, figureSurge } from '../../src/game/figure.ts';
import { initialState } from '../../src/game/reducer.ts';
import type { GameContext, GameState } from '../../src/game/types.ts';
import type { Pattern } from '../../src/pattern/types.ts';
import { validatePattern } from '../../src/pattern/validate.ts';

/** Three eyes in a row: 0 —(0.3)— 1 —(0.1)— 2, so the line spends ¾ of its length on the first segment. */
function ctx(): GameContext {
  const c = buildContext(pattern as Pattern, settings);
  c.points = [
    { id: 0, pos: { x: 0.2, y: 0.5 }, r: 0.045 },
    { id: 1, pos: { x: 0.5, y: 0.5 }, r: 0.045 },
    { id: 2, pos: { x: 0.6, y: 0.5 }, r: 0.045 },
  ];
  c.figure = [0, 1, 2];
  return c;
}

function state(mode: GameState['mode'], modeSince = 0, cloudsReturning = false): GameState {
  return { ...initialState(0), mode, modeSince, cloudsReturning };
}

describe('reveal figure', () => {
  const c = ctx();
  const t = c.timing;

  it('only exists in REVEAL and IDLE', () => {
    expect(figureProgress(state('INTRO'), 1000, c)).toBeNull();
    expect(figureProgress(state('GAME'), 1000, c)).toBeNull();
    expect(figureProgress(state('REVEAL'), 1000, { ...c, figure: [] })).toBeNull();
  });

  it('waits for its delay, then draws at even speed along the line', () => {
    expect(figureProgress(state('REVEAL'), t.revealFigureDelayMs - 1, c)!.head).toBe(-1);
    expect(figureProgress(state('REVEAL'), t.revealFigureDelayMs, c)!.head).toBe(0);
    // half time = half the length (eased symmetrically) = 2/3 of the first, longer segment
    expect(figureProgress(state('REVEAL'), t.revealFigureDelayMs + t.revealFigureDrawMs / 2, c)!.head).toBeCloseTo(2 / 3);
    expect(figureProgress(state('REVEAL'), t.revealFigureDelayMs + t.revealFigureDrawMs, c)!.head).toBeCloseTo(2);
  });

  it('runs on into IDLE until complete, then fades out as the clouds return', () => {
    const end = t.revealFigureDelayMs + t.revealFigureDrawMs - t.revealDisperseMs; // IDLE time at which it completes
    if (end > 0) expect(figureProgress(state('IDLE', 0), 0, c)!.head).toBeLessThan(2);
    expect(figureProgress(state('IDLE', 0), Math.max(0, end), c)).toEqual({ head: 2, alpha: 1, doneMs: 0 });
    const fading = figureProgress(state('IDLE', 0, true), t.revealHoldMs + t.cloudsReturnMs / 2, c)!;
    expect(fading.alpha).toBeCloseTo(0.5);
  });

  it('the shipped pattern draws a figure the validator accepts', () => {
    expect((pattern as Pattern).figure?.length).toBeGreaterThan(1);
    const bad = JSON.parse(JSON.stringify(pattern)) as Pattern;
    bad.figure = [12, 99];
    expect(validatePattern(bad, settings).errors.join('\n')).toMatch(/figure uses unknown id 99/);
  });
});

describe('figure surges', () => {
  it('rest after completion, then run from before the first eye to past the last', () => {
    expect(figureSurge(0, 6)).toBeNull();
    expect(figureSurge(SURGE.restMs - 1, 6)).toBeNull();
    // sample a long stretch: surges happen, every position stays in range, and there are gaps
    let on = 0;
    let off = 0;
    for (let ms = SURGE.restMs; ms < SURGE.restMs + 60000; ms += 50) {
      const p = figureSurge(ms, 6);
      if (p === null) off++;
      else {
        on++;
        expect(p).toBeGreaterThanOrEqual(-0.5);
        expect(p).toBeLessThan(6.5);
      }
    }
    expect(on).toBeGreaterThan(0);
    expect(off).toBeGreaterThan(0); // pauses between surges
  });
});
