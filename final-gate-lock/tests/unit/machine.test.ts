import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Machine, type MachineEvent } from '../../src/state/machine';
import type { Timers } from '../../src/util/clock';

const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (h) => clearTimeout(h),
};

const T = { resetAfterSuccessMs: 40_000, asleepAfterIdleMs: 60_000 };

function make() {
  const m = new Machine(T, realTimers);
  const events: MachineEvent[] = [];
  m.on((e) => events.push(e));
  return { m, events };
}

describe('Machine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts Shrouded with input disabled', () => {
    const { m } = make();
    expect(m.state).toBe('Shrouded');
    expect(m.inputEnabled).toBe(false);
  });

  it('runs the full loop with the 40 s hold', () => {
    const { m, events } = make();
    expect(m.tap()).toBe(true);
    expect(m.state).toBe('Intro');
    expect(m.inputEnabled).toBe(false);
    expect(m.introDone()).toBe(true);
    expect(m.state).toBe('Playable');
    expect(m.inputEnabled).toBe(true);
    expect(m.solved()).toBe(true);
    expect(m.state).toBe('Success');
    expect(m.inputEnabled).toBe(false);
    expect(m.successDone()).toBe(true);
    expect(m.state).toBe('Open');
    vi.advanceTimersByTime(39_999);
    expect(m.state).toBe('Open');
    vi.advanceTimersByTime(1);
    expect(m.state).toBe('Reset');
    expect(m.resetDone()).toBe(true);
    expect(m.state).toBe('Shrouded');
    expect(m.loops).toBe(1);
    const states = events.filter((e) => e.type === 'state').map((e) => (e as { to: string }).to);
    expect(states).toEqual(['Intro', 'Playable', 'Success', 'Open', 'Reset', 'Shrouded']);
  });

  it('ignores invalid transitions', () => {
    const { m, events } = make();
    expect(m.introDone()).toBe(false);
    expect(m.solved()).toBe(false);
    expect(m.successDone()).toBe(false);
    expect(m.resetDone()).toBe(false);
    expect(m.operatorReset()).toBe(false);
    m.tap();
    expect(m.tap()).toBe(false);
    expect(m.solved()).toBe(false);
    expect(events).toHaveLength(1);
  });

  it('honours a changed reset delay', () => {
    const { m } = make();
    m.setTimings({ resetAfterSuccessMs: 5_000 });
    m.tap();
    m.introDone();
    m.solved();
    m.successDone();
    vi.advanceTimersByTime(5_000);
    expect(m.state).toBe('Reset');
  });

  it('forceOpen works from Shrouded, Intro and Playable only', () => {
    const { m } = make();
    expect(m.forceOpen()).toBe(true);
    expect(m.state).toBe('Success');
    expect(m.forceOpen()).toBe(false);
    m.successDone();
    expect(m.forceOpen()).toBe(false);
    const b = make().m;
    b.tap();
    expect(b.forceOpen()).toBe(true);
    const c = make().m;
    c.tap();
    c.introDone();
    expect(c.forceOpen()).toBe(true);
  });

  it('operatorReset from Open cancels the pending reset timer', () => {
    const { m, events } = make();
    m.forceOpen();
    m.successDone();
    expect(m.operatorReset()).toBe(true);
    expect(m.state).toBe('Reset');
    m.resetDone();
    vi.advanceTimersByTime(60_000);
    expect(m.state).toBe('Shrouded');
    expect(events.filter((e) => e.type === 'state' && e.to === 'Reset')).toHaveLength(1);
  });

  it('operatorReset from Playable, Intro and Success', () => {
    for (const setup of [
      (m: Machine) => m.tap(),
      (m: Machine) => (m.tap(), m.introDone()),
      (m: Machine) => m.forceOpen(),
    ]) {
      const { m } = make();
      setup(m);
      expect(m.operatorReset()).toBe(true);
      expect(m.state).toBe('Reset');
      expect(m.operatorReset()).toBe(false);
    }
  });

  it('skipToPlayable from Shrouded or Intro', () => {
    const a = make().m;
    expect(a.skipToPlayable()).toBe(true);
    expect(a.state).toBe('Playable');
    expect(a.skipToPlayable()).toBe(false);
    const b = make().m;
    b.tap();
    expect(b.skipToPlayable()).toBe(true);
  });

  describe('asleep', () => {
    it('falls asleep after 60 s without activity in Playable, wakes on activity', () => {
      const { m, events } = make();
      m.tap();
      m.introDone();
      vi.advanceTimersByTime(59_999);
      expect(m.asleep).toBe(false);
      vi.advanceTimersByTime(1);
      expect(m.asleep).toBe(true);
      expect(events.at(-1)).toEqual({ type: 'asleep' });
      m.activity();
      expect(m.asleep).toBe(false);
      expect(events.at(-1)).toEqual({ type: 'wake' });
      vi.advanceTimersByTime(59_000);
      expect(m.asleep).toBe(false);
      m.activity(); // restarts countdown
      vi.advanceTimersByTime(59_000);
      expect(m.asleep).toBe(false);
      vi.advanceTimersByTime(1_000);
      expect(m.asleep).toBe(true);
    });

    it('never sleeps outside Playable and activity is ignored there', () => {
      const { m, events } = make();
      m.activity();
      vi.advanceTimersByTime(120_000);
      expect(m.asleep).toBe(false);
      m.tap();
      vi.advanceTimersByTime(120_000);
      expect(m.asleep).toBe(false);
      expect(events).toHaveLength(1);
    });

    it('leaving Playable while asleep emits wake and stops the idle timer', () => {
      const { m, events } = make();
      m.tap();
      m.introDone();
      vi.advanceTimersByTime(60_000);
      expect(m.asleep).toBe(true);
      m.solved();
      expect(m.asleep).toBe(false);
      expect(events.slice(-2).map((e) => e.type)).toEqual(['wake', 'state']);
      vi.advanceTimersByTime(120_000);
      expect(m.asleep).toBe(false);
    });
  });

  it('dispose clears timers and listeners', () => {
    const { m, events } = make();
    m.forceOpen();
    m.successDone();
    const n = events.length;
    m.dispose();
    vi.advanceTimersByTime(100_000);
    expect(m.state).toBe('Open');
    m.operatorReset();
    expect(events.length).toBe(n);
  });

  it('unsubscribe stops events', () => {
    const m = new Machine(T, realTimers);
    const seen: MachineEvent[] = [];
    const off = m.on((e) => seen.push(e));
    off();
    m.tap();
    expect(seen).toHaveLength(0);
  });
});
