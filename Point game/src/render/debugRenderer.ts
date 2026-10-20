import { Container, Graphics, Text } from 'pixi.js';
import { liftIntensity } from '../game/reducer.ts';
import type { AttractView } from '../game/attract.ts';
import { figureProgress } from '../game/figure.ts';
import type { Effect, GameContext, GameState } from '../game/types.ts';
import { lerpVec } from '../pattern/geometry.ts';
import { ASPECT, type Pattern, type Vec } from '../pattern/types.ts';
import { almond, circle, easeOut, easeOutElastic, hash, lerpColor } from './draw.ts';

/** Phase 1 rendering: debug primitives only (plan §12, milestone 4). */

const C = {
  bg: 0x07051a,
  point: 0x3d3770,
  pointEdge: 0x8a83d0,
  correctRing: 0x6f8fd0,
  wrongRing: 0xc06ad8,
  gold: 0xf3d99a,
  cold: 0x7d8aa6,
  violet: 0xa060ff,
  white: 0xfffbe8,
};

const LINE_W = 0.006;

interface Anim {
  start: number;
  dur: number;
}
interface Blink extends Anim {
  point: number;
}
interface Ripple extends Anim {
  pos: Vec;
  color: number;
  maxR: number;
}
interface Retract extends Anim {
  from: Vec;
  to: number;
}

export interface EditorView {
  pattern: Pattern;
  selected: number | null;
  recording: boolean;
  hit: GameContext['hit'];
}

export class DebugRenderer {
  readonly root = new Container();
  private readonly bg = new Graphics();
  private readonly g = new Graphics();
  private readonly labels = new Container();
  private labelTexts = new Map<number, Text>();

  private ctx!: GameContext;
  private notes = new Map<number, string>();
  private pos = new Map<number, Vec>();

  private blinks: Blink[] = [];
  private flinches: Blink[] = [];
  private hints: Blink[] = [];
  private ripples: Ripple[] = [];
  private retracts: Retract[] = [];
  private strikePulseAt = -1e9;

  debug = false;
  /** Drawn faintly over the real scene (D key) instead of as the whole picture. */
  private overlay = false;

  constructor() {
    this.bg.rect(0, 0, 1, ASPECT).fill({ color: C.bg });
    this.root.addChild(this.bg, this.g, this.labels);
    this.labels.visible = false;
  }

  setOverlay(on: boolean): void {
    this.overlay = on;
    this.bg.visible = !on;
    this.root.alpha = on ? 0.55 : 1;
  }

  setPattern(ctx: GameContext, pattern: Pattern): void {
    this.ctx = ctx;
    this.notes = new Map(pattern.points.map((p) => [p.id, p.note]));
    this.pos = new Map(ctx.points.map((p) => [p.id, p.pos]));
    for (const t of this.labelTexts.values()) t.destroy();
    this.labelTexts.clear();
    this.labels.removeChildren();
    for (const p of ctx.points) {
      const t = new Text({ text: '', style: { fontFamily: 'Consolas, monospace', fontSize: 34, fill: 0xd8d4ff, align: 'center' } });
      t.anchor.set(0.5, 0);
      t.scale.set(0.0007);
      this.labels.addChild(t);
      this.labelTexts.set(p.id, t);
    }
    this.updateLabels(ctx.points.map((p) => ({ id: p.id, pos: p.pos, r: p.r })), ctx.sequence);
  }

  private updateLabels(points: { id: number; pos: Vec; r: number }[], sequence: number[]): void {
    for (const p of points) {
      const t = this.labelTexts.get(p.id);
      if (!t) continue;
      const steps = sequence.map((id, i) => (id === p.id ? i + 1 : 0)).filter((i) => i > 0);
      t.text = `${p.id} ${this.notes.get(p.id) ?? ''}${steps.length ? `\n#${steps.join(',')}` : ''}`;
      t.position.set(p.pos.x, p.pos.y + p.r * 1.55);
    }
  }

