import { dist } from '../pattern/geometry.ts';
import type { GameContext, GameState } from './types.ts';

/**
 * The reveal figure: after a solve, the eyes listed in `ctx.figure` are joined one after another and
 * draw the hidden number (pattern.json "figure"). Pure timing, shared by the scene, the debug drawing
 * and the audio (each eye plays its note as the line reaches it).
 */
export interface FigureProgress {
  /**
   * How far the line has been drawn, in segments: −1 before it starts, then 0 … figure.length − 1
   * (2.5 = two segments and half of the third). Speed is even along the line, not per segment.
   */
  head: number;
  /** 0…1: the figure fades out as the clouds return after the hold. */
  alpha: number;
  /** Milliseconds since the figure was completed; −1 while it is still being drawn. */
  doneMs: number;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** null outside REVEAL / IDLE or without a figure. IDLE continues the REVEAL timeline (already complete). */
export function figureProgress(s: GameState, now: number, ctx: GameContext): FigureProgress | null {
  const fig = ctx.figure;
  if (fig.length < 2 || (s.mode !== 'REVEAL' && s.mode !== 'IDLE')) return null;
  const t = ctx.timing;
  const elapsed = s.mode === 'REVEAL' ? now - s.modeSince : t.revealDisperseMs + (now - s.modeSince);
  const alpha = s.mode === 'IDLE' && s.cloudsReturning ? 1 - clamp01((now - s.modeSince - t.revealHoldMs) / t.cloudsReturnMs) : 1;
  if (elapsed < t.revealFigureDelayMs) return { head: -1, alpha, doneMs: -1 };

  // eased overall, even speed along the line: map the drawn length back to segments
  const k = clamp01((elapsed - t.revealFigureDelayMs) / t.revealFigureDrawMs);
  // finished: exactly the last eye (summing the segments back could land a hair short of it)
  if (k >= 1) return { head: fig.length - 1, alpha, doneMs: elapsed - t.revealFigureDelayMs - t.revealFigureDrawMs };
  const eased = k * k * (3 - 2 * k);
  const pos = (id: number) => ctx.points.find((p) => p.id === id)!.pos;
  const lens = fig.slice(1).map((id, i) => dist(pos(fig[i]), pos(id)));
  let left = eased * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) return { head: i + Math.min(1, lens[i] > 0 ? left / lens[i] : 1), alpha, doneMs: -1 };
    left -= lens[i];
  }
  return { head: lens.length, alpha, doneMs: -1 };
}

/** Surges along the finished figure: a rest after completion, then one per `everyMs` slot, started up to `jitterMs` late, each running `runMs`. */
export const SURGE = { restMs: 1200, everyMs: 6500, jitterMs: 1600, runMs: 3600 };

/** Small deterministic hash 0…1, so the surges are irregular but the same on every run. */
const jitter = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Where a surge is along the finished figure, in segments (it runs from a little before the first eye
 * to a little past the last, so both ends get the full wave), or null between surges.
 */
export function figureSurge(doneMs: number, segments: number): number | null {
  if (doneMs < SURGE.restMs) return null;
  const n = Math.floor((doneMs - SURGE.restMs) / SURGE.everyMs);
  const local = doneMs - SURGE.restMs - n * SURGE.everyMs - jitter(n) * SURGE.jitterMs;
  if (local < 0 || local >= SURGE.runMs) return null;
  return -0.5 + (local / SURGE.runMs) * (segments + 1);
}
