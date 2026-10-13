import { describe, it, expect } from 'vitest';
import { Clock } from '../../src/util/clock';
import { Tweens, Seq, Cancelled, ease, approach, clamp } from '../../src/util/tween';
import { Machine } from '../../src/state/machine';

describe('Clock', () => {
  it('runs timeouts in order, scaled by speed', () => {
    const c = new Clock();
    c.speed = 10;
    const log: string[] = [];
    c.setTimeout(() => log.push('b'), 500);
    c.setTimeout(() => log.push('a'), 100);
    const h = c.setTimeout(() => log.push('x'), 200);
    c.clearTimeout(h);
    c.tick(16); // 160 ms game time
    expect(log).toEqual(['a']);
    c.tick(40); // 560 total
    expect(log).toEqual(['a', 'b']);
    expect(c.pendingCount).toBe(0);
  });

  it('clamps huge frame gaps', () => {
    const c = new Clock();
    c.tick(5000);
    expect(c.now).toBe(100);
  });

  it('drives the machine reset timer', () => {
    const c = new Clock();
    const m = new Machine({ resetAfterSuccessMs: 1000, resetAfterIdleMs: 9999 }, c);
    m.forceOpen();
    m.successDone();
    for (let i = 0; i < 10; i++) c.tick(100);
    expect(m.state).toBe('Reset');
  });
});

describe('Tweens & Seq', () => {
  it('tweens to the end value and resolves', async () => {
    const c = new Clock();
    const t = new Tweens(c);
    let v = 0;
    const p = t.to({ duration: 100, ease: ease.linear, onUpdate: (k) => (v = k) });
    c.tick(50);
    t.update();
    expect(v).toBeCloseTo(0.5);
    c.tick(60);
    t.update();
    await p;
    expect(v).toBe(1);
    expect(t.count).toBe(0);
  });

  it('cancelled sequences throw Cancelled', async () => {
    const c = new Clock();
    const t = new Tweens(c);
    const s = new Seq(c, t);
    const run = (async () => {
      await s.wait(100);
      return 'done';
    })();
    s.cancel();
    await expect(run).rejects.toBeInstanceOf(Cancelled);
  });

  it('after() skips its callback when cancelled', async () => {
    const c = new Clock();
    const t = new Tweens(c);
    const s = new Seq(c, t);
    let fired = 0;
    s.after(10, () => fired++);
    s.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(fired).toBe(0);
  });

  it('easing endpoints', () => {
    for (const f of Object.values(ease)) {
      expect(f(0)).toBeCloseTo(0);
      expect(f(1)).toBeCloseTo(1);
    }
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map((x) => ease.outBack(x)))).toBeGreaterThan(1);
    expect(approach(10, 0)).toBe(0);
    expect(clamp(5, 0, 1)).toBe(1);
  });
});
