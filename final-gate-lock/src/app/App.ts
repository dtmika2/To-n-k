import type { AppConfig } from '../config';
import type { Flags } from '../flags';
import { ARROW } from '../layout';
import { LayerFactory } from '../render/layers';
import { Game } from './Game';
import { Stage } from './Stage';

/** Boot the real app: stage, layer factory, game, and test hooks on `window.__fgl`. */
export async function startApp(config: AppConfig, flags: Flags): Promise<Game> {
  // Numerals are drawn as text: make sure the bundled face is ready before building wheels.
  try {
    await document.fonts.load('700 30px Cinzel');
  } catch {
    /* falls back to Georgia/serif */
  }
  const stage = await Stage.create(document.getElementById('stage')!);
  const manifest = await LayerFactory.loadManifest(config.visual.manifest);
  const factory = new LayerFactory(flags.visualMode ?? config.visual.mode, manifest);
  if (factory.mode === 'sprites') await factory.loadSprites();
  const game = new Game(stage, config, flags, factory);

  Object.assign(window, {
    __fgl: {
      game,
      config,
      flags,
      stage,
      stats: game.stats,
      clock: game.clock,
      snap: () => game.snapshot(),
      /** Logical centre of an arrow / wheel, for tests. */
      arrow: (id: number, dir: 'cw' | 'ccw') => {
        const w = game.wheels.find((x) => x.id === id)!;
        return { x: w.x + (dir === 'cw' ? ARROW.offsetX : -ARROW.offsetX), y: w.y + ARROW.offsetY };
      },
      wheelPos: (id: number) => {
        const w = game.wheels.find((x) => x.id === id)!;
        return { x: w.x, y: w.y };
      },
      toClient: (x: number, y: number) => ({ x: x * stage.scale + stage.offsetX, y: y * stage.scale + stage.offsetY }),
    },
  });
  return game;
}
