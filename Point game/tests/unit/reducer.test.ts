import { describe, expect, it } from 'vitest';
import { settings } from '../../src/config/settings.ts';
import pattern from '../../src/config/pattern.json';
import { buildContext } from '../../src/game/context.ts';
import { createReducer, initialState } from '../../src/game/reducer.ts';
import type { Effect, GameContext, GameEvent, GameState } from '../../src/game/types.ts';
import { lerpVec } from '../../src/pattern/geometry.ts';
import type { Pattern, Vec } from '../../src/pattern/types.ts';

const R = 0.05;
const TIMING = { ...settings.timing };

/** Small hand-made layout (world units). 0 → 1 → 2 are collinear, 3 is off to the side. */
function testContext(sequence: number[], timing: Partial<GameContext['timing']> = {}): GameContext {
  const pts: Vec[] = [
    { x: 0.2, y: 0.5 }, // 0
    { x: 0.5, y: 0.5 }, // 1
    { x: 0.8, y: 0.5 }, // 2
    { x: 0.5, y: 0.8 }, // 3
    { x: 0.5, y: 1.1 }, // 4
    { x: 0.2, y: 1.1 }, // 5
    { x: 0.8, y: 1.1 }, // 6
  ];
  return {
    points: pts.map((pos, id) => ({ id, pos, r: R })),
    sequence,
    master: { pos: { x: 0.5, y: 0.1 }, r: 0.045 },
    creative: { pos: { x: 0.5, y: 1.6 }, r: 0.045 },
    timing: { ...TIMING, ...timing },
    hit: { ...settings.hit },
    allowSkipDemo: false,
  };
}

class Sim {
  readonly reduce;
  state: GameState;
  now = 0;
  effects: Effect[] = [];
  last: Effect[] = [];

  constructor(readonly ctx: GameContext) {
    this.reduce = createReducer(ctx);
    this.state = initialState(0);
  }

  pos(id: number): Vec {
    return this.ctx.points.find((p) => p.id === id)!.pos;
  }

  send(ev: GameEvent): this {
    const r = this.reduce(this.state, ev, this.now);
    this.state = r.state;
    this.last = r.effects;
    this.effects.push(...r.effects);
    return this;
  }

  /** Advance time in 50 ms ticks. */
  wait(ms: number): this {
    const end = this.now + ms;
    while (this.now < end) {
      this.now = Math.min(end, this.now + 50);
      this.send({ type: 'TICK' });
    }
    return this;
  }

  down(pos: Vec, id = 1): this {
    return this.send({ type: 'POINTER_DOWN', id, pos });
  }

  up(id = 1): this {
    return this.send({ type: 'POINTER_UP', id });
  }

  /** Move the finger to `to` in `steps` evenly spaced events (one sample each). */
  moveTo(to: Vec, steps = 8, id = 1): this {
    const from = this.state.finger ?? to;
    for (let i = 1; i <= steps; i++) this.send({ type: 'POINTER_MOVE', id, path: [lerpVec(from, to, i / steps)] });
    return this;
  }

  /** INTRO → GAME → (demo skipped) → READY. */
  toReady(): this {
    this.down({ x: 0.5, y: 0.9 }).up().send({ type: 'DEMO_DONE' });
    expect(this.state.sub).toBe('READY');
    return this;
  }

  count(type: Effect['type']): number {
    return this.effects.filter((e) => e.type === type).length;
  }
}

