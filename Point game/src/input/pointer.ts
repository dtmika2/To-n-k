import type { Vec } from '../pattern/types.ts';

export interface PointerSink {
  /** Any pointerdown, locked or not (a user gesture: unlock audio here). */
  gesture(): void;
  down(id: number, pos: Vec): void;
  move(id: number, path: Vec[]): void;
  up(id: number, cancelled: boolean): void;
}

/**
 * Plan §6: one touch at a time. Locks onto the first pointer (with pointer capture) and ignores all
 * others until it lifts. Moves carry every coalesced sample so the reducer can interpolate between them.
 */
export function attachPointerInput(el: HTMLElement, toWorld: (x: number, y: number) => Vec, sink: PointerSink): void {
  let locked: number | null = null;
  const rect = () => el.getBoundingClientRect();
  const at = (e: PointerEvent, r: DOMRect) => toWorld(e.clientX - r.left, e.clientY - r.top);

  el.style.touchAction = 'none';
  el.style.userSelect = 'none';

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sink.gesture();
    if (locked !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    locked = e.pointerId;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    sink.down(e.pointerId, at(e, rect()));
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== locked) return;
    const r = rect();
    const samples = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const path = (samples.length > 0 ? samples : [e]).map((s) => at(s, r));
    sink.move(e.pointerId, path);
  });

  const end = (cancelled: boolean) => (e: PointerEvent) => {
    if (e.pointerId !== locked) return;
    locked = null;
    sink.up(e.pointerId, cancelled);
  };
  el.addEventListener('pointerup', end(false));
  el.addEventListener('pointercancel', end(true));
  el.addEventListener('lostpointercapture', end(true));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
