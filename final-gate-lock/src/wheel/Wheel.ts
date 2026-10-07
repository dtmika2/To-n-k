/**
 * One wheel = one eye. Owns its layers (built through the LayerFactory), the iris rotation
 * animator and the eye controller. Input arrives from WheelInput; truth is written to the lock
 * model by the owner via the onSettle hook.
 *
 * Layer stack (bottom → top): ring, disc (+numerals), iris, irisShade, pupil + highlight,
 * lids (masked), glow. The numbered disc is fixed; only the iris plate with the window rotates
 * (and also shifts a few px with the eye). Arrows sit above the wheel.
 */
import { Container, Graphics, Text } from 'pixi.js';
import type { Dir } from '../state/lockModel';
import { ARROW, WHEEL } from '../layout';
import type { LayerFactory, LayerId } from '../render/layers';
import { lidBottomY, lidTopY } from '../render/procedural/wheel';
import { C } from '../render/palette';
import { ease, type Ease } from '../util/tween';
import { FEEL } from '../feel';
import { HeavySpring, notch, recoil, releaseCurve } from './heavy';
import { Eye } from './Eye';
import { STEP, angleForSlot, nearestDetent, normalizeAngle, slotOfAngle, snapTarget } from './snap';

export type SettleReason = 'arrow' | 'drag' | 'spin';

export interface WheelHooks {
  onSettle(w: Wheel, slot: number, reason: SettleReason): void;
  onSlotPass(w: Wheel, reason: 'drag' | 'spin'): void;
}

interface Anim {
  to: number;
  start: number;
  dur: number;
  /** Angle at u ∈ [0, 1] of the move. */
  curve: (u: number) => number;
  reason: SettleReason;
  resolve?: () => void;
}