describe('full trace', () => {
  it('a correct trace of the real pattern reaches REVEAL, with revisited points registering', () => {
    const ctx = buildContext(pattern as Pattern, settings);
    const sim = new Sim(ctx).toReady();
    const seq = ctx.sequence;
    sim.down(sim.pos(seq[0]));
    expect(sim.state.sub).toBe('TRACING');
    for (let i = 1; i < seq.length; i++) {
      sim.moveTo(sim.pos(seq[i]), 12);
      expect(sim.state.progress).toBe(i + 1);
    }
    expect(sim.state.mode).toBe('REVEAL');
    expect(sim.count('lockSegment')).toBe(12);
    expect(sim.count('flinch')).toBe(0);
    expect(sim.effects.some((e) => e.type === 'startReveal')).toBe(true);
  });

  it('the demo blinks every step in order, then goes to READY', () => {
    const ctx = testContext([0, 1, 2]);
    const sim = new Sim(ctx).down({ x: 0.5, y: 0.9 }).up();
    expect(sim.state.sub).toBe('DEMO');
    sim.wait(TIMING.introLeadMs + 3 * TIMING.demoStepMs + TIMING.demoOutroMs);
    const blinks = sim.effects.filter((e) => e.type === 'demoBlink').map((e) => (e as { point: number }).point);
    expect(blinks).toEqual([0, 1, 2]);
    expect(sim.state.sub).toBe('READY');
  });

  it('after the last blink a short outro plays, and touches stay ignored until READY', () => {
    const ctx = testContext([0, 1, 2]);
    const sim = new Sim(ctx).down({ x: 0.5, y: 0.9 }).up();
    sim.wait(TIMING.introLeadMs + 3 * TIMING.demoStepMs);
    expect(sim.effects.filter((e) => e.type === 'demoOutro')).toEqual([{ type: 'demoOutro', ms: TIMING.demoOutroMs }]);
    expect(sim.state.sub).toBe('DEMO');
    sim.down(sim.pos(0)).up(); // too early
    expect(sim.state).toMatchObject({ sub: 'DEMO', progress: 0 });
    sim.wait(TIMING.demoOutroMs);
    expect(sim.state.sub).toBe('READY');
    expect(sim.count('demoOutro')).toBe(1);
  });

  it('after the start tap the first blink waits for the long notice; master replays use the short lead', () => {
    const ctx = testContext([0, 1, 2]);
    const sim = new Sim(ctx).down({ x: 0.5, y: 0.9 }).up();
    expect(sim.effects).toContainEqual({ type: 'demoStart', leadMs: TIMING.introLeadMs });
    sim.wait(TIMING.introLeadMs - 100);
    expect(sim.count('demoBlink')).toBe(0);
    sim.wait(100);
    expect(sim.count('demoBlink')).toBe(1);

    sim.send({ type: 'DEMO_DONE' }).send({ type: 'MASTER_PRESSED' });
    expect(sim.last).toContainEqual({ type: 'demoStart', leadMs: TIMING.demoLeadMs });
    sim.wait(TIMING.demoLeadMs);
    expect(sim.count('demoBlink')).toBe(2);
  });

  it('touches during the demo are ignored', () => {
    const sim = new Sim(testContext([0, 1, 2])).down({ x: 0.5, y: 0.9 }).up();
    sim.down(sim.pos(0)).up();
    expect(sim.state.sub).toBe('DEMO');
    expect(sim.state.progress).toBe(0);
  });

  it('REVEAL → IDLE → clouds return → INTRO on the timers', () => {
    const sim = new Sim(testContext([0, 1])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(1)).up();
    expect(sim.state.mode).toBe('REVEAL');
    sim.wait(TIMING.revealDisperseMs);
    expect(sim.state.mode).toBe('IDLE');
    sim.down({ x: 0.5, y: 0.5 }).up(); // touches only ripple
    expect(sim.state.mode).toBe('IDLE');
    sim.wait(TIMING.revealHoldMs);
    expect(sim.count('cloudsReturn')).toBe(1);
    sim.wait(TIMING.cloudsReturnMs);
    expect(sim.state.mode).toBe('INTRO');
  });
});

