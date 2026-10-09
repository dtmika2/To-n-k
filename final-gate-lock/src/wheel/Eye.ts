/**
 * Eye controller (pure, no rendering). One per wheel, fully independent.
 *
 * IMPORTANT: the eye never knows whether its wheel is correct. Its inputs are touch, neighbour
 * touches, settle events, sleep/wake and the global mode. Randomness comes only from its own RNG.
 *
 * Output is an EyePose that the wheel applies to rigid layers (lids slide, iris/pupil translate,
 * pupil scales, glow fades) — so the same motion drives procedural shapes or sprites.
 */
import { approach, clamp, lerp } from '../util/tween';
import { randBetween, randRange, type Rng } from '../util/random';
import type { BlinkCoordinator } from './BlinkCoordinator';
import { FEEL } from '../feel';

const E = FEEL.eye;

export interface Vec {
  x: number;
  y: number;
}

export interface EyePose {
  /** Lid closures 0 (open) … 1 (closed). */
  lidTop: number;
  lidBottom: number;
  iris: Vec;
  pupil: Vec;
  pupilScale: number;
  glow: number;
}

export interface EyeTimings {
  blinkIntervalMs: readonly [number, number];
  glanceIntervalMs: readonly [number, number];
  settledToDrowsyMs: number;
}

/**
 * shut     — closed (Shrouded, before the intro opens it)
 * live     — Playable behaviour: drowsy / curious / awake / settled, blinks and glances
 * asleep   — lids closed (after the ripple delay), pupil small, glow low
 * wide     — success: wide open, pupil snaps to centre and dilates
 * peaceful — Open state: lids close slowly and stay closed
 */
export type EyeMode = 'shut' | 'live' | 'asleep' | 'wide' | 'peaceful';
export type EyeLook = 'drowsy' | 'curious' | 'awake' | 'settled';

export const LIDS = {
  // Limits keep every window position readable: upper numbers clear the top lid up to ~0.43,
  // the bottom number clears the bottom lid up to ~0.17.
  drowsy: { top: 0.42, bottom: 0.12 },
  curious: { top: 0.26, bottom: 0.08 },
  awake: { top: 0.02, bottom: 0 },
  settled: { top: 0.14, bottom: 0.04 },
  closed: { top: 1, bottom: 1 },
  wide: { top: 0, bottom: 0 },
} as const;

export const BLINK_MS = E.blinkMs;
const SLOW_BLINK_MS = E.slowBlinkMs;

export interface EyeOpts {
  rng: Rng;
  timings: EyeTimings;
  gate: BlinkCoordinator;
  /** Max iris shift (px); the pupil moves `depth` × as far. */
  maxShift: number;
  depth: number;
  onBlink?: () => void;
}

export class Eye {
  mode: EyeMode = 'shut';
  readonly pose: EyePose = { lidTop: 1, lidBottom: 1, iris: { x: 0, y: 0 }, pupil: { x: 0, y: 0 }, pupilScale: 1, glow: 0 };

  private touchPoint: Vec | null = null;
  private curiousPoint: Vec | null = null;
  private settledUntil = -Infinity;
  private awakeUntil = -Infinity;
  private modeAt = 0;
  private modeDelay = 0;
  private blink: { start: number; dur: number } | null = null;
  private nextBlinkAt: number;
  private glance: { target: Vec; until: number } | null = null;
  private nextGlanceAt: number;
  private readonly breathPhase: number;
  private readonly breathPeriod: number;
  /** Smoothed lid base (without blink). */
  private baseTop = 1;
  private baseBottom = 1;
  private forcedBlinkAt: number | null = null;

  constructor(private o: EyeOpts) {
    this.nextBlinkAt = randRange(o.rng, o.timings.blinkIntervalMs);
    this.nextGlanceAt = randRange(o.rng, o.timings.glanceIntervalMs);
    this.breathPhase = o.rng() * Math.PI * 2;
    this.breathPeriod = randRange(o.rng, E.breathPeriodMs);
  }

  setTimings(t: EyeTimings): void {
    this.o.timings = t;
  }

