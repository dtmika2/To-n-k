/**
 * Routes DOM pointer events to per-pointer handlers. Each pointerId belongs to whatever handler it
 * started on (pointer capture), so several fingers can work on different wheels at the same time.
 */
export interface PointerInfo {
  id: number;
  /** Logical (1280 × 800) coordinates. */
  x: number;
  y: number;
  /** performance.now() of the event. */
  t: number;
}

export interface PointerHandler {
  move?(p: PointerInfo): void;
  up?(p: PointerInfo): void;
  cancel?(): void;
}

export class InputRouter {
  private handlers = new Map<number, PointerHandler>();
  /** Total pointerdown events seen (diagnostics). */
  downs = 0;

  constructor(
    private el: HTMLElement,
    private toLogical: (cx: number, cy: number) => { x: number; y: number },
    private onDown: (p: PointerInfo) => PointerHandler | null,
  ) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    el.addEventListener('pointermove', this.move, { passive: false });
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('lostpointercapture', this.lost);
  }

  get activeCount(): number {
    return this.handlers.size;
  }

  private info(e: PointerEvent): PointerInfo {
    const { x, y } = this.toLogical(e.clientX, e.clientY);
    return { id: e.pointerId, x, y, t: e.timeStamp || performance.now() };
  }

  private down = (e: PointerEvent) => {
    e.preventDefault();
    this.downs++;
    // A stale handler for the same id (missed up) is cancelled first.
    this.handlers.get(e.pointerId)?.cancel?.();
    this.handlers.delete(e.pointerId);
    const h = this.onDown(this.info(e));
    if (!h) return;
    this.handlers.set(e.pointerId, h);
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers may not support capture */
    }
  };

  private move = (e: PointerEvent) => {
    const h = this.handlers.get(e.pointerId);
    if (!h) return;
    e.preventDefault();
    // Use coalesced events for smooth 1:1 tracking on high-rate touchscreens.
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (list.length > 1) for (const ce of list) h.move?.(this.info(ce));
    else h.move?.(this.info(e));
  };

  private up = (e: PointerEvent) => {
    const h = this.handlers.get(e.pointerId);
    if (!h) return;
    this.handlers.delete(e.pointerId);
    h.up?.(this.info(e));
  };

  private cancel = (e: PointerEvent) => {
    const h = this.handlers.get(e.pointerId);
    if (!h) return;
    this.handlers.delete(e.pointerId);
    h.cancel?.();
  };

  private lost = (e: PointerEvent) => {
    // Capture lost without an up/cancel (rare) → treat as release.
    const h = this.handlers.get(e.pointerId);
    if (!h) return;
    this.handlers.delete(e.pointerId);
    h.up?.(this.info(e));
  };

  /** Cancel every active pointer (state change). */
  cancelAll(): void {
    const hs = [...this.handlers.values()];
    this.handlers.clear();
    for (const h of hs) h.cancel?.();
  }

  destroy(): void {
    this.cancelAll();
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.cancel);
    this.el.removeEventListener('lostpointercapture', this.lost);
  }
}