describe('hit testing', () => {
  it('a fast swipe whose samples jump over the expected point still registers it', () => {
    const sim = new Sim(testContext([0, 1, 2, 4])).toReady();
    sim.down(sim.pos(0));
    sim.send({ type: 'POINTER_MOVE', id: 1, path: [sim.pos(2)] }); // one sample, straight over point 1
    expect(sim.state.progress).toBe(3);
    const locks = sim.effects.filter((e) => e.type === 'lockSegment');
    expect(locks).toEqual([
      { type: 'lockSegment', from: 0, to: 1, index: 0 },
      { type: 'lockSegment', from: 1, to: 2, index: 1 },
    ]);
  });

  it('coalesced samples in one event are processed in order along the path', () => {
    const sim = new Sim(testContext([0, 1, 3, 4])).toReady();
    sim.down(sim.pos(0));
    sim.send({ type: 'POINTER_MOVE', id: 1, path: [sim.pos(1), sim.pos(3), sim.pos(4)] });
    expect(sim.state.progress).toBe(4);
  });

  it('brushing a wrong point inside correctScale but outside wrongScale is forgiven', () => {
    const sim = new Sim(testContext([1, 4])).toReady();
    sim.down(sim.pos(1));
    const w = sim.pos(3); // point 3 lies between 1 and 4; pass beside it at 0.9 r
    sim.moveTo({ x: w.x + 0.9 * R, y: w.y - 0.1 }, 4);
    sim.moveTo({ x: w.x + 0.9 * R, y: w.y + 0.1 }, 4);
    sim.moveTo(sim.pos(4), 4);
    expect(sim.count('flinch')).toBe(0);
    expect(sim.state.progress).toBe(2);
  });

  it('the expected point uses the generous radius', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0));
    const p = sim.pos(1);
    sim.moveTo({ x: p.x - 0.1, y: p.y + 1.4 * R }, 4);
    sim.moveTo({ x: p.x, y: p.y + 1.4 * R }, 4);
    expect(sim.state.progress).toBe(2);
  });

  it('hysteresis: in A → B → A the finger must leave A before A registers again', () => {
    // 0 and 1 are 0.3 apart; with r = 0.15 the radii overlap heavily.
    const ctx = testContext([0, 1, 0]);
    ctx.points = ctx.points.map((p) => (p.id <= 1 ? { ...p, r: 0.15 } : p));
    const sim = new Sim(ctx).toReady();
    sim.down(sim.pos(0));
    sim.moveTo({ x: 0.3, y: 0.5 }, 4); // reaches 1's generous radius while still within 1.25 r of 0
    expect(sim.state.progress).toBe(2);
    expect(sim.state.inside).toContain(0);
    sim.moveTo(sim.pos(0), 4); // straight back: 0 must not register yet
    expect(sim.state.progress).toBe(2);
    sim.moveTo({ x: 0.2, y: 0.85 }, 4); // leave 0's hysteresis ring
    expect(sim.state.inside).not.toContain(0);
    sim.moveTo(sim.pos(0), 4);
    expect(sim.state.mode).toBe('REVEAL');
  });

  it('the last correct point never counts as wrong', () => {
    const sim = new Sim(testContext([0, 2, 4])).toReady();
    sim.down(sim.pos(0));
    sim.moveTo({ x: 0.2, y: 0.2 }, 4);
    sim.moveTo(sim.pos(0), 4); // back over the start
    expect(sim.count('flinch')).toBe(0);
    expect(sim.state.sub).toBe('TRACING');
  });
});

describe('wrong strikes', () => {
  it('wrong #1 → flinch, retract, LIFTED; the physical pointer is ignored until lifted', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(3), 6);
    expect(sim.count('flinch')).toBe(1);
    expect(sim.count('retract')).toBe(1);
    expect(sim.state.sub).toBe('LIFTED');
    expect(sim.state.tether).toBeNull();
    sim.moveTo(sim.pos(1), 6); // same finger, now ignored
    expect(sim.state.progress).toBe(1);
    sim.down(sim.pos(0), 2); // a second finger is ignored too while the first is down
    expect(sim.state.sub).toBe('LIFTED');
    sim.up().down(sim.pos(0)); // lift, retouch the last correct point
    expect(sim.state.sub).toBe('TRACING');
    sim.moveTo(sim.pos(1), 6);
    expect(sim.state.progress).toBe(2);
  });

  it('wrong #2 without progress → COLLAPSE → READY with counters reset', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(3), 6).up();
    sim.down(sim.pos(0)).moveTo(sim.pos(3), 6);
    expect(sim.state.sub).toBe('COLLAPSE');
    expect(sim.count('collapse')).toBe(1);
    sim.up().wait(TIMING.collapseMs);
    expect(sim.state.sub).toBe('READY');
    expect(sim.state).toMatchObject({ progress: 0, wrongStrikes: 0, liftStrikes: 0 });
  });

  it('wrong #1, progress, wrong → retract only (the counter was reset)', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(3), 6).up();
    sim.down(sim.pos(0)).moveTo(sim.pos(1), 6);
    expect(sim.state.wrongStrikes).toBe(0);
    sim.moveTo(sim.pos(3), 6);
    expect(sim.state.sub).toBe('LIFTED');
    expect(sim.count('collapse')).toBe(0);
    expect(sim.count('retract')).toBe(2);
  });
});

