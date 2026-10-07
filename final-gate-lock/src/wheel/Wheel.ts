/**
 * One wheel = one eye. Owns its layers (built through the LayerFactory), the disc rotation
 * animator and the eye controller. Input arrives from WheelInput; truth is written to the lock
 * model by the owner via the onSettle hook.
 *
 * Layer stack (bottom → top): ring, disc (+numerals), iris, pupil + highlight, lids (masked), glow.
 * Only the disc rotates. Arrows sit above the wheel.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Dir } from '../state/lockModel';
import { ARROW, WHEEL } from '../layout';
import type { LayerFactory, LayerId } from '../render/layers';
import { lidBottomY, lidTopY } from '../render/procedural/wheel';
import { C } from '../render/palette';
import { ease, type Ease } from '../util/tween';
import { Eye } from './Eye';
import { STEP, angleForSlot, nearestDetent, normalizeAngle, slotOfAngle, snapTarget } from './snap';

export type SettleReason = 'arrow' | 'drag' | 'spin';

export interface WheelHooks {
  onSettle(w: Wheel, slot: number, reason: SettleReason): void;
  onSlotPass(w: Wheel, reason: 'drag' | 'spin'): void;
}

interface Anim {
  from: number;
  to: number;
  start: number;
  dur: number;
  ease: Ease;
  reason: SettleReason;
  resolve?: () => void;
}

const DEG = Math.PI / 180;
export const WINDOW_CENTER = ((WHEEL.windowStartDeg + WHEEL.windowEndDeg) / 2) * DEG;

export const NUMERAL_STYLE = {
  fontFamily: 'Cinzel, Georgia, serif',
  fontWeight: '700' as const,
  fontSize: WHEEL.numeralSize,
  fill: C.parchment,
  dropShadow: { color: 0x000000, alpha: 0.85, angle: Math.PI / 4, distance: 1.6, blur: 1 },
};

export class Wheel {
  readonly root = new Container();
  /** Everything that sinks into the plate on unlock. */
  readonly body = new Container();
  readonly discRot = new Container();
  private readonly numerals = new Container();
  private readonly irisGroup = new Container();
  private readonly pupilGroup = new Container();
  private readonly lids = new Container();
  private readonly lidMask = new Graphics();
  readonly arrows = new Container();
  private readonly slots = new Map<LayerId, Container>();
  private readonly arrowState = { cw: false, ccw: false };
  private overlay: Container | null = null;
  /** Brass collar shown on unlock. */
  private lockRing: Container;

  angle = 0;
  restSlot: number;
  private anim: Anim | null = null;
  private queued: Dir | null = null;
  private lastDetent: number;
  /** Pointer id currently dragging this wheel. */
  owner: number | null = null;
  private factoryRevision = -1;

  constructor(
    readonly id: number,
    readonly x: number,
    readonly y: number,
    readonly values: readonly number[],
    startSlot: number,
    readonly eye: Eye,
    private factory: LayerFactory,
    private hooks: WheelHooks,
  ) {
    this.root.label = `wheel${id}`;
    this.root.position.set(x, y);
    this.restSlot = startSlot;
    this.angle = angleForSlot(startSlot);
    this.lastDetent = nearestDetent(this.angle);

    const slot = (id: LayerId, parent: Container) => {
      const c = new Container({ label: `slot:${id}` });
      parent.addChild(c);
      this.slots.set(id, c);
      return c;
    };

    slot('ring', this.body);
    this.body.addChild(this.discRot);
    slot('disc', this.discRot);
    this.discRot.addChild(this.numerals);
    this.body.addChild(this.irisGroup);
    slot('iris', this.irisGroup);
    this.body.addChild(this.pupilGroup);
    slot('pupil', this.pupilGroup);
    slot('highlight', this.pupilGroup);
    this.body.addChild(this.lids);
    slot('lidTop', this.lids);
    slot('lidBottom', this.lids);
    this.lidMask.circle(0, 0, WHEEL.eyeRadius).fill(0xffffff);
    this.body.addChild(this.lidMask);
    this.lids.mask = this.lidMask;
    slot('glow', this.body);
    this.lockRing = slot('lockRing', this.body);
    this.lockRing.visible = false;

    for (const dir of ['ccw', 'cw'] as const) {
      const g = new Container({ label: `arrow:${dir}` });
      g.position.set(dir === 'cw' ? ARROW.offsetX : -ARROW.offsetX, ARROW.offsetY);
      this.arrows.addChild(g);
      slot(dir === 'cw' ? 'arrowCw' : 'arrowCcw', g);
      slot(dir === 'cw' ? 'arrowCwPressed' : 'arrowCcwPressed', g);
    }

    this.root.addChild(this.body, this.arrows);
    this.buildNumerals();
    this.rebuildLayers();
    this.applyPose();
  }

  // ---------------------------------------------------------------- layers

  /** (Re)create every layer through the factory (mode switch / sprite fallback). */
  rebuildLayers(): void {
    for (const [id, c] of this.slots) {
      for (const child of c.removeChildren()) child.destroy();
      c.addChild(this.factory.create(id));
    }
    this.factoryRevision = this.factory.revision;
    this.updateArrowVisuals();
  }

  private buildNumerals() {
    this.values.forEach((value, i) => {
      const holder = new Container({ label: `numeral${i}` });
      const a = WINDOW_CENTER + i * STEP;
      holder.position.set(Math.cos(a) * WHEEL.numeralRadius, Math.sin(a) * WHEEL.numeralRadius);
      // upright when slot i rests in the window (disc angle = −i·STEP)
      holder.rotation = i * STEP;
      const t = new Text({ text: String(value), style: NUMERAL_STYLE, resolution: 3 });
      t.anchor.set(0.5, 0.52);
      holder.addChild(t);
      if (value === 6 || value === 9) {
        // underline so 6 and 9 can't be confused
        const u = new Graphics()
          .roundRect(-7, WHEEL.numeralSize * 0.38, 14, 2.6, 1.3)
          .fill(C.parchment);
        u.label = 'mark69';
        holder.addChild(u);
      }
      this.numerals.addChild(holder);
    });
  }

  // ---------------------------------------------------------------- rotation

  get dragging(): boolean {
    return this.owner !== null;
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  /** At rest: not dragged, not animating, nothing queued. */
  get atRest(): boolean {
    return !this.dragging && !this.anim && !this.queued;
  }

  /** Arrow tap: one slot in `dir`. During an animation, queue at most one extra step. */
  step(dir: Dir, now: number): boolean {
    if (this.dragging) return false;
    if (this.anim) {
      if (this.queued) return false;
      this.queued = dir;
      return true;
    }
    const base = nearestDetent(this.angle) * STEP;
    const target = base + (dir === 'cw' ? STEP : -STEP);
    this.startAnim(target, 250, ease.outBack, 'arrow', now);
    return true;
  }

  beginDrag(pointerId: number): boolean {
    if (this.owner !== null) return false;
    this.owner = pointerId;
    this.anim = null; // take over from wherever the disc is
    this.queued = null;
    this.lastDetent = nearestDetent(this.angle);
    return true;
  }

  dragBy(delta: number): void {
    this.angle += delta;
    const d = nearestDetent(this.angle);
    if (d !== this.lastDetent) {
      this.lastDetent = d;
      this.hooks.onSlotPass(this, 'drag');
    }
  }

  /** Release: snap to the nearest slot (a fast flick may add one). */
  endDrag(velocity: number, now: number): void {
    if (this.owner === null) return;
    this.owner = null;
    const target = snapTarget(this.angle, velocity);
    const dist = Math.abs(target - this.angle) / STEP;
    this.startAnim(target, 150 + 190 * Math.min(dist, 1.5), ease.outBack, 'drag', now);
  }

  /** Abort a drag without input (state change): snap straight to the nearest slot. */
  cancelDrag(now: number): void {
    if (this.owner === null) return;
    this.owner = null;
    this.startAnim(nearestDetent(this.angle) * STEP, 160, ease.outCubic, 'drag', now);
  }

  /** Intro spin: several fast turns clockwise, decelerating onto `slot`. */
  spinTo(slot: number, durationMs: number, turns: number, now: number): Promise<void> {
    this.queued = null;
    const minTarget = this.angle + turns * 2 * Math.PI;
    let target = angleForSlot(slot, minTarget);
    if (target < minTarget) target += 2 * Math.PI;
    return new Promise((resolve) => {
      this.startAnim(target, durationMs, ease.outCubic, 'spin', now, resolve);
    });
  }

  /** Jump without animation (reset off-screen, operator presets). */
  setSlotImmediate(slot: number): void {
    this.anim = null;
    this.queued = null;
    this.owner = null;
    this.angle = angleForSlot(slot);
    this.restSlot = slot;
    this.lastDetent = nearestDetent(this.angle);
    this.discRot.rotation = this.angle;
  }

  /** Visual-only offset (before the intro spin). */
  setAngleImmediate(angle: number): void {
    this.anim = null;
    this.angle = angle;
    this.lastDetent = nearestDetent(angle);
    this.discRot.rotation = angle;
  }

  private startAnim(to: number, dur: number, e: Ease, reason: SettleReason, now: number, resolve?: () => void) {
    this.anim?.resolve?.();
    this.anim = { from: this.angle, to, start: now, dur, ease: e, reason, resolve };
  }

  private finishAnim(now: number) {
    const a = this.anim!;
    this.anim = null;
    this.angle = a.to;
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      this.step(q, now);
      a.resolve?.();
      return;
    }
    this.angle = normalizeAngle(this.angle);
    this.lastDetent = nearestDetent(this.angle);
    this.restSlot = slotOfAngle(this.angle);
    this.eye.settle(now);
    this.hooks.onSettle(this, this.restSlot, a.reason);
    a.resolve?.();
  }

  // ---------------------------------------------------------------- arrows

  setArrowPressed(dir: Dir, pressed: boolean): void {
    this.arrowState[dir] = pressed;
    this.updateArrowVisuals();
  }

  private updateArrowVisuals() {
    this.slots.get('arrowCw')!.visible = !this.arrowState.cw;
    this.slots.get('arrowCwPressed')!.visible = this.arrowState.cw;
    this.slots.get('arrowCcw')!.visible = !this.arrowState.ccw;
    this.slots.get('arrowCcwPressed')!.visible = this.arrowState.ccw;
  }

  // ---------------------------------------------------------------- hit testing (logical coords)

  hitArrow(px: number, py: number): Dir | null {
    const lx = px - this.x;
    const ly = py - this.y - ARROW.offsetY;
    const h = ARROW.hit / 2;
    if (Math.abs(ly) > h) return null;
    if (Math.abs(lx - ARROW.offsetX) <= h) return 'cw';
    if (Math.abs(lx + ARROW.offsetX) <= h) return 'ccw';
    return null;
  }

  hitDisc(px: number, py: number): boolean {
    return Math.hypot(px - this.x, py - this.y) <= WHEEL.dragRadius;
  }

  // ---------------------------------------------------------------- operator overlay

  showOverlay(text: string | null): void {
    if (this.overlay) {
      this.overlay.destroy({ children: true });
      this.overlay = null;
    }
    if (text === null) return;
    const c = new Container({ label: 'overlay' });
    const t = new Text({
      text,
      style: { fontFamily: 'system-ui, sans-serif', fontWeight: '700', fontSize: 28, fill: 0xffffff },
      resolution: 2,
    });
    t.anchor.set(0.5);
    const pad = new Graphics().roundRect(-t.width / 2 - 10, -22, t.width + 20, 44, 10).fill({ color: 0xc00000, alpha: 0.9 });
    c.addChild(pad, t);
    c.position.set(0, WHEEL.socketRadius + 2);
    this.root.addChild(c);
    this.overlay = c;
  }

  // ---------------------------------------------------------------- unlock visuals

  /** k ∈ [0, 1]: wheel sinks into the plate (scale down, darken), arrows fade out. */
  setSink(k: number): void {
    this.body.scale.set(1 - 0.1 * k);
    const v = Math.round(255 * (1 - 0.32 * k));
    this.body.tint = (v << 16) | (v << 8) | v;
    this.arrows.alpha = 1 - k;
  }

  /** k ∈ [0, 1]: collar contracts from 1.4× onto the wheel and becomes opaque. */
  setLock(k: number): void {
    this.lockRing.visible = k > 0;
    this.lockRing.scale.set(1.4 - 0.4 * k);
    this.lockRing.alpha = Math.min(1, k * 1.6);
  }

  /** Back to the normal look (done off-screen during Reset). */
  resetUnlockVisuals(): void {
    this.setSink(0);
    this.setLock(0);
  }

  // ---------------------------------------------------------------- frame

  update(now: number, dt: number): void {
    if (this.factory.revision !== this.factoryRevision) this.rebuildLayers();
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.start) / a.dur);
      this.angle = a.from + (a.to - a.from) * a.ease(t);
      if (a.reason === 'spin') {
        const d = nearestDetent(this.angle);
        if (d !== this.lastDetent) {
          this.lastDetent = d;
          this.hooks.onSlotPass(this, 'spin');
        }
      }
      if (t >= 1) this.finishAnim(now);
    }
    this.discRot.rotation = this.angle;
    this.eye.update(now, dt);
    this.applyPose();
  }

  private applyPose() {
    const p = this.eye.pose;
    this.irisGroup.position.set(p.iris.x, p.iris.y);
    this.pupilGroup.position.set(p.pupil.x, p.pupil.y);
    this.pupilGroup.scale.set(p.pupilScale);
    this.slots.get('lidTop')!.y = lidTopY(p.lidTop);
    this.slots.get('lidBottom')!.y = lidBottomY(p.lidBottom);
    const glow = this.slots.get('glow')!;
    glow.alpha = p.glow;
    glow.scale.set(0.85 + 0.35 * p.glow);
    glow.position.set(p.pupil.x, p.pupil.y);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
