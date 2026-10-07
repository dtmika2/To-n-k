/**
 * Game: wires the pure model + state machine to the scene, the wheels, input and sound.
 * The lock model owns the truth; wheels write to it only when they settle.
 */
import { Container, Graphics } from 'pixi.js';
import type { AppConfig } from '../config';
import type { Flags } from '../flags';
import { InputRouter, type PointerHandler, type PointerInfo } from '../input/InputRouter';
import { ARROW, CURIOUS_RADIUS, LOGICAL, OPERATOR_ZONE, PLATE, WHEEL, placeWheels, type WheelPlacement } from '../layout';
import { LayerFactory, registerProcedural } from '../render/layers';
import { buildPlateHalves } from '../render/procedural/plate';
import { LockModel } from '../state/lockModel';
import { Machine, type GameState } from '../state/machine';
import { silentSfx, type Sfx } from '../audio/sfx';
import { Clock } from '../util/clock';
import { FrameStats } from '../util/fpsMeter';
import { mulberry32 } from '../util/random';
import { Tweens, ease } from '../util/tween';
import { WakeLock } from '../util/wakeLock';
import { BlinkCoordinator } from '../wheel/BlinkCoordinator';
import { Eye } from '../wheel/Eye';
import { Wheel, type SettleReason } from '../wheel/Wheel';
import { routeWheelPress, type WheelInputHooks } from '../wheel/WheelInput';
import { Stage } from './Stage';

export interface GameLayers {
  wall: Container;
  core: Container;
  plate: Container;
  plateLeft: Container;
  plateRight: Container;
  wheels: Container;
  fx: Container;
  mist: Container;
  dim: Graphics;
  ui: Container;
  debug: Container;
}

export class Game {
  readonly clock = new Clock();
  readonly tweens: Tweens;
  readonly machine: Machine;
  readonly model: LockModel;
  readonly gate = new BlinkCoordinator();
  readonly wheels: Wheel[] = [];
  readonly placements: WheelPlacement[];
  readonly stats = new FrameStats();
  readonly wake = new WakeLock();
  readonly layers: GameLayers;
  readonly router: InputRouter;
  sfx: Sfx = silentSfx;
  /** Current touch position per touched wheel (logical), for Curious neighbours. */
  private touches = new Map<Wheel, { x: number; y: number }>();
  private flash: Graphics;
  /** Log of state changes with game time, for tests. */
  readonly stateLog: { state: GameState; t: number }[] = [];

  constructor(
    readonly stage: Stage,
    readonly config: AppConfig,
    readonly flags: Flags,
    readonly factory: LayerFactory,
  ) {
    this.clock.speed = flags.speed;
    this.tweens = new Tweens(this.clock);
    this.machine = new Machine(
      { resetAfterSuccessMs: config.timings.resetAfterSuccessMs, asleepAfterIdleMs: config.timings.asleepAfterIdleMs },
      this.clock,
    );
    this.model = new LockModel(config.wheels);
    this.placements = placeWheels(config.wheels);
    this.stats.setVisible(flags.debug);

    // ---- scene graph
    const root = stage.root;
    const mk = (label: string) => new Container({ label });
    const plateLeft = mk('plateLeft');
    const plateRight = mk('plateRight');
    const wheels = mk('wheels');
    const plate = mk('plate');
    plate.addChild(plateLeft, plateRight, wheels);
    this.flash = new Graphics().rect(0, 0, LOGICAL.width, LOGICAL.height).fill(0xffffff);
    this.flash.alpha = 0;
    this.flash.blendMode = 'add';
    const fx = mk('fx');
    fx.addChild(this.flash);
    const dim = new Graphics().rect(-200, -200, LOGICAL.width + 400, LOGICAL.height + 400).fill(0x000000);
    dim.alpha = 0;
    this.layers = { wall: mk('wall'), core: mk('core'), plate, plateLeft, plateRight, wheels, fx, mist: mk('mist'), dim, ui: mk('ui'), debug: mk('debug') };
    const L = this.layers;
    root.addChild(L.wall, L.core, L.plate, L.fx, L.mist, L.dim, L.ui, L.debug);

    // plate halves: procedural drawing positioned in absolute logical coords
    const halves = () => buildPlateHalves(this.placements);
    registerProcedural('plateLeft', () => halves().left);
    registerProcedural('plateRight', () => halves().right);
    plateLeft.addChild(factory.create('plateLeft'));
    plateRight.addChild(factory.create('plateRight'));

    // ---- wheels
    const t = config.timings;
    config.wheels.forEach((wc, i) => {
      const p = this.placements[i];
      const eye = new Eye({
        rng: mulberry32((Math.random() * 2 ** 32) >>> 0),
        timings: { blinkIntervalMs: t.blinkIntervalMs, glanceIntervalMs: t.glanceIntervalMs, settledToDrowsyMs: t.settledToDrowsyMs },
        gate: this.gate,
        maxShift: WHEEL.irisMaxShift,
        depth: WHEEL.pupilDepth,
        onBlink: () => this.onBlink(),
      });
      const w = new Wheel(wc.id, p.x, p.y, wc.slots, this.model.get(wc.id), eye, factory, {
        onSettle: (wh, slot, reason) => this.onSettle(wh, slot, reason),
        onSlotPass: (wh, reason) => this.onSlotPass(wh, reason),
      });
      this.wheels.push(w);
      wheels.addChild(w.root);
    });

    // ---- input
    this.router = new InputRouter(stage.app.canvas, (x, y) => stage.toLogical(x, y), (p) => this.onDown(p));

    // ---- state machine
    this.machine.on((e) => {
      if (e.type === 'state') {
        this.stateLog.push({ state: e.to, t: this.clock.now });
        this.enter(e.to, e.from);
      }
    });

    if (flags.debug) this.drawDebug();
    stage.app.ticker.add((tk) => this.frame(tk.deltaMS));
    this.enter('Shrouded', 'Shrouded');
    if (flags.skipIntro) {
      this.prepareStartPositions();
      this.machine.skipToPlayable();
    }
  }

