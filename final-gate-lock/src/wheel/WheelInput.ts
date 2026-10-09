/**
 * Turns pointers into wheel actions: arrow taps (one slot per tap, fired on press) and drags
 * (disc follows the change of pointer angle 1:1, snap on release with flick velocity).
 * A wheel is owned by one pointer at a time.
 */
import type { PointerHandler, PointerInfo } from '../input/InputRouter';
import type { Dir } from '../state/lockModel';
import { WHEEL } from '../layout';
import { releaseVelocity, wrapDelta } from './snap';
import type { Wheel } from './Wheel';

export interface WheelInputHooks {
  /** Game clock now (ms). */
  now(): number;
  /** Game speed (velocity is converted from real ms to game ms). */
  speed(): number;
  onArrow(w: Wheel, dir: Dir): void;
  onTouchStart(w: Wheel, p: PointerInfo): void;
  onTouchMove(w: Wheel, p: PointerInfo): void;
  onTouchEnd(w: Wheel): void;
}

export function arrowHandler(w: Wheel, dir: Dir, p: PointerInfo, hooks: WheelInputHooks): PointerHandler {
  w.setArrowPressed(dir, true);
  w.holdArrows(true);
  hooks.onTouchStart(w, p);
  if (w.step(dir, hooks.now())) hooks.onArrow(w, dir);
  const release = () => {
    w.setArrowPressed(dir, false);
    w.holdArrows(false);
    hooks.onTouchEnd(w);
  };
  return { move: (q) => hooks.onTouchMove(w, q), up: release, cancel: release };
}

export function dragHandler(w: Wheel, p: PointerInfo, hooks: WheelInputHooks): PointerHandler | null {
  if (!w.beginDrag(p.id)) return null;
  w.holdArrows(true);
  hooks.onTouchStart(w, p);
  let lastAngle = Math.atan2(p.y - w.y, p.x - w.x);
  /** Total unwrapped change of finger angle since the press. */
  let delta = 0;
  const samples: { t: number; a: number }[] = [{ t: p.t, a: 0 }];

  const track = (q: PointerInfo) => {
    const dx = q.x - w.x;
    const dy = q.y - w.y;
    const a = Math.atan2(dy, dx);
    if (Math.hypot(dx, dy) >= WHEEL.dragDeadRadius) {
      delta += wrapDelta(a - lastAngle);
      w.setDragDelta(delta);
    }
    lastAngle = a;
    samples.push({ t: q.t, a: delta });
    if (samples.length > 24) samples.shift();
    hooks.onTouchMove(w, q);
  };

  return {
    move: track,
    up: (q) => {
      track(q);
      // flick intent comes from the finger (real ms → game ms); the plate keeps its own momentum
      const v = releaseVelocity(samples) / hooks.speed();
      w.endDrag(v, hooks.now());
      w.holdArrows(false);
      hooks.onTouchEnd(w);
    },
    cancel: () => {
      w.cancelDrag(hooks.now());
      w.holdArrows(false);
      hooks.onTouchEnd(w);
    },
  };
}

/** Find what a press at (x, y) hits: visible arrows first (they sit above), then discs. */
export function routeWheelPress(
  wheels: readonly Wheel[],
  p: PointerInfo,
  hooks: WheelInputHooks,
): PointerHandler | null {
  for (const w of wheels) {
    if (!w.arrowsLive) continue; // hidden arrows aren't there
    const dir = w.hitArrow(p.x, p.y);
    if (dir) return arrowHandler(w, dir, p, hooks);
  }
  for (const w of wheels) {
    if (w.hitDisc(p.x, p.y)) return dragHandler(w, p, hooks);
  }
  return null;
}