  /** Change mode. `delayMs` postpones the visible change (asleep ripple). */
  setMode(mode: EyeMode, now: number, delayMs = 0): void {
    if (mode === this.mode && delayMs === 0) return;
    this.mode = mode;
    this.modeAt = now;
    this.modeDelay = delayMs;
    if (mode !== 'live') {
      this.glance = null;
    } else {
      this.nextBlinkAt = now + randRange(this.o.rng, this.o.timings.blinkIntervalMs);
      this.nextGlanceAt = now + randRange(this.o.rng, this.o.timings.glanceIntervalMs);
    }
  }

  /** Intro: open (from shut) with a slow blink, then settle into drowsy. */
  openSlowly(now: number): void {
    this.setMode('live', now);
    this.awakeUntil = now + 1200;
    this.forcedBlinkAt = now + 1100;
  }

  /** Finger position relative to the eye centre, or null when released. */
  setTouch(p: Vec | null, now: number): void {
    if (p) this.touchPoint = { x: p.x, y: p.y };
    else if (this.touchPoint) {
      this.touchPoint = null;
      this.awakeUntil = now + E.awakeLingerMs;
    }
  }

  /** Point (relative to this eye) of a neighbour being touched, or null. */
  setCurious(p: Vec | null): void {
    this.curiousPoint = p ? { x: p.x, y: p.y } : null;
  }

  /** Wheel just clicked into a slot: stays calmly open, back to drowsy after settledToDrowsyMs. */
  settle(now: number): void {
    this.settledUntil = now + this.o.timings.settledToDrowsyMs;
  }

  /** Touched, or just used (awake linger / settled): the eye holds still — no blinks, no glow flare. */
  private inUse(now: number): boolean {
    return !!this.touchPoint || now < this.awakeUntil || now < this.settledUntil;
  }

  get look(): EyeLook {
    if (this.touchPoint) return 'awake';
    if (this.curiousPoint) return 'curious';
    return 'drowsy';
  }

  get blinking(): boolean {
    return this.blink !== null;
  }

  /** Current behaviour label (for debugging/tests). */
  stateLabel(now: number): string {
    if (this.mode !== 'live') return this.mode;
    if (this.blink) return 'blink';
    if (this.touchPoint || now < this.awakeUntil) return 'awake';
    if (now < this.settledUntil) return 'settled';
    if (this.curiousPoint) return 'curious';
    if (this.glance) return 'glance';
    return 'drowsy';
  }

