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
import { Cancelled, Seq, Tweens, ease } from '../util/tween';
import { Glimmers, createLightPass } from '../scene/Background';
import { Mist } from '../scene/Mist';
import { runIntro } from '../scene/IntroSequence';
import { runSuccess } from '../scene/SuccessSequence';
import { runReset } from '../scene/ResetSequence';
import { UnlockFx } from '../scene/Core';
import { PlateSplit } from '../scene/PlateSplit';
import { angleForSlot } from '../wheel/snap';
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
  /** Near-black veil over the plate: 1 = hidden (Shrouded), 0 = revealed. */
  veil: Graphics;
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
  readonly mist: Mist;
  readonly unlock: UnlockFx;
  readonly split = new PlateSplit();
  readonly glimmers: Glimmers;
  /** The sequence currently running (intro / success / reset), cancelled on state changes. */
  private seq: Seq | null = null;
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
    plate.addChild(plateLeft, plateRight, wheels, createLightPass());
    const fx = mk('fx');
    this.glimmers = new Glimmers(this.placements);
    this.unlock = new UnlockFx(factory);
    fx.addChild(this.glimmers.root, this.unlock.front);
    const veil = new Graphics().rect(-200, -200, LOGICAL.width + 400, LOGICAL.height + 400).fill(0x030203);
    veil.label = 'veil';
    const dim = new Graphics().rect(-200, -200, LOGICAL.width + 400, LOGICAL.height + 400).fill(0x000000);
    dim.alpha = 0;
    this.layers = { wall: mk('wall'), core: mk('core'), plate, plateLeft, plateRight, wheels, veil, fx, mist: mk('mist'), dim, ui: mk('ui'), debug: mk('debug') };
    const L = this.layers;
    root.addChild(L.wall, L.core, L.plate, this.split.root, L.veil, L.fx, L.mist, L.dim, L.ui, L.debug);
    L.core.addChild(this.unlock.core);
    const wallSlot = mk('slot:wall');
    wallSlot.position.set(LOGICAL.width / 2, LOGICAL.height / 2);
    wallSlot.addChild(factory.create('wall'));
    L.wall.addChild(wallSlot);
    this.mist = new Mist();
    L.mist.addChild(this.mist.root);

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
        if (this.stateLog.length > 300) this.stateLog.splice(0, this.stateLog.length - 300);
        this.enter(e.to, e.from);
      } else if (e.type === 'asleep') this.fallAsleep();
      else if (e.type === 'wake') this.wakeUp();
    });

    if (flags.debug) this.drawDebug();
    stage.app.ticker.add((tk) => this.frame(tk.deltaMS));
    this.enter('Shrouded', 'Shrouded');
    if (flags.skipIntro) {
      this.prepareStartPositions();
      this.machine.skipToPlayable();
      this.mist.setDensityNow(0);
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
    this.sfx.play('detent_click', reason === 'spin' ? { volume: 0.8 } : undefined);
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
    this.seq?.cancel();
    this.seq = null;
    switch (state) {
      case 'Shrouded':
        this.enterShrouded();
        break;
      case 'Intro':
        this.runSeq((seq) => runIntro(this, seq, this.introOrigin), () => this.machine.introDone());
        break;
      case 'Playable':
        for (const w of this.wheels) w.eye.setMode('live', now);
        this.layers.veil.alpha = 0;
        this.glimmers.level = 0;
        this.mist.setDensity(0, 1500);
        break;
      case 'Success':
        this.runSeq((seq) => runSuccess(this, seq), () => this.machine.successDone());
        break;
      case 'Open':
        this.sfx.loop('core_hum', true, 1200);
        this.unlock.dustRate = 6;
        this.unlock.level = 1;
        break;
      case 'Reset':
        this.runSeq((seq) => runReset(this, seq), () => this.machine.resetDone());
        break;
    }
  }

  /** Snapshot the plate and start the split (success step 4). */
  beginSplit(): void {
    const res = this.stage.app.renderer.resolution * this.stage.scale;
    this.split.begin(this.stage.app.renderer, this.layers.plate, Math.min(Math.max(res, 1), 2));
  }

  /** Off-screen restore after the reset mist has covered everything. */
  restoreAfterUnlock(): void {
    this.split.end(this.layers.plate);
    this.layers.plate.position.set(0, 0);
    this.unlock.clear();
    for (const w of this.wheels) w.resetUnlockVisuals();
    this.sfx.duck(false, 600);
  }

  /** Shrouded: mist only, faint glimmers; wheels sit (unseen) on their start slots. */
  private enterShrouded() {
    const now = this.clock.now;
    for (const w of this.wheels) w.eye.setMode('shut', now);
    this.layers.veil.alpha = 1;
    this.layers.dim.alpha = 0;
    this.tweens.kill('glim');
    const g0 = this.glimmers.level;
    void this.tweens.to({ duration: 1500, ease: ease.inOutSine, tag: 'glim', onUpdate: (k) => (this.glimmers.level = g0 + (1 - g0) * k) });
    this.mist.setDensity(1, 1200);
    this.prepareStartPositions();
    // random visual offset per disc so the intro spin looks like a mechanism finding rest
    for (const w of this.wheels) w.setAngleImmediate(angleForSlot(this.model.get(w.id)) + Math.random() * Math.PI * 2);
  }

  /** Run a cancellable sequence; `done` runs only if it completed. */
  protected runSeq(body: (seq: Seq) => Promise<void>, done: () => void): void {
    const seq = new Seq(this.clock, this.tweens);
    this.seq = seq;
    body(seq).then(
      () => {
        if (!seq.cancelled && this.seq === seq) {
          this.seq = null;
          done();
        }
      },
      (e) => {
        if (!(e instanceof Cancelled)) console.error(e);
      },
    );
  }

  // ------------------------------------------------------------------ asleep

  /** No touch for asleepAfterIdleMs: lids close in a ripple across the plate, screen dims to 60%. */
  private fallAsleep() {
    const now = this.clock.now;
    for (const w of this.wheels) {
      // ripple left → right with a little vertical skew
      const delay = ((w.x - 150) / 980) * 900 + ((w.y - 215) / 410) * 150;
      w.eye.setMode('asleep', now, Math.max(0, delay));
    }
    this.tweens.kill('dim');
    const from = this.layers.dim.alpha;
    void this.tweens.to({ duration: 1800, delay: 300, ease: ease.inOutCubic, tag: 'dim', onUpdate: (k) => (this.layers.dim.alpha = from + (0.6 - from) * k) });
  }

  private wakeUp() {
    const now = this.clock.now;
    if (this.machine.state === 'Playable') for (const w of this.wheels) w.eye.setMode('live', now);
    this.tweens.kill('dim');
    const from = this.layers.dim.alpha;
    void this.tweens.to({ duration: 350, ease: ease.outCubic, tag: 'dim', onUpdate: (k) => (this.layers.dim.alpha = from * (1 - k)) });
  }

  // ------------------------------------------------------------------ frame

  private frame(realDt: number) {
    const dt = this.clock.tick(realDt);
    this.stats.push(realDt, performance.now());
    this.tweens.update();
    this.mist.update(dt);
    this.unlock.update(dt);
    this.glimmers.update(dt);
    this.updateCurious();
    const now = this.clock.now;
    for (const w of this.wheels) w.update(now, dt);
    this.monitorBlinks();
  }

  /** Diagnostics for the "no two wheels blink in the same frame" requirement. */
  readonly blinkStats = { frames: 0, blinkFrames: 0, collisions: 0, maxSimultaneous: 0, starts: 0, multiStartFrames: 0 };
  private lastGrants = 0;
  private monitorBlinks() {
    if (this.machine.state !== 'Playable') {
      this.lastGrants = this.gate.grants;
      return;
    }
    const b = this.blinkStats;
    b.frames++;
    let n = 0;
    for (const w of this.wheels) if (w.eye.blinking) n++;
    if (n > 0) b.blinkFrames++;
    if (n > 1) b.collisions++;
    b.maxSimultaneous = Math.max(b.maxSimultaneous, n);
    const started = this.gate.grants - this.lastGrants;
    this.lastGrants = this.gate.grants;
    b.starts += started;
    if (started > 1) b.multiStartFrames++;
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