  get state(): GameState {
    return this.machine.state;
  }

  // ------------------------------------------------------------------ input

  private wheelHooks: WheelInputHooks = {
    now: () => this.clock.now,
    speed: () => this.clock.speed,
    onArrow: () => this.sfx.play('arrow_tap'),
    onTouchStart: (w, p) => {
      this.touches.set(w, { x: p.x, y: p.y });
      w.eye.setTouch({ x: p.x - w.x, y: p.y - w.y }, this.clock.now);
    },
    onTouchMove: (w, p) => {
      if (!this.touches.has(w)) return;
      this.touches.set(w, { x: p.x, y: p.y });
      w.eye.setTouch({ x: p.x - w.x, y: p.y - w.y }, this.clock.now);
    },
    onTouchEnd: (w) => {
      this.touches.delete(w);
      w.eye.setTouch(null, this.clock.now);
    },
  };

  private inOperatorZone(p: PointerInfo): boolean {
    const z = OPERATOR_ZONE;
    return p.x >= z.x && p.x < z.x + z.width && p.y >= z.y && p.y < z.y + z.height;
  }

  /** Hook for the operator gesture (M8); returns a handler when it claims the pointer. */
  operatorPress: ((p: PointerInfo) => PointerHandler | null) | null = null;

  private onDown(p: PointerInfo): PointerHandler | null {
    if (this.inOperatorZone(p)) return this.operatorPress?.(p) ?? null;
    switch (this.machine.state) {
      case 'Shrouded':
        this.firstTap(p);
        return null;
      case 'Playable':
        this.machine.activity();
        return routeWheelPress(this.wheels, p, this.wheelHooks);
      default:
        return null; // input blocked during sequences
    }
  }

  /** Shrouded → Intro. Overridden by the intro sequence (M5). */
  protected firstTap(p: PointerInfo): void {
    this.sfx.unlock();
    void this.wake.request();
    this.introOrigin = { x: p.x, y: p.y };
    this.machine.tap();
  }
  introOrigin = { x: LOGICAL.width / 2, y: LOGICAL.height / 2 };

  // ------------------------------------------------------------------ wheel events

  private onSettle(w: Wheel, slot: number, reason: SettleReason) {
    if (reason !== 'spin') this.sfx.play('detent_click');
    if (this.machine.state !== 'Playable') return;
    this.model.setSlot(w.id, slot);
    // Win check only when a wheel settles, and only when every wheel is at rest.
    if (this.model.isSolved() && this.wheels.every((x) => x.atRest)) this.machine.solved();
  }

