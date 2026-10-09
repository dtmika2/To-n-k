/**
 * Success (~10 s; PLAN §6.4, lengthened for weight and the core's flight — see DECISIONS.md):
 *   0.0 s      last wheel settled correct → 0.6 s held breath (ambience ducked)
 *   0.6 s      all eyes open wide, pupils drift to centre, a slow teal pulse across the plate
 *   1.4 s      heavy clunk: one low jolt through the whole door, wheels sink into the plate,
 *              brass collars slam shut one after another
 *   2.4 s      eyes close peacefully
 *   4.0 s      the plate breaks free (a short shove apart, a burst of dust), a breath, then the
 *              halves grind slowly apart over the gold core (core hum rises) while dust keeps falling
 *   8.0 s      the core swells a little and flies up off the top of the screen (whoosh, hum fades)
 *  10.0 s      → Open (halves apart, the light and dust lingering in the doorway, eyes closed)
 */
import type { Game } from '../app/Game';
import { FEEL } from '../feel';
import { SPLIT_DISTANCE } from './PlateSplit';
import { ease, type Seq } from '../util/tween';

const S = FEEL.success;
export const SUCCESS_MS = S.totalMs;

/** Grinding slide: slow to get going, steady, then a heavy stop. */
const grind = (u: number) => (u < 0.3 ? 0.3 * Math.pow(u / 0.3, 2) * 0.5 : 0.15 + 0.85 * ease.outCubic((u - 0.3) / 0.7));

export async function runSuccess(game: Game, seq: Seq): Promise<void> {
  const t0 = seq.now;
  const at = async (ms: number) => {
    const wait = ms - (seq.now - t0);
    if (wait > 0) await seq.wait(wait);
  };
  const { veil } = game.layers;
  const root = game.stage.root;

  // 1. held breath (also make sure the plate is visible if the operator forced it open)
  game.sfx.duck(true, 120);
  if (veil.alpha > 0) {
    const v0 = veil.alpha;
    seq.fire({ duration: 450, ease: ease.outQuad, onUpdate: (k) => (veil.alpha = v0 * (1 - k)) });
  }
  game.mist.setDensity(0, 500);
  await at(S.eyesWideAt);

  // 2. every eye opens wide, slow teal pulse
  game.sfx.play('success_stinger');
  for (const w of game.wheels) w.eye.setMode('wide', seq.now);
  void seq
    .fire({ duration: 420, ease: ease.outQuad, onUpdate: (k) => game.unlock.setPulse(0.55 * k) })
    .then(() => seq.fire({ duration: 1600, ease: ease.inOutSine, onUpdate: (k) => game.unlock.setPulse(0.55 * (1 - k)) }));
  await at(S.clunkAt);

  // 3. clunk: one low jolt through the whole door, wheels sink, collars slam shut
  // one clunk per socket, a ragged volley rather than a single hit
  for (let i = 0, t = 0; i < S.clunkCount; i++) {
    seq.after(t, () => game.sfx.play('lock_clunk'));
    t += S.clunkGapMs[0] + Math.random() * (S.clunkGapMs[1] - S.clunkGapMs[0]);
  }
  seq.fire({
    duration: S.sinkMs,
    ease: ease.inCubic, // accelerates into a hard stop
    onUpdate: (k) => {
      for (const w of game.wheels) w.setSink(k);
    },
  });
  seq.fire({
    duration: 700,
    ease: ease.linear,
    onUpdate: (k) => {
      // low-frequency jolt that dies out (pivot shift keeps the letterbox in place)
      const a = S.joltPx * Math.pow(1 - k, 2);
      root.pivot.set(Math.sin(k * 17) * a * 0.35, -Math.cos(k * 13) * a);
    },
  });
  game.wheels.forEach((w, i) => {
    seq.after(160 + i * S.collarStaggerMs, () => {
      seq.fire({ duration: S.collarMs, ease: ease.heavyDetent, onUpdate: (k) => w.setLock(k) });
    });
  });
  await at(S.eyesCloseAt);
  root.pivot.set(0, 0);
  for (const w of game.wheels) w.eye.setMode('peaceful', seq.now);
  await at(S.splitAt);

  // 4. the plate breaks free, then grinds apart over the core
  game.beginSplit();
  game.sfx.play('plate_slide');
  game.sfx.play('dust_fall');
  // the held breath ends as the core appears: its hum rises on the ambience bus
  game.sfx.duck(false, 1500);
  game.sfx.loop('core_hum', true, 1500);
  const k0 = S.breakFreePx / SPLIT_DISTANCE;
  game.unlock.burst(90);
  await seq.tween({ duration: S.breakFreeMs, ease: ease.outCubic, onUpdate: (k) => (game.unlock.edges = game.split.set(k0 * k)) });
  seq.fire({ duration: 1200, ease: ease.outQuad, onUpdate: (k) => (game.unlock.level = k) });
  await seq.wait(S.splitPauseMs);
  game.unlock.dustRate = 80;
  seq.fire({
    duration: S.slideMs,
    ease: ease.linear,
    onUpdate: (u) => {
      const k = k0 + (1 - k0) * grind(u);
      // a little vertical judder while the iron grinds
      const judder = u < 0.95 ? Math.sin(u * 140) * 0.7 * (1 - u) : 0;
      game.unlock.edges = game.split.set(k, judder);
    },
  });
  seq.after(S.slideMs, () => (game.unlock.dustRate = 14));
  await at(S.coreFlyAt);

  // 5. the core swells and flies up and away; its light lingers in the doorway
  game.sfx.play('reveal_whoosh', { rate: 0.8 });
  game.sfx.loop('core_hum', false, S.coreFlyMs);
  seq.fire({ duration: S.coreFlyMs, ease: ease.linear, onUpdate: (k) => (game.unlock.fly = k) });
  await at(SUCCESS_MS);
}