describe('lift strikes', () => {
  it('lift → retouch the last correct point within 4 s → no strike', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(1), 6).moveTo({ x: 0.6, y: 0.7 }, 4).up();
    expect(sim.state.sub).toBe('LIFTED');
    expect(sim.state.tether).not.toBeNull(); // hangs where the finger left
    sim.wait(TIMING.liftStrikeMs - 100);
    sim.down(sim.pos(1));
    expect(sim.state.sub).toBe('TRACING');
    expect(sim.state.liftStrikes).toBe(0);
    sim.wait(10000);
    expect(sim.count('liftStrike')).toBe(0);
  });

  it('lift → 4 s → retract; → 8 s → COLLAPSE', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(1), 6).moveTo({ x: 0.6, y: 0.7 }, 4).up();
    sim.wait(TIMING.liftStrikeMs - 50);
    expect(sim.state.liftStrikes).toBe(0);
    sim.wait(50);
    expect(sim.state.liftStrikes).toBe(1);
    expect(sim.last).toContainEqual(expect.objectContaining({ type: 'retract', to: 1 }));
    expect(sim.state.tether).toBeNull();
    sim.wait(TIMING.liftStrikeMs);
    expect(sim.state.sub).toBe('COLLAPSE');
    expect(sim.state.collapseFrom).toBe(2);
  });

  it('lift → 4 s → retouch → lift → 4 s → COLLAPSE (retouch does not reset counters)', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(1), 6).up();
    sim.wait(TIMING.liftStrikeMs);
    expect(sim.state.liftStrikes).toBe(1);
    sim.down(sim.pos(1)).up();
    sim.wait(TIMING.liftStrikeMs);
    expect(sim.state.sub).toBe('COLLAPSE');
  });

  it('a lift strike after a wrong strike only pulses the already retracted line', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(3), 6).up();
    sim.wait(TIMING.liftStrikeMs);
    expect(sim.count('strikePulse')).toBe(1);
    expect(sim.count('retract')).toBe(1); // only the wrong-strike retract
  });

  it('one lift strike plus one wrong strike → no collapse', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(1), 6).up();
    sim.wait(TIMING.liftStrikeMs);
    expect(sim.state.liftStrikes).toBe(1);
    sim.down(sim.pos(1)).moveTo(sim.pos(3), 6);
    expect(sim.state).toMatchObject({ sub: 'LIFTED', wrongStrikes: 1, liftStrikes: 1 });
    expect(sim.count('collapse')).toBe(0);
  });

  it('a touch on a non-last point while LIFTED is ignored and the last point pulses', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(1), 6).up();
    sim.down(sim.pos(0));
    expect(sim.state.sub).toBe('LIFTED');
    expect(sim.last).toEqual([{ type: 'pulseHint', point: 1 }]);
    sim.moveTo(sim.pos(2), 6).up(); // dragging from there does nothing
    expect(sim.state.progress).toBe(2);
  });
});

describe('master button and pointers', () => {
  it('the master button starts the demo only in READY', () => {
    const ctx = testContext([0, 1, 2]);
    const sim = new Sim(ctx).toReady();
    sim.down(ctx.master.pos).up();
    expect(sim.state.sub).toBe('DEMO');
    sim.send({ type: 'DEMO_DONE' });
    sim.down(sim.pos(0)).moveTo(sim.pos(1), 6).up(); // LIFTED
    sim.down(ctx.master.pos).up();
    expect(sim.state.sub).toBe('LIFTED');
    sim.send({ type: 'MASTER_PRESSED' });
    expect(sim.state.sub).toBe('LIFTED');
  });

  it('MASTER_PRESSED in READY replays the demo', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.send({ type: 'MASTER_PRESSED' });
    expect(sim.state.sub).toBe('DEMO');
  });

  it('a second pointer is ignored while the first is active', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down({ x: 0.9, y: 1.5 }, 1); // first finger lands nowhere useful
    sim.down(sim.pos(0), 2);
    expect(sim.state.sub).toBe('READY');
    sim.send({ type: 'POINTER_MOVE', id: 2, path: [sim.pos(1)] });
    sim.send({ type: 'POINTER_UP', id: 2 });
    expect(sim.state.pointer?.id).toBe(1);
    sim.up(1).down(sim.pos(0), 2);
    expect(sim.state.sub).toBe('TRACING');
  });

  it('pointercancel counts as a lift', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.down(sim.pos(0)).send({ type: 'POINTER_CANCEL', id: 1 });
    expect(sim.state.sub).toBe('LIFTED');
  });
});