const eased = (from: number, to: number, e: Ease) => (u: number) => from + (to - from) * e(u);

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
  /** Fixed numbered disc. */
  readonly disc = new Container({ label: 'disc' });
  private readonly numerals = new Container({ label: 'numerals' });
  /** Eye-tracking offset of the iris (translation only). */
  private readonly irisGroup = new Container();
  /** The rotating plate with the window. */
  readonly irisRot = new Container({ label: 'irisRot' });
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
  /** Drag physics: the plate's mass follows the notched finger target. */
  private spring: HeavySpring | null = null;
  private dragStart = 0;
  private dragOffset = 0;
  private dragTarget = 0;
  /** Visual-only impact effects (never change the logical angle). */
  private recoilAt = -Infinity;
  private recoilDir = 0;
  private thudAt = -Infinity;
  private sinkK = 0;
  private arrowPress = { cw: 0, ccw: 0 };
  private now = 0;
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
    this.body.addChild(this.disc);
    slot('disc', this.disc);
    this.disc.addChild(this.numerals);
    this.body.addChild(this.irisGroup);
    this.irisGroup.addChild(this.irisRot);
    slot('iris', this.irisRot);
    slot('irisShade', this.body); // fixed top-left light over the turning plate
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
      // slot i sits at the window position for iris angle i·STEP; the disc never turns,
      // so every numeral is always upright
      const a = WINDOW_CENTER + i * STEP;
      holder.position.set(Math.cos(a) * WHEEL.numeralRadius, Math.sin(a) * WHEEL.numeralRadius);
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
    this.startAnim(target, FEEL.wheel.stepMs, eased(this.angle, target, ease.heavyDetent), 'arrow', now);
    return true;
  }

  beginDrag(pointerId: number): boolean {
    if (this.owner !== null) return false;
    this.owner = pointerId;
    this.anim = null; // take over from wherever the plate is
    this.queued = null;
    this.recoilAt = -Infinity;
    this.lastDetent = nearestDetent(this.angle);
    this.spring = new HeavySpring(this.angle, 0, FEEL.wheel.dragOmega);
    this.dragStart = this.angle;
    // keep the plate where it is even if the drag starts between notches
    this.dragOffset = this.angle - notch(this.angle, FEEL.wheel.notch);
    this.dragTarget = this.angle;
    return true;
  }

  /** Finger moved: `delta` is the total (unwrapped) change of finger angle since the press. */
  setDragDelta(delta: number): void {
    if (!this.spring) return;
    this.dragTarget = notch(this.dragStart + delta, FEEL.wheel.notch) + this.dragOffset;
  }

  /**
   * Release: the slot is chosen from where the finger left the plate (a fast flick of the finger may
   * add one slot); the plate then carries its own momentum there and lands with a hard stop.
   */
  endDrag(fingerVelocity: number, now: number): void {
    if (this.owner === null) return;
    this.owner = null;
    const vPerMs = (this.spring?.v ?? 0) / 1000;
    this.spring = null;
    const target = snapTarget(this.dragTarget, fingerVelocity);
    const dist = Math.abs(target - this.angle) / STEP;
    const W = FEEL.wheel;
    const dur = Math.min(W.snapMaxMs, W.snapMinMs + W.snapPerSlotMs * dist);
    this.startAnim(target, dur, releaseCurve(this.angle, vPerMs, target, dur, W.arrivalSpeed), 'drag', now);
  }

  /** Abort a drag without input (state change): drop straight into the nearest slot. */
  cancelDrag(now: number): void {
    if (this.owner === null) return;
    this.owner = null;
    this.spring = null;
    const target = nearestDetent(this.angle) * STEP;
    this.startAnim(target, FEEL.wheel.cancelMs, eased(this.angle, target, ease.heavyDetent), 'drag', now);
  }

  /** Intro spin: a few heavy turns clockwise, winding down onto `slot` with a hard stop. */
  spinTo(slot: number, durationMs: number, turns: number, now: number): Promise<void> {
    this.queued = null;
    const minTarget = this.angle + turns * 2 * Math.PI;
    let target = angleForSlot(slot, minTarget);
    if (target < minTarget) target += 2 * Math.PI;
    return new Promise((resolve) => {
      this.startAnim(target, durationMs, eased(this.angle, target, ease.heavySpin), 'spin', now, resolve);
    });
  }

  /** Jump without animation (reset off-screen, operator presets). */
  setSlotImmediate(slot: number): void {
    this.anim = null;
    this.queued = null;
    this.owner = null;
    this.spring = null;
    this.recoilAt = -Infinity;
    this.angle = angleForSlot(slot);
    this.restSlot = slot;
    this.lastDetent = nearestDetent(this.angle);
    this.irisRot.rotation = this.angle;
  }

  /** Visual-only offset (before the intro spin). */
  setAngleImmediate(angle: number): void {
    this.anim = null;
    this.recoilAt = -Infinity;
    this.angle = angle;
    this.lastDetent = nearestDetent(angle);
    this.irisRot.rotation = angle;
  }

  private startAnim(to: number, dur: number, curve: (u: number) => number, reason: SettleReason, now: number, resolve?: () => void) {
    this.anim?.resolve?.();
    this.recoilAt = -Infinity;
    this.anim = { to, start: now, dur, curve, reason, resolve };
  }

  /** The plate hits the detent: settle the logic now; recoil and thud are visual afterglow. */
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
    const travel = a.to - a.curve(0.9);
    this.recoilDir = travel === 0 ? 0 : -Math.sign(travel);
    this.recoilAt = now;
    this.thudAt = now;
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
    this.sinkK = k;
    this.applyBody();
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
    this.now = now;
    if (this.factory.revision !== this.factoryRevision) this.rebuildLayers();
    if (this.spring) {
      // dragging: the plate's mass follows the notched finger target
      this.spring.step(this.dragTarget, dt / 1000);
      this.angle = this.spring.x;
      this.checkDetent('drag');
    } else if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.start) / a.dur);
      this.angle = t >= 1 ? a.to : a.curve(t);
      if (a.reason === 'spin') this.checkDetent('spin');
      if (t >= 1) this.finishAnim(now);
    }
    this.irisRot.rotation = this.angle + this.recoilOffset(now);
    this.applyBody();
    this.applyArrows(dt);
    this.eye.update(now, dt);
    this.applyPose();
  }

  private checkDetent(reason: 'drag' | 'spin') {
    const d = nearestDetent(this.angle);
    if (d !== this.lastDetent) {
      this.lastDetent = d;
      this.hooks.onSlotPass(this, reason);
    }
  }

  /** After the hard stop the plate bounces back a hair and settles (visual only). */
  private recoilOffset(now: number): number {
    const v = (now - this.recoilAt) / FEEL.wheel.recoilMs;
    if (v < 0 || v >= 1) return 0;
    return this.recoilDir * FEEL.wheel.recoilRad * recoil(v);
  }

  /** Sink (unlock) and settle thud: dip into the socket with a short jolt. */
  private applyBody() {
    const W = FEEL.wheel;
    const k = (this.now - this.thudAt) / W.thudMs;
    let dip = 0;
    let jolt = 0;
    if (k >= 0 && k < 1) {
      dip = W.thudScale * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k);
      jolt = W.thudJoltPx * Math.sin(k * Math.PI * 5) * (1 - k) * (1 - k);
    }
    this.body.scale.set((1 - 0.1 * this.sinkK) * (1 - dip));
    this.body.position.set(0, jolt);
  }

  /** Arrow buttons travel down when pressed and come back up slowly. */
  private applyArrows(dt: number) {
    const A = FEEL.arrow;
    for (const dir of ['cw', 'ccw'] as const) {
      const pressed = this.arrowState[dir];
      const cur = this.arrowPress[dir];
      // press is near-instant; release eases back over releaseMs
      const next = pressed ? 1 : Math.max(0, cur - dt / A.releaseMs);
      this.arrowPress[dir] = next;
      const g = this.arrows.children[dir === 'ccw' ? 0 : 1];
      if (!g) continue;
      g.y = ARROW.offsetY + A.pressTravelPx * next;
      g.scale.set(1 - (1 - A.pressScale) * next);
    }
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
