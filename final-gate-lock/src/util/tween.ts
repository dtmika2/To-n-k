import type { Clock } from './clock';

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  /**
   * Heavy detent: starts slowly (mass), decelerates, and still has ~55% of its average speed when
   * it reaches the end — a hard stop, not a soft landing. Pair with a recoil for the impact.
   */
  heavyDetent: (t: number) => t * t * (2.4 - 1.4 * t),
  /** Heavy spin-down: strong deceleration that still lands with a little speed (hard stop). */
  heavySpin: (t: number) => 0.88 * (1 - Math.pow(1 - t, 3)) + 0.12 * t,
  /** Ease-out with a small overshoot (springy; no longer used for the mechanism). */
  outBack: (t: number, s = 1.25) => {
    const c3 = s + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
  },
} satisfies Record<string, Ease | ((t: number, s?: number) => number)>;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Frame-rate independent exponential approach: fraction to move this frame. */
export function approach(ratePerSec: number, dtMs: number): number {
  return 1 - Math.exp((-ratePerSec * dtMs) / 1000);
}

export interface TweenOpts {
  duration: number;
  ease?: Ease;
  delay?: number;
  onUpdate: (k: number) => void;
  tag?: string;
}

interface ActiveTween extends Required<Omit<TweenOpts, 'tag'>> {
  tag: string | undefined;
  start: number;
  resolve: () => void;
}

/** Tweens driven by the game clock. Promises always resolve (also when killed). */
export class Tweens {
  private active = new Set<ActiveTween>();
  constructor(private clock: Clock) {}

  to(opts: TweenOpts): Promise<void> {
    return new Promise((resolve) => {
      this.active.add({
        duration: Math.max(1, opts.duration),
        ease: opts.ease ?? ease.outCubic,
        delay: opts.delay ?? 0,
        onUpdate: opts.onUpdate,
        tag: opts.tag,
        start: this.clock.now,
        resolve,
      });
    });
  }

  update(): void {
    const now = this.clock.now;
    for (const tw of this.active) {
      const t = (now - tw.start - tw.delay) / tw.duration;
      if (t < 0) continue;
      if (t >= 1) {
        tw.onUpdate(tw.ease(1));
        this.active.delete(tw);
        tw.resolve();
      } else {
        tw.onUpdate(tw.ease(t));
      }
    }
  }

  /** Stop tweens with this tag (without applying the final value) and resolve them. */
  kill(tag: string): void {
    for (const tw of this.active) {
      if (tw.tag === tag) {
        this.active.delete(tw);
        tw.resolve();
      }
    }
  }

  get count(): number {
    return this.active.size;
  }
}

export class Cancelled extends Error {
  constructor() {
    super('sequence cancelled');
  }
}

/**
 * A cancellable async sequence. Every await goes through `wait`/`tween`; after a cancel the next
 * await throws `Cancelled`, so sequence code reads top to bottom without checks everywhere.
 */
export class Seq {
  cancelled = false;
  private readonly tag: string;
  private static counter = 0;

  constructor(
    private clock: Clock,
    private tweens: Tweens,
  ) {
    this.tag = `seq${Seq.counter++}`;
  }

  cancel(): void {
    this.cancelled = true;
    this.tweens.kill(this.tag);
  }

  check(): void {
    if (this.cancelled) throw new Cancelled();
  }

  async wait(ms: number): Promise<void> {
    this.check();
    await this.tweens.to({ duration: ms, ease: ease.linear, onUpdate: () => {}, tag: this.tag });
    this.check();
  }

  async tween(opts: Omit<TweenOpts, 'tag'>): Promise<void> {
    this.check();
    await this.tweens.to({ ...opts, tag: this.tag });
    this.check();
  }

  /** Start a tween without awaiting it (still killed on cancel). */
  fire(opts: Omit<TweenOpts, 'tag'>): Promise<void> {
    return this.tweens.to({ ...opts, tag: this.tag });
  }

  /** Run a fire-and-forget callback after a delay unless cancelled. */
  after(ms: number, fn: () => void): void {
    void this.tweens
      .to({ duration: ms, ease: ease.linear, onUpdate: () => {}, tag: this.tag })
      .then(() => {
        if (!this.cancelled) fn();
      });
  }

  get now(): number {
    return this.clock.now;
  }
}
