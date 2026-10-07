import { Graphics } from 'pixi.js';
import type { AppConfig } from '../config';
import type { Flags } from '../flags';
import { LOGICAL, PLATE } from '../layout';
import { Clock } from '../util/clock';
import { FrameStats } from '../util/fpsMeter';
import { Stage } from './Stage';

/** M0 shell: stage, letterbox, placeholder plate, frame stats and test hooks. */
export async function startApp(config: AppConfig, flags: Flags): Promise<void> {
  const stage = await Stage.create(document.getElementById('stage')!);
  const clock = new Clock();
  clock.speed = flags.speed;
  const stats = new FrameStats();
  stats.setVisible(flags.debug);

  const wall = new Graphics().rect(0, 0, LOGICAL.width, LOGICAL.height).fill(0x0c0b0d);
  const plate = new Graphics()
    .roundRect(PLATE.x, PLATE.y, PLATE.width, PLATE.height, PLATE.radius)
    .fill(0xb8913a)
    .roundRect(PLATE.x + PLATE.border, PLATE.y + PLATE.border, PLATE.width - PLATE.border * 2, PLATE.height - PLATE.border * 2, PLATE.radius - 10)
    .fill(0x2b1b12);
  stage.root.addChild(wall, plate);

  stage.app.ticker.add((t) => {
    clock.tick(t.deltaMS);
    stats.push(t.deltaMS, performance.now());
  });

  Object.assign(window, { __fgl: { config, flags, stats, clock, stage } });
}
