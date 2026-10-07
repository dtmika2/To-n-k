/**
 * Intro (Shrouded → Playable, ~5 s), PLAN §6.3:
 *   0–2 s  mist parts outward from the tap point, plate fades up
 *   1–3 s  eyes open one by one in a wave from the tap point, each with a slow blink
 *   2–5 s  wheels spin fast and decelerate with clicks onto their start slots, staggered
 *   5 s    input unlocks, eyes drowsy
 * Input is ignored throughout (the machine is in Intro).
 */
import type { Game } from '../app/Game';
import { ease, type Seq } from '../util/tween';
import { mulberry32, randBetween } from '../util/random';

export const INTRO_MS = 5000;

export async function runIntro(game: Game, seq: Seq, origin: { x: number; y: number }): Promise<void> {
  const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  const t0 = seq.now;
  const { veil } = game.layers;

  game.sfx.play('reveal_whoosh');
  game.mist.part(origin.x, origin.y, 2000);
  const glimFrom = game.glimmers.level;
  seq.fire({ duration: 1200, ease: ease.outQuad, onUpdate: (k) => (game.glimmers.level = glimFrom * (1 - k)) });
  seq.fire({ duration: 2000, ease: ease.inOutCubic, onUpdate: (k) => (veil.alpha = 1 - k) });

  const dist = game.wheels.map((w) => Math.hypot(w.x - origin.x, w.y - origin.y));
  const maxD = Math.max(...dist, 1);

  // eyes open in a wave from the tap point (1–3 s)
  game.wheels.forEach((w, i) => {
    const delay = 1000 + (dist[i] / maxD) * 1700;
    seq.after(delay, () => {
      w.eye.openSlowly(seq.now);
      game.sfx.play('eye_open', { volume: 0.7 });
    });
  });

  // wheels spin onto their start slots (start 2–2.7 s, settle by 5 s)
  const spins: Promise<void>[] = [];
  game.wheels.forEach((w, i) => {
    const start = 2000 + (dist[i] / maxD) * 700;
    const dur = Math.min(INTRO_MS - start - 50, randBetween(rng, 1900, 2400));
    const turns = 2 + Math.floor(rng() * 2);
    spins.push(
      new Promise<void>((resolve) => {
        seq.after(start, () => {
          game.sfx.play('spin_ratchet', { volume: 0.55 });
          void w.spinTo(game.model.get(w.id), dur, turns, seq.now).then(resolve);
        });
      }),
    );
  });

  await Promise.all(spins);
  seq.check();
  const remaining = INTRO_MS - (seq.now - t0);
  if (remaining > 0) await seq.wait(remaining);
  veil.alpha = 0;
  game.glimmers.level = 0;
}