  update(now: number, dt: number): EyePose {
    const active = now >= this.modeAt + this.modeDelay;
    const mode: EyeMode = active ? this.mode : this.prevVisualMode();
    const R = this.o.rng;

    // ---- lid targets
    let lids: { top: number; bottom: number } = LIDS.closed;
    let lidRate: number = E.lidRate.settled;
    let lookTarget: Vec = { x: 0, y: 0 };
    let lookRate: number = E.lookRate.default;
    let scale = 1;
    let glow = 0;
    const breath = Math.sin((now / this.breathPeriod) * Math.PI * 2 + this.breathPhase);

    switch (mode) {
      case 'shut':
        lids = LIDS.closed;
        lidRate = E.lidRate.shut;
        scale = 0.9;
        glow = 0;
        break;
      case 'asleep':
        lids = LIDS.closed;
        lidRate = E.lidRate.asleep;
        scale = 0.88;
        glow = 0.05;
        break;
      case 'peaceful':
        lids = LIDS.closed;
        lidRate = E.lidRate.peaceful;
        scale = 0.9;
        glow = 0.12 + 0.04 * breath;
        break;
      case 'wide':
        lids = LIDS.wide;
        lidRate = E.lidRate.wide;
        lookRate = E.lookRate.wide;
        scale = 1.42;
        glow = 1;
        break;
      case 'live': {
        const touched = !!this.touchPoint;
        const awake = touched || now < this.awakeUntil;
        if (awake) {
          lids = LIDS.awake;
          lidRate = E.lidRate.awake;
          scale = 1.14;
          glow = E.glow.awake;
        } else if (now < this.settledUntil) {
          lids = LIDS.settled;
          lidRate = E.lidRate.settled;
          scale = 1.06;
          glow = E.glow.settled;
        } else if (this.curiousPoint) {
          lids = LIDS.curious;
          lidRate = E.lidRate.curious;
          scale = 1.05;
          glow = E.glow.curious;
        } else {
          lids = LIDS.drowsy;
          lidRate = E.lidRate.drowsy;
          scale = 0.97 + 0.035 * breath;
          glow = 0.2 + 0.05 * breath;
        }

        if (this.touchPoint) {
          lookTarget = this.toShift(this.touchPoint, 1);
          lookRate = E.lookRate.touch;
          this.glance = null;
        } else if (this.curiousPoint) {
          lookTarget = this.toShift(this.curiousPoint, 0.85);
          lookRate = E.lookRate.curious;
          this.glance = null;
        } else {
          // idle glances
          if (this.glance && now >= this.glance.until) {
            this.glance = null;
            this.nextGlanceAt = now + randRange(R, this.o.timings.glanceIntervalMs);
          }
          if (!this.glance && now >= this.nextGlanceAt) {
            const a = R() * Math.PI * 2;
            const m = randBetween(R, 0.5, 0.95);
            this.glance = { target: { x: Math.cos(a) * m, y: Math.sin(a) * m }, until: now + randRange(R, E.glanceHoldMs) };
          }
          if (this.glance) {
            lookTarget = { x: this.glance.target.x * this.o.maxShift, y: this.glance.target.y * this.o.maxShift * 0.75 };
            lookRate = E.lookRate.glance; // slow, heavy look-around
          }
        }

        // blinks (gated globally so no two eyes blink in the same frame); never while in use, and
        // not right after either, so the eye a player is working with never flickers
        if (this.inUse(now)) this.nextBlinkAt = Math.max(this.nextBlinkAt, now + E.calmAfterUseMs);
        if (this.forcedBlinkAt !== null && now >= this.forcedBlinkAt) {
          this.forcedBlinkAt = null;
          this.blink = { start: now, dur: SLOW_BLINK_MS };
        }
        if (!this.blink && now >= this.nextBlinkAt) {
          if (this.o.gate.tryBlink(now, BLINK_MS)) {
            this.blink = { start: now, dur: BLINK_MS };
            this.o.onBlink?.();
            this.nextBlinkAt = now + randRange(R, this.o.timings.blinkIntervalMs);
          } else {
            this.nextBlinkAt = now + randBetween(R, 70, 260);
          }
        }
        break;
      }
    }

    // ---- integrate
    const kl = approach(lidRate, dt);
    this.baseTop = lerp(this.baseTop, lids.top, kl);
    this.baseBottom = lerp(this.baseBottom, lids.bottom, kl);
    let top = this.baseTop;
    let bottom = this.baseBottom;
    if (this.blink) {
      const t = (now - this.blink.start) / this.blink.dur;
      if (t >= 1 || mode !== 'live') this.blink = null;
      else {
        const c = blinkCurve(t);
        top = Math.max(top, c);
        bottom = Math.max(bottom, c * 0.92);
      }
    }
    const p = this.pose;
    p.lidTop = clamp(top, 0, 1);
    p.lidBottom = clamp(bottom, 0, 1);
    const kk = approach(lookRate, dt);
    p.iris.x = lerp(p.iris.x, lookTarget.x, kk);
    p.iris.y = lerp(p.iris.y, lookTarget.y, kk);
    p.pupil.x = p.iris.x * this.o.depth;
    p.pupil.y = p.iris.y * this.o.depth;
    p.pupilScale = lerp(p.pupilScale, scale, approach(mode === 'wide' ? E.scaleRateWide : E.scaleRate, dt));
    p.glow = lerp(p.glow, glow, approach(mode === 'wide' ? E.glowRateWide : E.glowRate, dt));
    return p;
  }

  /** Before a delayed mode change takes effect, keep showing "live" (used by the asleep ripple). */
  private prevVisualMode(): EyeMode {
    return 'live';
  }

  /** Map a point relative to the eye into an iris shift clamped to an ellipse. */
  private toShift(v: Vec, gain: number): Vec {
    const d = Math.hypot(v.x, v.y);
    if (d < 1e-3) return { x: 0, y: 0 };
    const m = Math.min(d / 110, 1) * gain;
    return { x: (v.x / d) * m * this.o.maxShift, y: (v.y / d) * m * this.o.maxShift * 0.75 };
  }
}

/** Closure profile of a blink over t ∈ [0, 1): fast close, short hold, slightly slower open. */
export function blinkCurve(t: number): number {
  if (t < 0.3) return Math.sin((t / 0.3) * (Math.PI / 2));
  if (t < 0.45) return 1;
  const u = (t - 0.45) / 0.55;
  return 1 - u * u * (3 - 2 * u);
}
