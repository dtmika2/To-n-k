/**
 * Success (~7 s), PLAN §6.4:
 *   0.0 s     last wheel settled correct → 0.4 s of silence (ambience ducked)
 *   0.4 s     all eyes open wide at once, pupils snap to centre, teal pulse across the plate
 *   1.0–3.0 s heavy clunk; wheels sink into the plate, brass rings slide inward and lock
 *   3.0–6.0 s plate splits into halves that slide apart, revealing the gold core; dust falls
 *   7.0 s     → Open (halves apart, core glowing, eyes closed peacefully, core hum)
 */
import type { Game } from '../app/Game';
import { ease, type Seq } from '../util/tween';

export const SUCCESS_MS = 7000;

export async function runSuccess(game: Game, seq: Seq): Promise<void> {
  const t0 = seq.now;
  const at = async (ms: number) => {
    const wait = ms - (seq.now - t0);
    if (wait > 0) await seq.wait(wait);
  };
  const { veil, plate } = game.layers;

  // 1. held breath (also make sure the plate is visible if the operator forced it open)
  game.sfx.duck(true, 120);
  if (veil.alpha > 0) {
    const v0 = veil.alpha;
    seq.fire({ duration: 350, ease: ease.outQuad, onUpdate: (k) => (veil.alpha = v0 * (1 - k)) });
  }
  game.mist.setDensity(0, 400);
  await at(400);

  // 2. every eye opens wide at once, teal pulse
  game.sfx.play('success_stinger');
  for (const w of game.wheels) w.eye.setMode('wide', seq.now);
  void seq
    .fire({ duration: 260, ease: ease.outQuad, onUpdate: (k) => game.unlock.setPulse(0.55 * k) })
    .then(() => seq.fire({ duration: 1100, ease: ease.inOutSine, onUpdate: (k) => game.unlock.setPulse(0.55 * (1 - k)) }));
  await at(1000);

  // 3. clunk: wheels sink, rings contract and lock
  game.sfx.play('lock_clunk');
  seq.fire({
    duration: 900,
    ease: ease.outCubic,
    onUpdate: (k) => {
      for (const w of game.wheels) w.setSink(k);
      // short heavy shake that dies out
      const shake = (1 - k) * 4;
      plate.position.set(Math.sin(k * 60) * shake, Math.cos(k * 47) * shake * 0.6);
    },
  });
  game.wheels.forEach((w, i) => {
    seq.after(120 + i * 45, () => {
      seq.fire({ duration: 520, ease: ease.outBack, onUpdate: (k) => w.setLock(k) });
    });
  });
  seq.after(700, () => {
    for (const w of game.wheels) w.eye.setMode('peaceful', seq.now);
  });
  await at(3000);
  plate.position.set(0, 0);

  // 4. plate splits, core revealed, dust
  game.beginSplit();
  game.sfx.play('plate_slide');
  game.sfx.play('dust_fall');
  game.unlock.dustRate = 70;
  seq.fire({ duration: 900, ease: ease.outQuad, onUpdate: (k) => (game.unlock.level = k) });
  seq.fire({
    duration: 2800,
    ease: ease.inOutCubic,
    onUpdate: (k) => (game.unlock.edges = game.split.set(k)),
  });
  seq.after(2800, () => (game.unlock.dustRate = 14));
  await at(SUCCESS_MS);
}
