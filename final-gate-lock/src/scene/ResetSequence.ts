/**
 * Reset (PLAN §6.4 step 6): mist rolls back over everything (3 s). Only once the screen is fully
 * covered is everything restored — players never see the wheels move back.
 */
import type { Game } from '../app/Game';
import { ease, type Seq } from '../util/tween';

export const RESET_MS = 3000;

export async function runReset(game: Game, seq: Seq): Promise<void> {
  const { veil } = game.layers;
  game.sfx.loop('core_hum', false, 1500);
  game.sfx.play('reset_wind');
  game.sfx.loop('mist_loop', true, RESET_MS);
  game.sfx.loop('eye_loop', false, RESET_MS);
  game.mist.roll(RESET_MS);
  const v0 = veil.alpha;
  await seq.tween({ duration: RESET_MS, ease: ease.inOutSine, onUpdate: (k) => (veil.alpha = v0 + (1 - v0) * k) });
  veil.alpha = 1;
  game.restoreAfterUnlock();
}
