/**
 * Hold a pointer inside the bottom-left 120 × 120 zone for `holdMs`. Nothing is shown to players for
 * the first (holdMs − 1 s); during the last second a subtle ring fills. Leaving the zone (with a
 * little slop) or lifting the finger cancels.
 */
import { Container, Graphics } from 'pixi.js';
import type { PointerHandler, PointerInfo } from '../input/InputRouter';
import { OPERATOR_ZONE } from '../layout';

const SLOP = 24;
const RING_MS = 1000;

export class OperatorGesture {
  readonly root = new Container({ label: 'operatorRing' });
  private ring = new Graphics();
  private start: number | null = null;
  private fired = false;

  constructor(
    private now: () => number,
    private holdMs: () => number,
    private onTrigger: () => void,
  ) {
    this.root.addChild(this.ring);
    this.root.position.set(OPERATOR_ZONE.x + OPERATOR_ZONE.width / 2, OPERATOR_ZONE.y + OPERATOR_ZONE.height / 2);
  }

  private inZone(p: PointerInfo): boolean {
    const z = OPERATOR_ZONE;
    return p.x >= z.x - SLOP && p.x < z.x + z.width + SLOP && p.y >= z.y - SLOP && p.y < z.y + z.height + SLOP;
  }

  press(_p: PointerInfo): PointerHandler {
    this.start = this.now();
    this.fired = false;
    return {
      move: (q) => {
        if (!this.inZone(q)) this.cancel();
      },
      up: () => this.cancel(),
      cancel: () => this.cancel(),
    };
  }

  cancel(): void {
    this.start = null;
    this.ring.clear();
  }

  /** 0…1 progress of the visible ring (0 while still invisible). */
  get ringProgress(): number {
    if (this.start === null) return 0;
    const hold = this.holdMs();
    const visibleFrom = Math.max(0, hold - RING_MS);
    const t = this.now() - this.start;
    return t < visibleFrom ? 0 : Math.min(1, (t - visibleFrom) / Math.min(RING_MS, hold));
  }

  update(): void {
    if (this.start === null || this.fired) return;
    const elapsed = this.now() - this.start;
    const k = this.ringProgress;
    this.ring.clear();
    if (k > 0) {
      this.ring.circle(0, 0, 26).stroke({ width: 2, color: 0xffffff, alpha: 0.12 });
      this.ring
        .moveTo(0, -26)
        .arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2)
        .stroke({ width: 3, color: 0xffffff, alpha: 0.45, cap: 'round' });
    }
    if (elapsed >= this.holdMs()) {
      this.fired = true;
      this.ring.clear();
      this.start = null;
      this.onTrigger();
    }
  }
}