  ripple(pos: Vec, now: number): void {
    this.ripples.push({ pos, start: now, dur: 900, color: C.pointEdge, maxR: 0.12 });
  }

  onEffect(e: Effect, now: number): void {
    switch (e.type) {
      case 'demoBlink':
        this.blinks.push({ point: e.point, start: now, dur: e.noteMs + 300 });
        break;
      case 'playNote':
        this.blinks.push({ point: e.point, start: now, dur: e.kind === 'reach' ? 700 : 400 });
        break;
      case 'flinch':
        this.flinches.push({ point: e.point, start: now, dur: 600 });
        break;
      case 'pulseHint':
        this.hints.push({ point: e.point, start: now, dur: 700 });
        break;
      case 'retract':
        this.retracts.push({ from: e.from, to: e.to, start: now, dur: this.ctx.timing.retractMs });
        break;
      case 'strikePulse':
        this.strikePulseAt = now;
        break;
      case 'collapse': {
        const start = this.pos.get(this.ctx.sequence[0])!;
        this.ripples.push({ pos: start, start: now + this.ctx.timing.collapseMs, dur: 1200, color: C.cold, maxR: 0.2 });
        break;
      }
      case 'startReveal':
        for (const p of this.ctx.points) this.blinks.push({ point: p.id, start: now, dur: 4000 });
        break;
      case 'toIntro':
        this.ripples.push({ pos: { x: 0.5, y: ASPECT / 2 }, start: now, dur: 1500, color: C.pointEdge, maxR: 0.5 });
        break;
      default:
        break;
    }
  }

  // ── frame ────────────────────────────────────────────────────

  render(s: GameState, now: number, attract: AttractView | null = null): void {
    const g = this.g;
    g.clear();
    this.labels.visible = this.debug;
    this.prune(now);

    this.drawReveal(s, now);
    for (const r of this.ripples) this.drawRipple(r, now);
    if (s.mode === 'INTRO' && !this.overlay) this.drawIntro(now);
    this.drawLines(s, now);
    this.drawExtras(s, attract);
    this.drawPoints(s, now);
    this.drawMaster(s.mode === 'GAME' && s.sub === 'READY', now);
    this.drawCreativeButton((s.mode === 'GAME' && s.sub === 'READY') || s.mode === 'CREATIVE', now);
  }

  private prune(now: number): void {
    const alive = (a: Anim) => now < a.start + a.dur;
    this.blinks = this.blinks.filter(alive);
    this.flinches = this.flinches.filter(alive);
    this.hints = this.hints.filter(alive);
    this.ripples = this.ripples.filter(alive);
    this.retracts = this.retracts.filter(alive);
  }

  /** The reveal figure as plain lines, as far as it is drawn. */
  private drawReveal(s: GameState, now: number): void {
    const f = figureProgress(s, now, this.ctx);
    if (!f || f.head < 0) return;
    const fig = this.ctx.figure;
    const P = (id: number) => this.pos.get(id)!;
    const g = this.g;
    g.moveTo(P(fig[0]).x, P(fig[0]).y);
    for (let i = 1; i < fig.length && i - 1 < f.head; i++) {
      const p = lerpVec(P(fig[i - 1]), P(fig[i]), Math.min(1, f.head - (i - 1)));
      g.lineTo(p.x, p.y);
    }
    g.stroke({ width: LINE_W * 1.5, color: C.gold, alpha: f.alpha });
  }

  private drawRipple(r: Ripple, now: number): void {
    const t = (now - r.start) / r.dur;
    if (t < 0) return;
    circle(this.g, r.pos.x, r.pos.y, r.maxR * easeOut(t)).stroke({ width: 0.003, color: r.color, alpha: 0.6 * (1 - t) });
  }

  private drawIntro(now: number): void {
    const c = { x: 0.5, y: ASPECT / 2 };
    for (let i = 0; i < 3; i++) {
      const t = ((now / 2400 + i / 3) % 1 + 1) % 1;
      circle(this.g, c.x, c.y, 0.04 + 0.16 * t).stroke({ width: 0.004, color: C.gold, alpha: 0.5 * (1 - t) });
    }
    circle(this.g, c.x, c.y, 0.025 + 0.005 * Math.sin(now / 400)).fill({ color: C.gold, alpha: 0.8 });
  }

