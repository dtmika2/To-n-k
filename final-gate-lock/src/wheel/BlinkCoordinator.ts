/**
 * Global blink gate shared by all eyes. A blink is granted only if no other blink is in progress
 * and a minimum gap has passed, so two wheels never blink in the same frame (or overlap at all).
 */
export class BlinkCoordinator {
  private busyUntil = -Infinity;
  /** Recent grants [start, end) in game ms, for tests and diagnostics (bounded). */
  readonly log: [number, number][] = [];

  constructor(private minGapMs = 60) {}

  tryBlink(now: number, durationMs: number): boolean {
    if (now < this.busyUntil + this.minGapMs) return false;
    this.busyUntil = now + durationMs;
    this.log.push([now, this.busyUntil]);
    if (this.log.length > 2000) this.log.splice(0, this.log.length - 2000);
    return true;
  }

  get grants(): number {
    return this.log.length;
  }
}
