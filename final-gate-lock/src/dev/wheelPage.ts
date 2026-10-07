/** Dev page: one large procedural wheel with arrows and drag, for tuning the look and the feel. */
import '@fontsource/cinzel/latin-700.css';
import '../styles.css';
import { Container, Graphics } from 'pixi.js';
import { Stage } from '../app/Stage';
import { parseFlags } from '../flags';
import { InputRouter } from '../input/InputRouter';
import { LOGICAL } from '../layout';
import { LayerFactory } from '../render/layers';
import { Clock } from '../util/clock';
import { FrameStats } from '../util/fpsMeter';
import { mulberry32 } from '../util/random';
import { BlinkCoordinator } from '../wheel/BlinkCoordinator';
import { Eye } from '../wheel/Eye';
import { Wheel } from '../wheel/Wheel';
import { routeWheelPress } from '../wheel/WheelInput';

const SCALE = 3;
const CX = LOGICAL.width / 2;
const CY = LOGICAL.height / 2 + 40;

async function main() {
  const flags = parseFlags(location.search);
  await document.fonts.load('700 30px Cinzel');
  const stage = await Stage.create(document.getElementById('stage')!);
  const clock = new Clock();
  clock.speed = flags.speed;
  const stats = new FrameStats();
  stats.setVisible(true);

  const bg = new Graphics().rect(0, 0, LOGICAL.width, LOGICAL.height).fill(0x2b1b12);
  const holder = new Container();
  holder.position.set(CX, CY);
  holder.scale.set(SCALE);
  stage.root.addChild(bg, holder);

  const factory = new LayerFactory(flags.visualMode ?? 'procedural', await LayerFactory.loadManifest('assets/manifest.json'));
  if (factory.mode === 'sprites') await factory.loadSprites();
  const gate = new BlinkCoordinator();
  const log: string[] = [];
  const eye = new Eye({
    rng: mulberry32(1),
    timings: { blinkIntervalMs: [4000, 9000], glanceIntervalMs: [6000, 14000], settledToDrowsyMs: 2000 },
    gate,
    maxShift: 5,
    depth: 1.3,
  });
  const values = [52, 6, 14];
  // Local wheel at (0, 0) inside the scaled holder.
  const wheel = new Wheel(1, 0, 0, values, 0, eye, factory, {
    onSettle: (_w, slot, reason) => log.push(`settle:${slot}:${reason}`),
    onSlotPass: (_w, reason) => log.push(`tick:${reason}`),
  });
  holder.addChild(wheel.root);
  eye.setMode('live', 0);

  // Map logical → wheel-local (the holder is scaled 3×).
  const toLocal = (cx: number, cy: number) => {
    const l = stage.toLogical(cx, cy);
    return { x: (l.x - CX) / SCALE, y: (l.y - CY) / SCALE };
  };
  const hooks = {
    now: () => clock.now,
    speed: () => clock.speed,
    onArrow: () => log.push('arrow'),
    onTouchStart: (w: Wheel, p: { x: number; y: number }) => w.eye.setTouch({ x: p.x - w.x, y: p.y - w.y }, clock.now),
    onTouchMove: (w: Wheel, p: { x: number; y: number }) => w.eye.setTouch({ x: p.x - w.x, y: p.y - w.y }, clock.now),
    onTouchEnd: (w: Wheel) => w.eye.setTouch(null, clock.now),
  };
  new InputRouter(stage.app.canvas, toLocal, (p) => routeWheelPress([wheel], p, hooks));

  stage.app.ticker.add((t) => {
    clock.tick(t.deltaMS);
    stats.push(t.deltaMS, performance.now());
    wheel.update(clock.now, clock.dt);
  });

  Object.assign(window, {
    __fgl: {
      stage,
      wheel,
      log,
      stats,
      clock,
      /** Wheel-local → client coordinates for tests. */
      toClient: (x: number, y: number) => ({
        x: (CX + x * SCALE) * stage.scale + stage.offsetX,
        y: (CY + y * SCALE) * stage.scale + stage.offsetY,
      }),
    },
    __fglBoot: 'ok',
  });
}

void main();