  private segmentPath(from: Vec, to: Vec, color: number, alpha: number, u: number, now: number, seed: number): void {
    const g = this.g;
    if (u <= 0) {
      g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: LINE_W, color, alpha });
      return;
    }
    // unsettled: jitter perpendicular to the segment, noise-driven gaps
    const n = 14;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const frame = Math.floor(now / 110);
    for (let i = 0; i < n; i++) {
      if (hash(seed * 31 + i, frame) < u * 0.55) continue;
      const pts = [i / n, (i + 1) / n].map((t, k) => {
        const j = Math.sin(now * 0.021 + (i + k) * 1.7 + seed) * u * 0.012;
        return { x: from.x + dx * t + nx * j, y: from.y + dy * t + ny * j };
      });
      g.moveTo(pts[0].x, pts[0].y).lineTo(pts[1].x, pts[1].y).stroke({ width: LINE_W * (1 - 0.4 * u), color, alpha });
    }
  }

  private drawLines(s: GameState, now: number): void {
    if (s.mode !== 'GAME' && s.mode !== 'REVEAL') return;
    const seq = this.ctx.sequence;
    const P = (id: number) => this.pos.get(id)!;
    let u = 0;
    let color = C.gold;
    let alpha = 0.95;
    if (s.mode === 'REVEAL') {
      const t = (now - s.modeSince) / this.ctx.timing.revealDisperseMs;
      alpha = Math.max(0, t < 0.15 ? 1 : 1 - (t - 0.15) / 0.85);
      color = C.white;
    } else if (s.sub === 'LIFTED') {
      u = liftIntensity(s, now, this.ctx.timing.liftStrikeMs);
      color = lerpColor(C.gold, C.cold, u);
      const pulse = Math.max(0, 1 - (now - this.strikePulseAt) / 500);
      alpha = 0.9 - 0.3 * u + 0.1 * pulse;
      if (pulse > 0) color = lerpColor(color, C.white, pulse);
    }

    let segs = Math.max(0, s.progress - 1);
    let partial = 0;
    if (s.mode === 'GAME' && s.sub === 'COLLAPSE') {
      const t = Math.min(1, (now - s.subSince) / this.ctx.timing.collapseMs);
      const visible = Math.max(0, s.collapseFrom - 1) * (1 - t);
      segs = Math.floor(visible);
      partial = visible - segs;
      color = C.cold;
    }
    for (let i = 0; i < segs; i++) this.segmentPath(P(seq[i]), P(seq[i + 1]), color, alpha, u, now, i);
    if (partial > 0) this.segmentPath(P(seq[segs]), lerpVec(P(seq[segs]), P(seq[segs + 1]), partial), color, alpha, 0, now, segs);

    // tether: live to the finger, or hanging where it lifted
    if (s.mode === 'GAME' && s.tether && s.progress > 0 && (s.sub === 'TRACING' || s.sub === 'LIFTED')) {
      const last = P(seq[s.progress - 1]);
      const tc = s.sub === 'TRACING' ? C.white : color;
      this.segmentPath(last, s.tether, tc, s.sub === 'TRACING' ? 0.75 : alpha * 0.8, u, now, 99);
      if (s.sub === 'TRACING') circle(this.g, s.tether.x, s.tether.y, 0.008).fill({ color: C.white, alpha: 0.8 });
    }
    for (const r of this.retracts) {
      const t = Math.min(1, (now - r.start) / r.dur);
      const tip = lerpVec(r.from, P(r.to), easeOutElastic(t));
      this.g.moveTo(P(r.to).x, P(r.to).y).lineTo(tip.x, tip.y).stroke({ width: LINE_W, color: C.cold, alpha: 0.8 });
      circle(this.g, tip.x, tip.y, 0.012 * (1 - t) + 0.004).fill({ color: C.white, alpha: 1 - t });
    }
  }

  private drawPoints(s: GameState, now: number): void {
    const g = this.g;
    const seq = this.ctx.sequence;
    const { correctScale, wrongScale } = this.ctx.hit;
    const awake = new Set<number>();
    if (s.mode === 'GAME' && (s.sub === 'TRACING' || s.sub === 'LIFTED')) for (let i = 0; i < s.progress; i++) awake.add(seq[i]);
    const readyStart = s.mode === 'GAME' && s.sub === 'READY' ? seq[0] : null;

    for (const p of this.ctx.points) {
      let { x, y } = p.pos;
      const r = p.r;
      const fl = this.flinches.find((f) => f.point === p.id);
      if (fl) {
        const t = (now - fl.start) / fl.dur;
        x += Math.sin(now * 0.09) * 0.006 * (1 - t);
      }
      let glow = 0.15 + 0.06 * Math.sin(now / 1500 + p.id * 1.3); // sleeping breathing
      if (awake.has(p.id)) glow = 0.5;
      if (p.id === readyStart) glow = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(now / 600));
      for (const b of this.blinks) if (b.point === p.id) glow = Math.max(glow, 1 - (now - b.start) / b.dur);
      if (fl) glow = 0.05;

      // hit radii (always visible in Phase 1)
      circle(g, x, y, r * correctScale).stroke({ width: 0.0018, color: C.correctRing, alpha: 0.35 });
      circle(g, x, y, r * wrongScale).stroke({ width: 0.0018, color: C.wrongRing, alpha: 0.45 });
      circle(g, x, y, r).fill({ color: lerpColor(C.point, C.gold, glow), alpha: this.overlay ? 0.12 : 0.85 }).stroke({ width: 0.003, color: C.pointEdge, alpha: 0.7 });
      if (glow > 0.6) circle(g, x, y, r * (1 + glow * 0.6)).stroke({ width: 0.004, color: C.gold, alpha: (glow - 0.6) * 1.5 });
      if (fl) {
        const t = (now - fl.start) / fl.dur;
        circle(g, x, y, r * (1 + 2 * t)).stroke({ width: 0.004, color: C.violet, alpha: 1 - t });
      }
      for (const h of this.hints) {
        if (h.point !== p.id) continue;
        const t = (now - h.start) / h.dur;
        circle(g, x, y, r * (1 + 1.2 * easeOut(t))).stroke({ width: 0.005, color: C.gold, alpha: 1 - t });
      }
    }
  }

  private drawMaster(active: boolean, now: number): void {
    const { pos, r } = this.ctx.master;
    const a = active ? 0.55 + 0.35 * Math.sin(now / 900) : 0.08;
    const g = this.g;
    circle(g, pos.x, pos.y, r).stroke({ width: 0.004, color: C.gold, alpha: a });
    almond(g, pos.x, pos.y, 0.65 * r, 0.28 * r).stroke({ width: 0.003, color: C.gold, alpha: a });
    circle(g, pos.x, pos.y, 0.17 * r).fill({ color: C.gold, alpha: a });
    if (this.debug) circle(g, pos.x, pos.y, r * this.ctx.hit.masterScale).stroke({ width: 0.0018, color: C.correctRing, alpha: 0.35 });
  }

  /** Creative-mode button: a ring with a small triangle of dots. */
  private drawCreativeButton(active: boolean, now: number): void {
    const { pos, r } = this.ctx.creative;
    const a = active ? 0.55 + 0.35 * Math.sin(now / 900 + 1.6) : 0.08;
    const g = this.g;
    circle(g, pos.x, pos.y, r).stroke({ width: 0.004, color: C.pointEdge, alpha: a });
    const pts = [-90, 30, 150].map((d) => ({ x: pos.x + Math.cos((d * Math.PI) / 180) * r * 0.5, y: pos.y + Math.sin((d * Math.PI) / 180) * r * 0.5 }));
    g.poly(pts.flatMap((p) => [p.x, p.y]), true).stroke({ width: 0.0025, color: C.gold, alpha: a });
    if (this.debug) circle(g, pos.x, pos.y, r * this.ctx.hit.masterScale).stroke({ width: 0.0018, color: C.correctRing, alpha: 0.35 });
  }

  /** INTRO attract demo and creative-mode chain, as plain lines. */
  private drawExtras(s: GameState, attract: AttractView | null): void {
    const g = this.g;
    const P = (id: number) => this.pos.get(id)!;
    if (attract) {
      const [a, b, c] = attract.points.map(P);
      const at = (x: number) => (x <= 1 ? lerpVec(a, b, x) : lerpVec(b, c, x - 1));
      const stops = [attract.tail, ...[1].filter((k) => k > attract.tail && k < attract.head), attract.head].map(at);
      g.moveTo(stops[0].x, stops[0].y);
      for (const p of stops.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width: LINE_W, color: C.gold, alpha: 0.9 });
    }
    if (s.mode === 'CREATIVE' && s.chain.length > 0) {
      const pts = s.chain.map(P);
      if (s.tether) pts.push(s.tether);
      g.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width: LINE_W, color: C.violet, alpha: 0.9 });
    }
  }

  onAttractNote(point: number, noteMs: number, now: number): void {
    this.blinks.push({ point, start: now, dur: noteMs + 300 });
  }

  // ── editor ───────────────────────────────────────────────────

  renderEditor(view: EditorView, now: number): void {
    this.setOverlay(false);
    const g = this.g;
    g.clear();
    this.labels.visible = true;
    g.rect(0, 0, 1, ASPECT).fill({ color: 0x0a0a14 });
    for (let i = 1; i < 10; i++) g.moveTo(i / 10, 0).lineTo(i / 10, ASPECT).stroke({ width: 0.001, color: 0x2a2a44 });
    for (let i = 1; i < 10; i++) g.moveTo(0, (i / 10) * ASPECT).lineTo(1, (i / 10) * ASPECT).stroke({ width: 0.001, color: 0x2a2a44 });
    const pts = view.pattern.points.map((p) => ({ id: p.id, pos: { x: p.x, y: p.y * ASPECT }, r: p.r }));
    const P = new Map(pts.map((p) => [p.id, p.pos]));
    const seq = view.pattern.sequence;
    for (let i = 1; i < seq.length; i++) {
      const a = P.get(seq[i - 1]);
      const b = P.get(seq[i]);
      if (a && b) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 0.004, color: C.gold, alpha: 0.7 });
    }
    for (const p of pts) {
      const isStart = p.id === seq[0];
      const isEnd = seq.length > 1 && p.id === seq[seq.length - 1];
      circle(g, p.pos.x, p.pos.y, p.r * view.hit.correctScale).stroke({ width: 0.0018, color: C.correctRing, alpha: 0.4 });
      circle(g, p.pos.x, p.pos.y, p.r * view.hit.wrongScale).stroke({ width: 0.0018, color: C.wrongRing, alpha: 0.5 });
      const fill = isStart ? 0x3cbf7a : isEnd ? 0xd05050 : seq.includes(p.id) ? 0x6a5fc0 : 0x3a3a50;
      circle(g, p.pos.x, p.pos.y, p.r).fill({ color: fill, alpha: 0.85 });
      if (p.id === view.selected) circle(g, p.pos.x, p.pos.y, p.r + 0.006).stroke({ width: 0.004, color: C.white, alpha: 0.6 + 0.4 * Math.sin(now / 150) });
    }
    if (view.recording) g.rect(0.005, 0.005, 0.99, ASPECT - 0.01).stroke({ width: 0.006, color: 0xd05050, alpha: 0.8 });
    this.notes = new Map(view.pattern.points.map((p) => [p.id, p.note]));
    this.updateLabels(pts, seq);
    this.drawMaster(true, now);
    this.drawCreativeButton(true, now);
  }

  /** Restore labels after leaving the editor. */
  refreshLabels(): void {
    this.updateLabels(this.ctx.points, this.ctx.sequence);
  }
}
