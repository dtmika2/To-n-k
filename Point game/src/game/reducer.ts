import { dist, lerpVec, segmentCircleEntry } from '../pattern/geometry.ts';
import type { Vec } from '../pattern/types.ts';
import type { Effect, GameContext, GameEvent, GameState, Mode, ReduceResult } from './types.ts';

export function initialState(now: number): GameState {
  return {
    mode: 'INTRO',
    sub: 'READY',
    modeSince: now,
    subSince: now,
    progress: 0,
    wrongStrikes: 0,
    liftStrikes: 0,
    liftTimerAt: null,
    pointer: null,
    finger: null,
    tether: null,
    inside: [],
    lastInputAt: now,
    demoStep: 0,
    collapseFrom: 0,
    cloudsReturning: false,
    chain: [],
  };
}

export type Reducer = (state: GameState, event: GameEvent, now: number) => ReduceResult;

/** Plan §3: the whole rule set as a pure function of (state, event, now). */
export function createReducer(ctx: GameContext): Reducer {
  const N = ctx.sequence.length;
  const byId = new Map(ctx.points.map((p) => [p.id, p]));
  const point = (id: number) => {
    const p = byId.get(id);
    if (!p) throw new Error(`unknown point ${id}`);
    return p;
  };
  const lastPoint = (s: GameState) => ctx.sequence[s.progress - 1];
  const within = (pos: Vec, id: number, scale: number) => dist(pos, point(id).pos) <= scale * point(id).r;

  // ── transitions ──────────────────────────────────────────────

  function clearAttempt(s: GameState): void {
    s.progress = 0;
    s.wrongStrikes = 0;
    s.liftStrikes = 0;
    s.liftTimerAt = null;
    s.tether = null;
    s.inside = [];
    s.collapseFrom = 0;
    s.chain = [];
  }

  function setSub(s: GameState, sub: GameState['sub'], now: number): void {
    s.sub = sub;
    s.subSince = now;
  }

  function startDemo(s: GameState, now: number, fx: Effect[]): void {
    clearAttempt(s);
    setSub(s, 'DEMO', now);
    s.demoStep = 0;
    fx.push({ type: 'demoStart' });
  }

  function toReady(s: GameState, now: number, fx: Effect[]): void {
    clearAttempt(s);
    setSub(s, 'READY', now);
    fx.push({ type: 'ready' });
  }

  function startGame(s: GameState, now: number, fx: Effect[]): void {
    s.mode = 'GAME';
    s.modeSince = now;
    s.lastInputAt = now;
    s.cloudsReturning = false;
    fx.push({ type: 'startGame' });
    startDemo(s, now, fx);
  }

  function enterCreative(s: GameState, now: number, fx: Effect[]): void {
    clearAttempt(s);
    s.mode = 'CREATIVE';
    s.modeSince = now;
    setSub(s, 'READY', now);
    fx.push({ type: 'creativeStart' });
  }

  function exitCreative(s: GameState, now: number, fx: Effect[]): void {
    s.mode = 'GAME';
    s.modeSince = now;
    if (s.pointer) s.pointer.ignored = true;
    fx.push({ type: 'creativeExit' });
    toReady(s, now, fx);
  }

  function toIntro(s: GameState, now: number, fx: Effect[], reason: 'inactivity' | 'cycle' | 'debug'): void {
    clearAttempt(s);
    s.mode = 'INTRO';
    s.modeSince = now;
    setSub(s, 'READY', now);
    s.cloudsReturning = false;
    if (s.pointer) s.pointer.ignored = true;
    fx.push({ type: 'toIntro', reason });
  }

  function startReveal(s: GameState, now: number, fx: Effect[]): void {
    s.mode = 'REVEAL';
    s.modeSince = now;
    s.liftTimerAt = null;
    s.inside = [];
    if (s.pointer) s.pointer.ignored = true;
    fx.push({ type: 'startReveal' });
  }

  function toIdle(s: GameState, now: number, fx: Effect[]): void {
    s.mode = 'IDLE';
    s.modeSince = now;
    s.cloudsReturning = false;
    s.tether = null;
    fx.push({ type: 'idle' });
  }

  function collapse(s: GameState, now: number, fx: Effect[]): void {
    s.collapseFrom = s.progress;
    setSub(s, 'COLLAPSE', now);
    s.liftTimerAt = null;
    s.tether = null;
    s.inside = [];
    if (s.pointer) s.pointer.ignored = true;
    fx.push({ type: 'collapse', progress: s.progress });
  }

  /** Enter LIFTED (finger up, or a wrong strike that is treated as a lift). */
  function lift(s: GameState, now: number, fx: Effect[]): void {
    setSub(s, 'LIFTED', now);
    s.liftTimerAt = now;
    s.inside = [];
    fx.push({ type: 'lift' });
  }

  function startTracing(s: GameState, pos: Vec, now: number, fx: Effect[], kind: 'start' | 'retouch'): void {
    setSub(s, 'TRACING', now);
    s.liftTimerAt = null;
    s.tether = pos;
    s.inside = [lastPoint(s)];
    fx.push({ type: 'playNote', point: lastPoint(s), kind });
  }

  // ── input ────────────────────────────────────────────────────

  function onDown(s: GameState, pos: Vec, now: number, fx: Effect[]): void {
    if (s.mode === 'INTRO') {
      startGame(s, now, fx);
      return;
    }
    if (s.mode === 'CREATIVE') {
      onCreativeDown(s, pos, now, fx);
      return;
    }
    if (s.mode !== 'GAME') return;
    const { correctScale, masterScale } = ctx.hit;
    switch (s.sub) {
      case 'READY':
        if (within(pos, ctx.sequence[0], correctScale)) {
          s.progress = 1;
          startTracing(s, pos, now, fx, 'start');
        } else if (dist(pos, ctx.master.pos) <= masterScale * ctx.master.r) {
          startDemo(s, now, fx);
        } else if (dist(pos, ctx.creative.pos) <= masterScale * ctx.creative.r) {
          enterCreative(s, now, fx);
        }
        return;
      case 'LIFTED':
        if (within(pos, lastPoint(s), correctScale)) startTracing(s, pos, now, fx, 'retouch');
        else fx.push({ type: 'pulseHint', point: lastPoint(s) });
        return;
      case 'DEMO':
        if (ctx.allowSkipDemo) toReady(s, now, fx);
        return;
      default:
        return;
    }
  }

  /**
   * Earliest entry at or after `t0` along a→b into a candidate point's circle. `radius` returns null
   * for points that cannot be hit; on a tie the `prefer`red point wins.
   */
  function firstHit(a: Vec, b: Vec, t0: number, radius: (id: number) => number | null, prefer?: number): { id: number; t: number } | null {
    const from = lerpVec(a, b, t0);
    let best: { id: number; t: number } | null = null;
    for (const p of ctx.points) {
      const r = radius(p.id);
      if (r === null) continue;
      const tt = segmentCircleEntry(from, b, p.pos, r);
      if (tt === null) continue;
      const t = t0 + tt * (1 - t0);
      if (!best || t < best.t || (t === best.t && p.id === prefer)) best = { id: p.id, t };
    }
    return best;
  }

  /**
   * Follow the finger along the interpolated path. Each sample-to-sample segment is hit-tested against
   * every point's circle; hits are processed in order along the path (so a fast swipe cannot skip a point).
   */
  function trace(s: GameState, path: Vec[], now: number, fx: Effect[]): void {
    const { correctScale, wrongScale, exitHysteresis } = ctx.hit;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      let t0 = 0;
      for (;;) {
        const last = lastPoint(s);
        const expected = ctx.sequence[s.progress];
        const best = firstHit(
          a,
          b,
          t0,
          (id) => (id === last || s.inside.includes(id) ? null : (id === expected ? correctScale : wrongScale) * point(id).r),
          expected,
        );
        if (!best) break;
        const hitPos = lerpVec(a, b, best.t);

        if (best.id !== expected) {
          s.wrongStrikes++;
          fx.push({ type: 'flinch', point: best.id });
          if (s.wrongStrikes >= 2) {
            collapse(s, now, fx);
          } else {
            fx.push({ type: 'retract', from: hitPos, to: last });
            lift(s, now, fx);
            s.tether = null;
            if (s.pointer) s.pointer.ignored = true;
          }
          return;
        }

        s.progress++;
        s.wrongStrikes = 0;
        s.liftStrikes = 0;
        s.inside.push(expected);
        fx.push({ type: 'lockSegment', from: last, to: expected, index: s.progress - 2 });
        fx.push({ type: 'playNote', point: expected, kind: 'reach' });
        if (s.progress === N) {
          s.tether = null;
          startReveal(s, now, fx);
          return;
        }
        t0 = best.t;
      }
      s.inside = s.inside.filter((id) => within(b, id, exitHysteresis));
    }
    s.tether = path[path.length - 1];
  }

  // ── creative mode ────────────────────────────────────────────

  function onCreativeDown(s: GameState, pos: Vec, now: number, fx: Effect[]): void {
    if (dist(pos, ctx.creative.pos) <= ctx.hit.masterScale * ctx.creative.r) {
      exitCreative(s, now, fx);
      return;
    }
    s.chain = [];
    s.inside = [];
    s.tether = null;
    const hit = ctx.points.find((p) => within(pos, p.id, ctx.hit.creativeScale));
    if (hit) {
      s.chain = [hit.id];
      s.inside = [hit.id];
      s.tether = pos;
      fx.push({ type: 'playNote', point: hit.id, kind: 'start' });
    }
  }

  /** Free play: any point the finger reaches joins the chain (no wrong points, no strikes). */
  function creativeTrace(s: GameState, path: Vec[], fx: Effect[]): void {
    const { creativeScale, exitHysteresis } = ctx.hit;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      let t0 = 0;
      for (;;) {
        const last = s.chain[s.chain.length - 1];
        const best = firstHit(a, b, t0, (id) => (id === last || s.inside.includes(id) ? null : creativeScale * point(id).r));
        if (!best) break;
        if (last === undefined) fx.push({ type: 'playNote', point: best.id, kind: 'start' });
        else {
          fx.push({ type: 'creativeLink', from: last, to: best.id });
          fx.push({ type: 'playNote', point: best.id, kind: 'reach' });
        }
        s.chain.push(best.id);
        s.inside.push(best.id);
        t0 = best.t;
      }
      s.inside = s.inside.filter((id) => within(b, id, exitHysteresis));
    }
    s.tether = s.chain.length > 0 ? path[path.length - 1] : null;
  }

  // ── time ─────────────────────────────────────────────────────

  function tick(s: GameState, now: number, fx: Effect[]): void {
    if (s.pointer) s.lastInputAt = now; // a held pointer counts as activity
    const t = ctx.timing;
    switch (s.mode) {
      case 'INTRO':
        return;
      case 'REVEAL':
        if (now - s.modeSince >= t.revealDisperseMs) toIdle(s, now, fx);
        return;
      case 'IDLE':
        if (!s.cloudsReturning && now - s.modeSince >= t.revealHoldMs) {
          s.cloudsReturning = true;
          fx.push({ type: 'cloudsReturn' });
        }
        if (s.cloudsReturning && now - s.modeSince >= t.revealHoldMs + t.cloudsReturnMs) toIntro(s, now, fx, 'cycle');
        return;
      case 'CREATIVE':
        if (now - s.lastInputAt >= t.inactivityMs) toIntro(s, now, fx, 'inactivity');
        return;
      case 'GAME':
        break;
    }

    if (now - s.lastInputAt >= t.inactivityMs) {
      toIntro(s, now, fx, 'inactivity');
      return;
    }

    switch (s.sub) {
      case 'DEMO': {
        const t0 = s.subSince + t.demoLeadMs;
        while (s.demoStep < N && now >= t0 + s.demoStep * t.demoStepMs) {
          fx.push({ type: 'demoBlink', point: ctx.sequence[s.demoStep], step: s.demoStep, noteMs: t.demoNoteMs });
          s.demoStep++;
        }
        if (now >= t0 + N * t.demoStepMs) toReady(s, now, fx);
        return;
      }
      case 'LIFTED':
        while (s.sub === 'LIFTED' && s.liftTimerAt !== null && now - s.liftTimerAt >= t.liftStrikeMs) {
          s.liftTimerAt += t.liftStrikeMs;
          s.liftStrikes++;
          fx.push({ type: 'liftStrike', count: s.liftStrikes });
          if (s.liftStrikes >= 2) {
            collapse(s, now, fx);
          } else if (s.tether) {
            fx.push({ type: 'retract', from: s.tether, to: lastPoint(s) });
            s.tether = null;
          } else {
            fx.push({ type: 'strikePulse' });
          }
        }
        return;
      case 'COLLAPSE':
        if (now - s.subSince >= t.collapseMs) toReady(s, now, fx);
        return;
      default:
        return;
    }
  }

  function jump(s: GameState, mode: Mode, now: number, fx: Effect[]): void {
    switch (mode) {
      case 'INTRO':
        toIntro(s, now, fx, 'debug');
        return;
      case 'GAME':
        startGame(s, now, fx);
        return;
      case 'REVEAL':
        s.progress = N;
        startReveal(s, now, fx);
        return;
      case 'IDLE':
        s.progress = N;
        toIdle(s, now, fx);
        return;
      case 'CREATIVE':
        enterCreative(s, now, fx);
        return;
    }
  }

  return function reduce(prev: GameState, ev: GameEvent, now: number): ReduceResult {
    const s: GameState = { ...prev, inside: [...prev.inside], chain: [...prev.chain], pointer: prev.pointer && { ...prev.pointer } };
    const fx: Effect[] = [];
    switch (ev.type) {
      case 'POINTER_DOWN':
        if (s.pointer) return { state: prev, effects: [] }; // one touch at a time
        s.pointer = { id: ev.id, ignored: false };
        s.finger = ev.pos;
        s.lastInputAt = now;
        onDown(s, ev.pos, now, fx);
        break;
      case 'POINTER_MOVE': {
        if (!s.pointer || s.pointer.id !== ev.id || ev.path.length === 0) return { state: prev, effects: [] };
        const start = s.finger ?? ev.path[0];
        s.finger = ev.path[ev.path.length - 1];
        s.lastInputAt = now;
        if (s.mode === 'GAME' && s.sub === 'TRACING' && !s.pointer.ignored) trace(s, [start, ...ev.path], now, fx);
        else if (s.mode === 'CREATIVE' && !s.pointer.ignored) creativeTrace(s, [start, ...ev.path], fx);
        break;
      }
      case 'POINTER_UP':
      case 'POINTER_CANCEL':
        if (!s.pointer || s.pointer.id !== ev.id) return { state: prev, effects: [] };
        s.pointer = null;
        s.lastInputAt = now;
        if (s.mode === 'GAME' && s.sub === 'TRACING') {
          s.tether = s.finger; // the tether hangs where the finger left
          lift(s, now, fx);
        } else if (s.mode === 'CREATIVE' && s.chain.length > 0) {
          fx.push({ type: 'creativeRelease', chain: s.chain });
          s.chain = [];
          s.inside = [];
          s.tether = null;
        }
        s.finger = null;
        break;
      case 'TICK':
        tick(s, now, fx);
        break;
      case 'MASTER_PRESSED':
        if (s.mode === 'GAME' && s.sub === 'READY') startDemo(s, now, fx);
        break;
      case 'CREATIVE_PRESSED':
        if (s.mode === 'GAME' && s.sub === 'READY') enterCreative(s, now, fx);
        else if (s.mode === 'CREATIVE') exitCreative(s, now, fx);
        break;
      case 'DEMO_DONE':
        if (s.mode === 'GAME' && s.sub === 'DEMO') toReady(s, now, fx);
        break;
      case 'ANIM_DONE':
        if (s.mode === 'GAME' && s.sub === 'COLLAPSE') toReady(s, now, fx);
        else if (s.mode === 'REVEAL') toIdle(s, now, fx);
        else if (s.mode === 'IDLE') toIntro(s, now, fx, 'cycle');
        break;
      case 'JUMP':
        jump(s, ev.mode, now, fx);
        break;
    }
    return { state: s, effects: fx };
  }
}

/** Fray intensity 0…1 while LIFTED: ramps across each lift interval (plan §3, LIFTED). */
export function liftIntensity(s: GameState, now: number, liftStrikeMs: number): number {
  if (s.mode !== 'GAME' || s.sub !== 'LIFTED' || s.liftTimerAt === null) return 0;
  return Math.max(0, Math.min(1, (now - s.liftTimerAt) / liftStrikeMs));
}

/** The point the player should reach next, or null outside TRACING/LIFTED. */
export function expectedPoint(s: GameState, ctx: GameContext): number | null {
  if (s.mode !== 'GAME' || (s.sub !== 'TRACING' && s.sub !== 'LIFTED')) return null;
  return ctx.sequence[s.progress] ?? null;
}
