/**
 * Intro (Shrouded → Playable, ~6.5 s; PLAN §6.3, lengthened for weight — see DECISIONS.md):
 *   0–2.6 s   mist parts outward from the tap point, plate rises out of the dark
 *   1–3.4 s   eyes open one by one in a wave from the tap point, each with a slow, heavy blink
 *   2.6–6.4 s wheels make one or two heavy turns and wind down with ratchet clicks onto their
 *             start slots, each ending on a hard stop and a thud
 *   6.5 s     input unlocks, eyes drowsy
 * Input is ignored throughout (the machine is in Intro).
 */
import type { Game } from '../app/Game';
import { FEEL } from '../feel';
import { ease, type Seq } from '../util/tween';
import { mulberry32, randBetween, randRange } from '../util/random';

const I = FEEL.intro;
export const INTRO_MS = I.totalMs;

export async function runIntro(game: Game, seq: Seq, origin: { x: number; y: number }): Promise<void> {
  const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  const t0 = seq.now;
  const { veil } = game.layers;

  game.tweens.kill('glim');
  game.sfx.play('reveal_whoosh');
  game.mist.part(origin.x, origin.y, I.veilMs);
  const glimFrom = game.glimmers.level;
  seq.fire({ duration: 1400, ease: ease.outQuad, onUpdate: (k) => (game.glimmers.level = glimFrom * (1 - k)) });
  seq.fire({ duration: I.veilMs, ease: ease.inOutCubic, onUpdate: (k) => (veil.alpha = 1 - k) });

  const dist = game.wheels.map((w) => Math.hypot(w.x - origin.x, w.y - origin.y));
  const maxD = Math.max(...dist, 1);

  // eyes open in a wave from the tap point
  game.wheels.forEach((w, i) => {
    const delay = I.eyeWave[0] + (dist[i] / maxD) * (I.eyeWave[1] - I.eyeWave[0]);
    seq.after(delay, () => {
      w.eye.openSlowly(seq.now);
      game.sfx.play('eye_open', { volume: 0.7 });
    });
  });

  // wheels wind down onto their start slots, staggered from the tap point
  const spins: Promise<void>[] = [];
  game.wheels.forEach((w, i) => {
    const start = I.spinStart[0] + (dist[i] / maxD) * (I.spinStart[1] - I.spinStart[0]);
    const dur = Math.min(INTRO_MS - start - 80, randRange(rng, I.spinMs));
    const turns = 1 + Math.floor(rng() * 2);
    spins.push(
      new Promise<void>((resolve) => {
        seq.after(start, () => {
          game.sfx.play('spin_ratchet', { volume: 0.55, rate: randBetween(rng, 0.85, 0.95) });
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