describe('inactivity', () => {
  const slow = { demoStepMs: 60000, liftStrikeMs: 60000, collapseMs: 60000 };

  it('30 s without input returns to INTRO from DEMO', () => {
    const sim = new Sim(testContext([0, 1, 2], slow)).down({ x: 0.5, y: 0.9 }).up();
    sim.wait(TIMING.inactivityMs - 100);
    expect(sim.state.sub).toBe('DEMO');
    sim.wait(100);
    expect(sim.state.mode).toBe('INTRO');
    expect(sim.last).toContainEqual({ type: 'toIntro', reason: 'inactivity' });
  });

  it('… from READY', () => {
    const sim = new Sim(testContext([0, 1, 2], slow)).toReady();
    sim.wait(TIMING.inactivityMs);
    expect(sim.state.mode).toBe('INTRO');
  });

  it('… from LIFTED', () => {
    const sim = new Sim(testContext([0, 1, 2], slow)).toReady();
    sim.down(sim.pos(0)).up();
    expect(sim.state.sub).toBe('LIFTED');
    sim.wait(TIMING.inactivityMs);
    expect(sim.state.mode).toBe('INTRO');
  });

  it('… from COLLAPSE', () => {
    const sim = new Sim(testContext([0, 1, 2], slow)).toReady();
    sim.down(sim.pos(0)).moveTo(sim.pos(3), 6).up().down(sim.pos(0)).moveTo(sim.pos(3), 6).up();
    expect(sim.state.sub).toBe('COLLAPSE');
    sim.wait(TIMING.inactivityMs);
    expect(sim.state.mode).toBe('INTRO');
  });

  it('… but not from TRACING while the finger is held down', () => {
    const sim = new Sim(testContext([0, 1, 2], slow)).toReady();
    sim.down(sim.pos(0));
    sim.wait(TIMING.inactivityMs * 2);
    expect(sim.state.sub).toBe('TRACING');
    sim.up().wait(TIMING.inactivityMs);
    expect(sim.state.mode).toBe('INTRO');
  });

  it('INTRO: any tap starts the game', () => {
    const sim = new Sim(testContext([0, 1, 2]));
    sim.down({ x: 0.1, y: 1.7 });
    expect(sim.state).toMatchObject({ mode: 'GAME', sub: 'DEMO' });
    expect(sim.effects[0]).toEqual({ type: 'startGame', at: { x: 0.1, y: 1.7 } });
  });
});

