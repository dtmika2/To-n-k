import { dist, distToSegment } from '../pattern/geometry.ts';
import type { GameContext } from './types.ts';

export interface AttractTiming {
  drawMs: number;
  noteMs: number;
  holdMs: number;
  undrawMs: number;
  gapMs: number;
}

export interface AttractEvent {
  type: 'note';
  point: number;
  noteMs: number;
}

/** A → B → C; `head` and `tail` are positions along that path in segment units (0…2). */
export interface AttractView {
  points: [number, number, number];
  head: number;
  tail: number;
}

const MAX_SEGMENT = 0.9;
const MIN_SEGMENT_R = 2.5;

const smooth = (t: number) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/**
 * INTRO attract demo (not game rules, so it lives outside the reducer): three random points connect
 * one after another with their notes, then the line un-draws from the first point to the last, and
 * three new points are chosen. Deterministic for a given `rand`.
 */
export class AttractPlayer {
  private triple: [number, number, number] | null = null;
  private cycleStart = 0;
  private notesDone = 0;
  private prev: number[] = [];

  constructor(
    private readonly ctx: GameContext,
    private readonly t: AttractTiming,
    private readonly rand: () => number,
    private readonly clearance = 0.015,
  ) {}

  get cycleMs(): number {
    return 2 * this.t.drawMs + this.t.holdMs + this.t.undrawMs + this.t.gapMs;
  }

  /** Start over: the next update picks a fresh triple and starts its cycle then. */
  reset(): void {
    this.triple = null;
  }

  update(now: number): { events: AttractEvent[]; view: AttractView | null } {
    const events: AttractEvent[] = [];
    if (!this.triple || now - this.cycleStart >= this.cycleMs) {
      // keep the rhythm when called every frame, but don't replay missed cycles after a long pause
      const behind = this.triple ? now - this.cycleStart : Infinity;
      this.cycleStart = behind < 2 * this.cycleMs ? this.cycleStart + this.cycleMs : now;
      if (this.triple) this.prev = [...this.triple];
      this.triple = this.pick();
      this.notesDone = 0;
    }
    const triple = this.triple;
    const e = now - this.cycleStart;
    const d = this.t.drawMs;
    while (this.notesDone < 3 && e >= this.notesDone * d) {
      events.push({ type: 'note', point: triple[this.notesDone], noteMs: this.t.noteMs });
      this.notesDone++;
    }
    const seg = Math.min(2, Math.floor(e / d));
    const head = seg >= 2 ? 2 : seg + smooth((e - seg * d) / d);
    const undrawStart = 2 * d + this.t.holdMs;
    const tail = e < undrawStart ? 0 : 2 * smooth((e - undrawStart) / this.t.undrawMs);
    return { events, view: tail >= 2 ? null : { points: triple, head, tail } };
  }

  /** Is the segment a→b a pleasant, unambiguous connection? */
  private segmentOk(a: number, b: number): boolean {
    const pa = this.ctx.points.find((p) => p.id === a)!;
    const pb = this.ctx.points.find((p) => p.id === b)!;
    const len = dist(pa.pos, pb.pos);
    if (len < MIN_SEGMENT_R * Math.max(pa.r, pb.r) || len > MAX_SEGMENT) return false;
    return this.ctx.points.every(
      (p) => p.id === a || p.id === b || distToSegment(p.pos, pa.pos, pb.pos) >= this.ctx.hit.wrongScale * p.r + this.clearance,
    );
  }

  private pick(): [number, number, number] {
    const ids = this.ctx.points.map((p) => p.id);
    const any = () => ids[Math.floor(this.rand() * ids.length)];
    for (let attempt = 0; attempt < 400; attempt++) {
      const avoidPrev = attempt < 200;
      const a = any();
      const b = any();
      const c = any();
      if (a === b || b === c || a === c) continue;
      if (avoidPrev && [a, b, c].some((id) => this.prev.includes(id))) continue;
      if (this.segmentOk(a, b) && this.segmentOk(b, c)) return [a, b, c];
    }
    // fallback: any three distinct points
    const shuffled = [...ids].sort(() => this.rand() - 0.5);
    return [shuffled[0], shuffled[1], shuffled[2]];
  }
}