  private onSlotPass(_w: Wheel, reason: 'drag' | 'spin') {
    if (reason === 'drag') this.sfx.play('drag_tick');
    else this.sfx.play('drag_tick', { volume: 0.35 });
  }

  private lastBlinkSound = -Infinity;
  private onBlink() {
    // low volume, max one per 2 s globally
    if (this.clock.now - this.lastBlinkSound < 2000) return;
    this.lastBlinkSound = this.clock.now;
    this.sfx.play('eye_blink', { volume: 0.35 });
  }

  // ------------------------------------------------------------------ states

  /** Positions every wheel will show at the start of a round (config start, or `?solve`). */
  prepareStartPositions(): void {
    this.model.reset();
    if (this.flags.solve) this.model.setOneMoveFromSolved();
    for (const w of this.wheels) w.setSlotImmediate(this.model.get(w.id));
  }

  protected enter(state: GameState, _from: GameState): void {
    const now = this.clock.now;
    if (state !== 'Playable') {
      this.router.cancelAll();
      this.touches.clear();
    }
    switch (state) {
      case 'Shrouded':
        for (const w of this.wheels) w.eye.setMode('shut', now);
        break;
      case 'Intro':
        // M3 placeholder: no sequence yet
        this.prepareStartPositions();
        this.machine.introDone();
        break;
      case 'Playable':
        for (const w of this.wheels) w.eye.setMode('live', now);
        break;
      case 'Success':
        void this.placeholderSuccess();
        break;
      case 'Open':
        break;
      case 'Reset':
        this.prepareStartPositions();
        this.machine.resetDone();
        break;
    }
  }

  private async placeholderSuccess() {
    await this.tweens.to({ duration: 120, ease: ease.outQuad, onUpdate: (k) => (this.flash.alpha = 0.7 * k) });
    await this.tweens.to({ duration: 700, ease: ease.inQuad, onUpdate: (k) => (this.flash.alpha = 0.7 * (1 - k)) });
    if (this.machine.state === 'Success') this.machine.successDone();
  }

  // ------------------------------------------------------------------ frame

  private frame(realDt: number) {
    const dt = this.clock.tick(realDt);
    this.stats.push(realDt, performance.now());
    this.tweens.update();
    this.updateCurious();
    const now = this.clock.now;
    for (const w of this.wheels) w.update(now, dt);
  }

  /** Untouched eyes near a touched wheel open a bit and look toward it. */
  private updateCurious() {
    for (const w of this.wheels) {
      if (this.touches.has(w) || this.touches.size === 0) {
        w.eye.setCurious(null);
        continue;
      }
      let best: { x: number; y: number } | null = null;
      let bestD = CURIOUS_RADIUS;
      for (const [tw, p] of this.touches) {
        const d = Math.hypot(tw.x - w.x, tw.y - w.y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      w.eye.setCurious(best ? { x: best.x - w.x, y: best.y - w.y } : null);
    }
  }

  private drawDebug() {
    const g = new Graphics();
    for (const w of this.wheels) {
      g.circle(w.x, w.y, WHEEL.dragRadius).stroke({ width: 1, color: 0x00ff88, alpha: 0.8 });
      for (const sx of [-1, 1]) {
        g.rect(w.x + sx * ARROW.offsetX - ARROW.hit / 2, w.y + ARROW.offsetY - ARROW.hit / 2, ARROW.hit, ARROW.hit).stroke({
          width: 1,
          color: 0xff00ff,
          alpha: 0.8,
        });
      }
    }
    const z = OPERATOR_ZONE;
    g.rect(z.x, z.y, z.width, z.height).stroke({ width: 2, color: 0xff4040, alpha: 0.9 });
    g.rect(PLATE.seamX - 0.5, 0, 1, LOGICAL.height).fill({ color: 0xffff00, alpha: 0.3 });
    this.layers.debug.addChild(g);
  }

  /** Test/diagnostic snapshot. */
  snapshot() {
    return {
      state: this.machine.state,
      asleep: this.machine.asleep,
      slots: this.model.snapshot(),
      solved: this.model.isSolved(),
      atRest: this.wheels.every((w) => w.atRest),
      loops: this.machine.loops,
    };
  }
}