describe('creative mode', () => {
  /** READY → tap the creative button → CREATIVE. */
  const enter = (sim: Sim) => {
    sim.toReady().down(sim.ctx.creative.pos).up();
    expect(sim.state.mode).toBe('CREATIVE');
    expect(sim.effects).toContainEqual({ type: 'creativeStart' });
    return sim;
  };

  it('the creative button works only in READY', () => {
    const ctx = testContext([0, 1, 2]);
    const sim = new Sim(ctx).down({ x: 0.5, y: 0.9 }).up(); // DEMO
    sim.down(ctx.creative.pos).up();
    sim.send({ type: 'CREATIVE_PRESSED' });
    expect(sim.state).toMatchObject({ mode: 'GAME', sub: 'DEMO' });
    sim.send({ type: 'DEMO_DONE' });
    sim.down(sim.pos(0)).moveTo(sim.pos(1), 6).up(); // LIFTED
    sim.down(ctx.creative.pos).up();
    sim.send({ type: 'CREATIVE_PRESSED' });
    expect(sim.state).toMatchObject({ mode: 'GAME', sub: 'LIFTED' });
  });

  it('CREATIVE_PRESSED enters from READY and leaves from CREATIVE', () => {
    const sim = new Sim(testContext([0, 1, 2])).toReady();
    sim.send({ type: 'CREATIVE_PRESSED' });
    expect(sim.state.mode).toBe('CREATIVE');
    sim.send({ type: 'CREATIVE_PRESSED' });
    expect(sim.state).toMatchObject({ mode: 'GAME', sub: 'READY' });
  });

  it('connects any points, unused ones too, with no strikes', () => {
    const sim = enter(new Sim(testContext([0, 1, 2])));
    sim.down(sim.pos(3)).moveTo(sim.pos(4), 6).moveTo(sim.pos(5), 6);
    expect(sim.state.chain).toEqual([3, 4, 5]);
    expect(sim.effects.filter((e) => e.type === 'creativeLink')).toEqual([
      { type: 'creativeLink', from: 3, to: 4 },
      { type: 'creativeLink', from: 4, to: 5 },
    ]);
    expect(sim.count('playNote')).toBe(3);
    expect(sim.count('flinch')).toBe(0);
    expect(sim.state).toMatchObject({ mode: 'CREATIVE', wrongStrikes: 0 });
  });

  it('a point can be revisited after the finger has left it', () => {
    const sim = enter(new Sim(testContext([0, 1, 2])));
    sim.down(sim.pos(4)).moveTo(sim.pos(5), 6).moveTo(sim.pos(4), 6);
    expect(sim.state.chain).toEqual([4, 5, 4]);
  });

  it('a touch off every point starts a chain at the first point reached', () => {
    const sim = enter(new Sim(testContext([0, 1, 2])));
    sim.down({ x: 0.35, y: 1.3 });
    expect(sim.state.chain).toEqual([]);
    sim.moveTo(sim.pos(5), 6);
    expect(sim.state.chain).toEqual([5]);
    expect(sim.effects).toContainEqual({ type: 'playNote', point: 5, kind: 'start' });
  });

  it('lifting releases the drawing; the next touch starts a new chain', () => {
    const sim = enter(new Sim(testContext([0, 1, 2])));
    sim.down(sim.pos(3)).moveTo(sim.pos(4), 6).up();
    expect(sim.last).toEqual([{ type: 'creativeRelease', chain: [3, 4] }]);
    expect(sim.state.chain).toEqual([]);
    sim.down(sim.pos(5));
    expect(sim.state.chain).toEqual([5]);
  });

  it('tapping the button again returns to READY', () => {
    const sim = enter(new Sim(testContext([0, 1, 2])));
    sim.down(sim.ctx.creative.pos);
    expect(sim.state).toMatchObject({ mode: 'GAME', sub: 'READY', chain: [] });
    expect(sim.last).toEqual([{ type: 'creativeExit' }, { type: 'ready' }]);
  });

  it('the master button does nothing in CREATIVE', () => {
    const sim = enter(new Sim(testContext([0, 1, 2])));
    sim.down(sim.ctx.master.pos).up();
    sim.send({ type: 'MASTER_PRESSED' });
    expect(sim.state.mode).toBe('CREATIVE');
    expect(sim.count('demoStart')).toBe(1); // only the one from entering GAME
  });

  it('a second pointer is ignored', () => {
    const sim = enter(new Sim(testContext([0, 1, 2])));
    sim.down(sim.pos(3), 1).down(sim.pos(4), 2);
    sim.send({ type: 'POINTER_MOVE', id: 2, path: [sim.pos(5)] });
    expect(sim.state.chain).toEqual([3]);
  });

  it('30 s without input returns to INTRO, but not while a finger is held', () => {
    const sim = enter(new Sim(testContext([0, 1, 2])));
    sim.down(sim.pos(3));
    sim.wait(TIMING.inactivityMs * 2);
    expect(sim.state.mode).toBe('CREATIVE');
    sim.up().wait(TIMING.inactivityMs);
    expect(sim.state.mode).toBe('INTRO');
    expect(sim.last).toContainEqual({ type: 'toIntro', reason: 'inactivity' });
  });
});
