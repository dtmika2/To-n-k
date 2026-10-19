import { Assets, Container, Graphics, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
import type { AttractView } from '../game/attract.ts';
import { NOTICE, noticeProgress } from '../config/notice.ts';
import { liftIntensity } from '../game/reducer.ts';
import type { Effect, GameContext, GameState } from '../game/types.ts';
import { dist, lerpVec } from '../pattern/geometry.ts';
import { noteToMidi } from '../pattern/notes.ts';
import { ASPECT, type Pattern, type Vec } from '../pattern/types.ts';
import { Atmosphere } from './atmosphere.ts';
import { CloudCover, type CloudConfig } from './clouds.ts';
import type { RevealConfig } from './debugRenderer.ts';
import { almond, circle, easeOut, easeOutElastic, hash, lerpColor, smooth, wobblyCircle } from './draw.ts';
import { Eye, type EyeLook } from './eye.ts';
import { Particles } from './particles.ts';
import { Sky } from './sky.ts';
import { softDotTexture } from './textures.ts';

const C = {
  gold: 0xf3d99a,
  hot: 0xfffbe8,
  cold: 0x7d8aa6,
  violet: 0xa060ff,
  lavender: 0x8f84ff,
  mist: 0xb8b8e0,
};

interface Anim {
  start: number;
  dur: number;
}
interface Blink extends Anim {
  point: number;
  /** Fraction of `dur` the eye stays open. */
  hold: number;
  closeTc: number;
}
interface Ring extends Anim {
  pos: Vec;
  color: number;
  from: number;
  to: number;
  width: number;
  alpha: number;
}
interface Retract extends Anim {
  from: Vec;
  to: number;
}

export interface SceneConfig {
  reveal: RevealConfig;
  stars: number;
  octaves: number;
  renderScale: number;
  eyeMinOpen: number;
  clouds: CloudConfig;
}

/**
 * Phase 2 visuals (plan §7): sky, reveal number, cloud cover + mist, constellation strands with
 * stardust, organic eyes, master button and effects. State-driven each frame; effects add transient
 * animations.
 */
export class SceneRenderer {
  readonly root = new Container();
  private readonly dot: Texture;
  private readonly softDot: Texture;
  private readonly sky: Sky;
  private readonly revealLayer = new Container();
  private revealNode: Sprite | Text | null = null;
  private readonly revealGlow: Sprite;
  private readonly clouds: CloudCover;
  private readonly atmosphere: Atmosphere;
  private readonly strands = new Graphics();
  private readonly dust: Particles;
  private readonly puffs: Particles;
  private readonly eyesLayer = new Container();
  private readonly fx = new Graphics();
  private readonly master = new Graphics();

  /** Debug (`?unused`, U key): mark the eyes the sequence never uses with a red ring and cross. */
  markUnused = false;

  private ctx!: GameContext;
  private eyes = new Map<number, Eye>();
  private centre: Vec = { x: 0.5, y: ASPECT / 2 };

  private blinks: Blink[] = [];
  private flinches: (Anim & { point: number })[] = [];
  private rings: Ring[] = [];
  private retracts: Retract[] = [];
  private segFlash = new Map<number, number>();
  private pendingPuffs: { at: number; pos: Vec }[] = [];
  private strikePulseAt = -1e9;
  private mistBumpAt = -1e9;
  /** Creative-mode strands; `fadeAt` is set when the finger lifts. */
  private creativeLinks: { from: number; to: number; seed: number; fadeAt: number | null }[] = [];
  private nextLinkSeed = 300;
  /** Each point's pitch as 0 (lowest note) … 1 (highest), for colouring creative strands. */
  private pitch = new Map<number, number>();
  private creativeAlpha = 0.08;
  /** The short outro after the demo's last blink. */
  private outro: Anim | null = null;
  private mist = 1;
  private masterAlpha = 0.08;
  private lastNow = 0;
  private renderScale: number;

  constructor(pixi: Renderer, private readonly cfg: SceneConfig) {
    this.renderScale = cfg.renderScale;
    this.dot = softDotTexture(64, 0.35);
    this.softDot = softDotTexture(128, 0);
    this.sky = new Sky(this.dot, cfg.stars);
    this.revealGlow = new Sprite(this.softDot);
    this.revealGlow.anchor.set(0.5);
    this.revealGlow.blendMode = 'add';
    this.revealGlow.tint = 0xffd9a0;
    this.revealLayer.addChild(this.revealGlow);
    this.revealLayer.visible = false;
    this.clouds = new CloudCover(cfg.clouds);
    this.atmosphere = new Atmosphere(pixi, this.softDot, cfg.octaves);
    this.strands.blendMode = 'add';
    this.fx.blendMode = 'add';
    this.dust = new Particles(this.dot, 600, 'add');
    this.puffs = new Particles(this.softDot, 120, 'normal');
    this.root.addChild(
      this.sky.root,
      this.revealLayer,
      this.clouds.root,
      this.atmosphere.sprite,
      this.puffs.container,
      this.strands,
      this.dust.container,
      this.eyesLayer,
      this.master,
      this.fx,
    );
  }

  /** Noise octaves (performance tuning). */
  set octaves(n: number) {
    this.atmosphere.octaves = n;
  }

  get octaves(): number {
    return this.atmosphere.octaves;
  }

  /** `portraitPxWidth`: device pixels across the portrait layout. */
  resize(portraitPxWidth: number, renderScale = this.renderScale): void {
    this.renderScale = renderScale;
    this.atmosphere.resize(portraitPxWidth, renderScale);
  }

  /** Bottom layer image; without one (empty url or load failure) the sky keeps its gradient. */
  async loadBackdrop(url: string): Promise<void> {
    if (!url) return;
    try {
      this.sky.setBackdrop(await Assets.load<Texture>(url));
    } catch {
      console.warn(`[dream-pattern] backdrop "${url}" did not load; using the gradient`);
    }
  }

  async loadReveal(): Promise<void> {
    let node: Sprite | Text;
    const { imageUrl, widthFraction, placeholderText } = this.cfg.reveal;
    try {
      const tex = await Assets.load<Texture>(imageUrl);
      node = new Sprite(tex);
      node.scale.set(widthFraction / tex.width);
    } catch {
      node = new Text({
        text: placeholderText,
        style: { fontFamily: 'Georgia, serif', fontSize: 600, fill: 0xfff4dc, fontWeight: '700' },
      });
      node.scale.set((widthFraction * 1.4) / node.height);
    }
    node.anchor.set(0.5);
    node.position.set(0.5, ASPECT / 2);
    this.revealNode = node;
    this.revealLayer.addChild(node);
    this.revealGlow.position.set(0.5, ASPECT / 2);
    const size = Math.max(node.width, node.height) * 1.9;
    this.revealGlow.width = this.revealGlow.height = size;
  }

  setPattern(ctx: GameContext, pattern: Pattern): void {
    this.ctx = ctx;
    for (const e of this.eyes.values()) e.root.destroy({ children: true });
    this.eyes.clear();
    const seeds = new Map(pattern.points.map((p) => [p.id, p.seed]));
    const midi = pattern.points.map((p) => [p.id, noteToMidi(p.note) ?? 60] as const);
    const lo = Math.min(...midi.map(([, m]) => m));
    const hi = Math.max(...midi.map(([, m]) => m));
    this.pitch = new Map(midi.map(([id, m]) => [id, hi > lo ? (m - lo) / (hi - lo) : 0.5]));
    this.creativeLinks = [];
    for (const p of ctx.points) {
      const eye = new Eye(p.id, p.pos, p.r, seeds.get(p.id) ?? p.id + 1, this.dot, this.cfg.eyeMinOpen);
      this.eyes.set(p.id, eye);
      this.eyesLayer.addChild(eye.root);
    }
    const used = [...new Set(ctx.sequence)].map((id) => this.pos(id));
    this.centre = {
      x: used.reduce((a, p) => a + p.x, 0) / used.length,
      y: used.reduce((a, p) => a + p.y, 0) / used.length,
    };
  }

  private pos(id: number): Vec {
    return this.ctx.points.find((p) => p.id === id)!.pos;
  }

  private radius(id: number): number {
    return this.ctx.points.find((p) => p.id === id)!.r;
  }

  private ring(now: number, pos: Vec, opts: Partial<Ring> & { to: number }): void {
    this.rings.push({ start: now, dur: 800, pos, color: C.gold, from: 0, width: 0.004, alpha: 0.8, ...opts });
  }

  /** A touch: the mist ripples and parts. */
  ripple(pos: Vec, now: number): void {
    this.atmosphere.part(pos, now, 1, 0.1);
    this.ring(now, pos, { to: 0.11, dur: 1100, color: C.mist, alpha: 0.35, width: 0.003 });
  }

  /** The finger moving: the mist parts along its trail. */
  trail(pos: Vec, now: number): void {
    this.atmosphere.part(pos, now, 0.9, 0.07);
  }

  private blink(point: number, now: number, dur: number, hold = 0.7, closeTc = 0.14): void {
    this.blinks.push({ point, start: now, dur, hold, closeTc });
  }

  onEffect(e: Effect, now: number): void {
    switch (e.type) {
      case 'demoBlink': {
        this.blink(e.point, now, e.noteMs + 350, 0.62);
        const r = this.radius(e.point);
        this.ring(now, this.pos(e.point), { from: r, to: r * 2.4, dur: 900, color: C.gold, alpha: 0.7 });
        break;
      }
      case 'playNote': {
        const p = this.pos(e.point);
        const r = this.radius(e.point);
        this.blink(e.point, now, e.kind === 'reach' ? 700 : 500, 0.6);
        this.ring(now, p, { from: r * 0.8, to: r * (e.kind === 'reach' ? 2.8 : 2), dur: 750, color: C.gold });
        if (e.kind === 'reach') this.dust.burst(now, 14, { pos: p, speed: 0.12, life: 0.9, size: 0.007, tint: C.hot, grow: 0.2 });
        break;
      }
      case 'lockSegment':
        this.segFlash.set(e.index, now);
        break;
      case 'flinch': {
        const r = this.radius(e.point);
        this.flinches.push({ point: e.point, start: now, dur: 650 });
        this.eyes.get(e.point)?.shut();
        this.ring(now, this.pos(e.point), { from: r, to: r * 3.2, dur: 700, color: C.violet, alpha: 0.9, width: 0.005 });
        break;
      }
      case 'retract':
        this.retracts.push({ from: e.from, to: e.to, start: now, dur: this.ctx.timing.retractMs });
        break;
      case 'strikePulse':
        this.strikePulseAt = now;
        break;
      case 'pulseHint': {
        const r = this.radius(e.point);
        this.ring(now, this.pos(e.point), { from: r, to: r * 2.2, dur: 700, color: C.gold, alpha: 1, width: 0.006 });
        break;
      }
      case 'collapse':
        this.pendingPuffs.push({ at: now + this.ctx.timing.collapseMs, pos: this.pos(this.ctx.sequence[0]) });
        break;
      case 'demoOutro':
        this.outro = { start: now, dur: e.ms };
        break;
      case 'startGame':
        // like final-gate-lock's intro: the tap parts the clouds outward from the finger
        this.clouds.part(e.at ?? this.centre, this.cfg.clouds.partMs);
        break;
      case 'startReveal':
        for (const p of this.ctx.points) this.blink(p.id, now, 4200, 0.35, 1.3);
        this.ring(now, this.centre, { from: 0.05, to: 0.9, dur: 2200, color: C.hot, alpha: 0.6, width: 0.006 });
        this.clouds.part(this.centre, this.ctx.timing.revealDisperseMs); // pushes the lingering wisps aside
        break;
      case 'idle':
      case 'creativeStart':
        if (this.clouds.shrouded) this.clouds.part(this.centre, 1200); // debug jumps straight here
        break;
      case 'cloudsReturn':
        this.clouds.roll(this.ctx.timing.cloudsReturnMs);
        break;
      case 'toIntro':
        if (e.reason === 'inactivity') this.mistBumpAt = now;
        if (!this.clouds.shrouded) this.clouds.roll(1500); // debug jumps; normally already rolled back
        this.fadeCreative(now);
        break;
      case 'creativeLink':
        this.creativeLinks.push({ from: e.from, to: e.to, seed: this.nextLinkSeed++, fadeAt: null });
        break;
      case 'creativeRelease':
      case 'creativeExit':
        this.fadeCreative(now);
        break;
      default:
        break;
    }
  }

  private fadeCreative(now: number): void {
    for (const l of this.creativeLinks) if (l.fadeAt === null) l.fadeAt = now;
  }

  /** INTRO attract demo: a point lights up as the line reaches it. */
  onAttractNote(point: number, noteMs: number, now: number): void {
    this.blink(point, now, noteMs + 350, 0.62);
    const r = this.radius(point);
    this.ring(now, this.pos(point), { from: r, to: r * 2.4, dur: 900, color: C.gold, alpha: 0.7 });
  }

  // ── frame ────────────────────────────────────────────────────

  render(s: GameState, now: number, attract: AttractView | null = null): void {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    const alive = (a: Anim) => now < a.start + a.dur;
    this.blinks = this.blinks.filter(alive);
    this.flinches = this.flinches.filter(alive);
    this.rings = this.rings.filter(alive);
    this.retracts = this.retracts.filter(alive);
    for (const [k, t] of this.segFlash) if (now - t > 900) this.segFlash.delete(k);
    for (const p of this.pendingPuffs.filter((q) => now >= q.at)) {
      this.puffs.burst(now, 26, { pos: p.pos, speed: 0.07, life: 1.8, size: 0.06, grow: 2.6, tint: C.mist, alpha: 0.32 });
      this.atmosphere.part(p.pos, now, 0.6, 0.12);
    }
    this.pendingPuffs = this.pendingPuffs.filter((q) => now < q.at);

    this.sky.update(now, dt);
    this.clouds.update(dt);
    this.updateReveal(s, now);
    this.updateAtmosphere(s, now, dt);
    this.drawConstellation(s, now, dt);
    this.drawAttract(attract, now, dt);
    this.drawCreative(s, now, dt);
    this.updateEyes(s, now, dt);
    this.drawFx(s, now, dt);
    this.dust.update(now, dt);
    this.puffs.update(now, dt);
  }

  /**
   * The number is drawn only from the reveal on: it fades in over revealDisperseMs, stays through
   * IDLE, and is covered again as the clouds roll back in.
   */
  private updateReveal(s: GameState, now: number): void {
    const show = s.mode === 'REVEAL' || s.mode === 'IDLE';
    this.revealLayer.visible = show && !!this.revealNode;
    if (!show) return;
    const t = this.ctx.timing;
    if (s.mode === 'REVEAL') {
      const k = Math.min(1, (now - s.modeSince) / t.revealDisperseMs);
      this.revealLayer.alpha = k * k * (3 - 2 * k);
    } else {
      this.revealLayer.alpha = s.cloudsReturning ? 1 - this.clouds.density : 1;
    }
    this.revealGlow.alpha = 0.28 + 0.08 * Math.sin(now / 1300);
  }

  private updateAtmosphere(s: GameState, now: number, dt: number): void {
    const target = s.mode === 'INTRO' ? 1 : s.mode === 'GAME' ? 0.72 : s.mode === 'CREATIVE' ? 0.6 : 0.5;
    this.mist += (target - this.mist) * (1 - Math.exp(-dt / 1.6));
    const bump = 0.7 * Math.exp(-(now - this.mistBumpAt) / 1400);
    this.atmosphere.update(now, { mist: this.mist + bump });
  }

  // ── constellation ────────────────────────────────────────────

  /** A luminous, slightly wavy strand; `u` (0…1) makes it jitter, gap and thin out. */
  private strand(a: Vec, b: Vec, now: number, seed: number, o: { color: number; alpha: number; u?: number; hot?: number }): void {
    const g = this.strands;
    const u = o.u ?? 0;
    const len = dist(a, b);
    if (len < 1e-4) return;
    const n = Math.max(6, Math.min(90, Math.ceil(len / 0.01)));
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const time = now / 1000;
    const frame = Math.floor(now / 120);
    const pts: (Vec | null)[] = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const env = Math.sin(Math.PI * s);
      const wave = (0.0028 + u * 0.009) * env * Math.sin(2 * Math.PI * s * len * 5 - time * 1.7 + seed * 1.3);
      const jitter = u * 0.006 * env * Math.sin(time * 13 + i * 2.3 + seed) * hash(seed * 31 + i, frame);
      const gap = u > 0 && i < n && hash(seed * 97 + i, frame) < u * 0.5;
      pts.push(gap ? null : { x: a.x + (b.x - a.x) * s + nx * (wave + jitter), y: a.y + (b.y - a.y) * s + ny * (wave + jitter) });
    }
    const runs: Vec[][] = [];
    let run: Vec[] = [];
    for (const p of pts) {
      if (p) run.push(p);
      else {
        if (run.length > 1) runs.push(run);
        run = [];
      }
    }
    if (run.length > 1) runs.push(run);
    const strokes: [number, number, number][] = [
      [0.014 * (1 - 0.3 * u), o.color, 0.13 * o.alpha],
      [0.0034 * (1 - 0.35 * u), o.color, 0.9 * o.alpha],
    ];
    if ((o.hot ?? 0) > 0) strokes.push([0.0014, C.hot, 0.7 * (o.hot ?? 0) * o.alpha]);
    for (const [width, color, alpha] of strokes) {
      for (const r of runs) {
        g.moveTo(r[0].x, r[0].y);
        for (let i = 1; i < r.length; i++) g.lineTo(r[i].x, r[i].y);
        g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
      }
    }
  }

  private drawConstellation(s: GameState, now: number, dt: number): void {
    const g = this.strands;
    g.clear();
    const seq = this.ctx.sequence;
    const P = (id: number) => this.pos(id);
    const inGame = s.mode === 'GAME';

    let u = 0;
    let color = C.gold;
    let alpha = 1;
    let hot = 0.6;
    if (s.mode === 'REVEAL') {
      const t = (now - s.modeSince) / this.ctx.timing.revealDisperseMs;
      const flare = t < 0.1 ? t / 0.1 : Math.max(0, 1 - (t - 0.1) / 0.55);
      color = lerpColor(C.gold, C.hot, flare);
      alpha = flare;
      hot = flare;
    } else if (inGame && s.sub === 'LIFTED') {
      u = liftIntensity(s, now, this.ctx.timing.liftStrikeMs);
      color = lerpColor(C.gold, C.cold, u);
      alpha = 1 - 0.45 * u; // the mist creeps over the line
      hot = 0.6 * (1 - u);
      const pulse = Math.max(0, 1 - (now - this.strikePulseAt) / 500);
      if (pulse > 0) {
        color = lerpColor(color, C.hot, pulse);
        alpha = Math.min(1, alpha + 0.5 * pulse);
      }
    } else if (!inGame) {
      alpha = 0;
    }

    let segs = Math.max(0, s.progress - 1);
    let partial = 0;
    if (inGame && s.sub === 'COLLAPSE') {
      const t = Math.min(1, (now - s.subSince) / this.ctx.timing.collapseMs);
      const visible = Math.max(0, s.collapseFrom - 1) * (1 - easeOut(t * 0.9 + 0.1 * t * t));
      segs = Math.floor(visible);
      partial = visible - segs;
      color = lerpColor(C.gold, C.cold, Math.min(1, t * 2));
      hot = 0;
      if (segs + 1 < seq.length && (segs > 0 || partial > 0)) {
        const tip = lerpVec(P(seq[segs]), P(seq[segs + 1]), partial);
        if (Math.random() < dt * 40) this.dust.emit(now, { pos: tip, speed: 0.05, life: 0.8, size: 0.006, tint: C.cold });
      }
    }
    if (alpha > 0.001) {
      for (let i = 0; i < segs; i++) {
        const flash = this.segFlash.has(i) ? Math.max(0, 1 - (now - this.segFlash.get(i)!) / 900) : 0;
        this.strand(P(seq[i]), P(seq[i + 1]), now, i, { color: lerpColor(color, C.hot, flash), alpha: Math.min(1, alpha + flash * 0.5), u, hot: hot + flash });
      }
      if (partial > 0) this.strand(P(seq[segs]), lerpVec(P(seq[segs]), P(seq[segs + 1]), partial), now, segs, { color, alpha, hot: 0 });
    }

    // unsettled lines shed cold particles
    if (inGame && s.sub === 'LIFTED' && segs > 0 && Math.random() < dt * u * 45) {
      const i = Math.floor(Math.random() * segs);
      const pos = lerpVec(P(seq[i]), P(seq[i + 1]), Math.random());
      this.dust.emit(now, { pos, speed: 0.03, life: 1.4, size: 0.006, tint: C.cold, alpha: 0.7, drift: { x: 0, y: 0.01 } });
    }

    // tether: live to the finger, or hanging where it lifted
    if (inGame && s.tether && s.progress > 0 && (s.sub === 'TRACING' || s.sub === 'LIFTED')) {
      const last = P(seq[s.progress - 1]);
      if (s.sub === 'TRACING') {
        this.liveTether(last, s.tether, now, dt);
      } else {
        this.strand(last, s.tether, now, 77, { color, alpha: alpha * 0.8, u, hot: 0 });
      }
    }

    for (const r of this.retracts) {
      const t = Math.min(1, (now - r.start) / r.dur);
      const to = P(r.to);
      const tip = lerpVec(r.from, to, easeOutElastic(t));
      this.strand(to, tip, now, 88, { color: C.cold, alpha: 0.85 * (1 - t * 0.5), hot: 0 });
      circle(g, tip.x, tip.y, 0.006 + 0.01 * (1 - t)).fill({ color: C.hot, alpha: 1 - t });
      if (Math.random() < dt * 60) this.dust.emit(now, { pos: tip, speed: 0.08, life: 0.5, size: 0.005, tint: C.hot });
    }
  }

  /** The tether from the last point to the finger, shedding stardust. */
  private liveTether(from: Vec, finger: Vec, now: number, dt: number): void {
    this.strand(from, finger, now, 77, { color: C.hot, alpha: 0.85, hot: 1 });
    const n = Math.random() < (dt * 70) % 1 ? Math.ceil(dt * 70) : Math.floor(dt * 70);
    for (let k = 0; k < n; k++) {
      const pos = lerpVec(from, finger, Math.random());
      this.dust.emit(now, { pos, speed: 0.025, life: 1.1, size: 0.0065, tint: Math.random() < 0.5 ? C.gold : C.hot, alpha: 0.9 });
    }
  }

  /** INTRO attract demo: the line grows A → B → C, then its tail follows from A to C. */
  private drawAttract(v: AttractView | null, now: number, dt: number): void {
    if (!v) return;
    const [a, b, c] = v.points.map((id) => this.pos(id));
    const at = (x: number) => (x <= 1 ? lerpVec(a, b, x) : lerpVec(b, c, x - 1));
    if (v.tail < 1 && v.head > v.tail) this.strand(at(v.tail), at(Math.min(1, v.head)), now, 201, { color: C.gold, alpha: 0.95, hot: 0.6 });
    if (v.head > 1 && v.head > Math.max(1, v.tail)) this.strand(at(Math.max(1, v.tail)), at(v.head), now, 202, { color: C.gold, alpha: 0.95, hot: 0.6 });
    if (v.head < 2) {
      const tip = at(v.head);
      circle(this.strands, tip.x, tip.y, 0.006).fill({ color: C.hot, alpha: 0.9 });
    }
    if (v.tail > 0 && Math.random() < dt * 45) {
      this.dust.emit(now, { pos: at(v.tail), speed: 0.04, life: 0.9, size: 0.006, tint: C.gold, alpha: 0.8 });
    }
  }

  /** Creative mode: pitch-coloured strands that dissolve after the finger lifts, plus the live tether. */
  private drawCreative(s: GameState, now: number, dt: number): void {
    const fadeMs = this.ctx.timing.creativeFadeMs;
    this.creativeLinks = this.creativeLinks.filter((l) => l.fadeAt === null || now - l.fadeAt < fadeMs);
    for (const l of this.creativeLinks) {
      const u = l.fadeAt === null ? 0 : Math.min(1, (now - l.fadeAt) / fadeMs);
      const tone = ((this.pitch.get(l.from) ?? 0.5) + (this.pitch.get(l.to) ?? 0.5)) / 2;
      const color = lerpColor(C.lavender, C.gold, tone);
      const from = this.pos(l.from);
      const to = this.pos(l.to);
      this.strand(from, to, now, l.seed, { color, alpha: 1 - u, u, hot: 0.5 * (1 - u) });
      if (u > 0 && Math.random() < dt * 14 * (1 - u)) {
        this.dust.emit(now, { pos: lerpVec(from, to, Math.random()), speed: 0.03, life: 1.2, size: 0.006, tint: color, alpha: 0.7, drift: { x: 0, y: 0.01 } });
      }
    }
    if (s.mode === 'CREATIVE' && s.tether && s.chain.length > 0) {
      this.liveTether(this.pos(s.chain[s.chain.length - 1]), s.tether, now, dt);
    }
  }

  // ── eyes ─────────────────────────────────────────────────────

  private updateEyes(s: GameState, now: number, dt: number): void {
    const seq = this.ctx.sequence;
    const inGame = s.mode === 'GAME';
    const awake = new Set<number>();
    if (inGame && (s.sub === 'TRACING' || s.sub === 'LIFTED')) for (let i = 0; i < s.progress; i++) awake.add(seq[i]);
    if (s.mode === 'CREATIVE') for (const id of s.chain) awake.add(id);
    const readyStart = inGame && s.sub === 'READY' ? seq[0] : null;
    // during the "get ready" notice every eye glows up with the breath, as if the table holds it
    const notice = noticeProgress(s, now);
    const held = notice === null ? 0 : smooth((notice - NOTICE.inhale[0]) / (NOTICE.inhale[1] - NOTICE.inhale[0])) * (1 - smooth((notice - 0.9) / 0.1));

    for (const eye of this.eyes.values()) {
      const id = eye.id;
      const look: EyeLook = {
        open: 0,
        closeTc: 0.16,
        glow: 0.1 + 0.05 * Math.sin(now / 1700 + id * 1.3),
        glowColor: C.lavender,
        shudder: 0,
      };
      if (held > 0) {
        look.glow = Math.max(look.glow, 0.1 + 0.4 * held);
        look.glowColor = lerpColor(C.lavender, C.gold, held);
      }
      if (awake.has(id)) {
        look.open = 0.42;
        look.glow = 0.32;
        look.glowColor = C.gold;
      }
      if (id === readyStart) {
        look.glow = 0.2 + 0.32 * (0.5 + 0.5 * Math.sin(now / 700));
        look.glowColor = C.gold;
      }
      for (const b of this.blinks) {
        if (b.point !== id) continue;
        const t = (now - b.start) / b.dur;
        if (t < b.hold) look.open = 1;
        look.closeTc = b.closeTc;
        look.glow = Math.max(look.glow, 1 - t * 0.85);
        look.glowColor = lerpColor(C.gold, C.hot, 1 - t);
      }
      const fl = this.flinches.find((f) => f.point === id);
      if (fl) {
        const t = (now - fl.start) / fl.dur;
        look.open = 0;
        look.closeTc = 0.03;
        look.shudder = 0.006 * (1 - t);
        look.glow = 0.5 * (1 - t);
        look.glowColor = C.violet;
      }
      eye.update(now, dt, look);
    }
  }

  // ── fx, notice and buttons ───────────────────────────────────

  private drawFx(s: GameState, now: number, dt: number): void {
    const g = this.fx;
    g.clear();
    for (const r of this.rings) {
      const t = (now - r.start) / r.dur;
      if (t < 0) continue;
      const rad = r.from + (r.to - r.from) * easeOut(t);
      circle(g, r.pos.x, r.pos.y, rad).stroke({ width: r.width * 3, color: r.color, alpha: r.alpha * 0.18 * (1 - t) });
      circle(g, r.pos.x, r.pos.y, rad).stroke({ width: r.width, color: r.color, alpha: r.alpha * (1 - t) });
    }
    this.drawNotice(s, now);
    this.drawOutro(now);
    if (this.markUnused) this.drawUnusedMarks();

    this.drawMaster(s.mode === 'GAME' && s.sub === 'READY', now, dt);
    this.drawCreativeButton((s.mode === 'GAME' && s.sub === 'READY') || s.mode === 'CREATIVE', now, dt);
  }

  /**
   * Creative-mode button: three stars joined into a small constellation inside a ring of light. It
   * breathes in READY (way in) and in CREATIVE (way out); ~8 % elsewhere. Drawn after drawMaster,
   * which clears the shared Graphics.
   */
  private drawCreativeButton(active: boolean, now: number, dt: number): void {
    const target = active ? 0.62 + 0.3 * Math.sin(now / 900 + 1.6) : 0.08;
    this.creativeAlpha += (target - this.creativeAlpha) * (1 - Math.exp(-dt / 0.35));
    const a = this.creativeAlpha;
    const { pos, r } = this.ctx.creative;
    const g = this.master;
    const col = C.lavender;
    circle(g, pos.x, pos.y, r).stroke({ width: 0.012, color: col, alpha: 0.14 * a });
    circle(g, pos.x, pos.y, r).stroke({ width: 0.003, color: col, alpha: a });
    const stars = [-90, 30, 150].map((deg, i) => {
      const ang = ((deg + 8 * Math.sin(now / 1400 + i)) * Math.PI) / 180;
      return { x: pos.x + Math.cos(ang) * r * 0.5, y: pos.y + Math.sin(ang) * r * 0.5 };
    });
    g.moveTo(stars[0].x, stars[0].y).lineTo(stars[1].x, stars[1].y).lineTo(stars[2].x, stars[2].y).stroke({ width: 0.0022, color: C.gold, alpha: 0.8 * a });
    for (const st of stars) {
      circle(g, st.x, st.y, 0.14 * r).fill({ color: C.gold, alpha: 0.35 * a });
      circle(g, st.x, st.y, 0.07 * r).fill({ color: C.hot, alpha: a });
    }
  }

  /**
   * "Get ready" before the first demo blink (text-free, readable from every side): a wide ring of light
   * over the constellation slowly contracts and brightens — breathe in — then three soft pulses ripple
   * out from the centre, and the demo starts.
   */
  private drawNotice(s: GameState, now: number): void {
    const p = noticeProgress(s, now);
    if (p === null) return;
    const g = this.fx;
    const c = this.centre;
    const [i0, i1] = NOTICE.inhale;
    const inhale = smooth((p - i0) / (i1 - i0));
    const a = smooth(p / i0) * (1 - smooth((p - 0.9) / 0.1));
    const rad = 0.42 + (0.07 - 0.42) * inhale;
    const time = now / 1000;
    // slight organic wobble, so the rings aren't perfectly even (glow and core share the shape)
    wobblyCircle(g, c.x, c.y, rad, 0.035, time, 1).stroke({ width: 0.016, color: C.gold, alpha: 0.12 * a * (0.4 + inhale) });
    wobblyCircle(g, c.x, c.y, rad, 0.035, time, 1).stroke({ width: 0.0035, color: C.gold, alpha: (0.25 + 0.6 * inhale) * a });
    wobblyCircle(g, c.x, c.y, 0.02 + 0.025 * inhale, 0.08, time * 1.6, 2).fill({ color: C.hot, alpha: 0.5 * inhale * a });
    NOTICE.pulses.forEach((pk, i) => {
      const tp = ((p - pk) * s.demoLeadMs) / 500;
      if (tp < 0 || tp > 1) return;
      const r = 0.07 + 0.22 * easeOut(tp);
      wobblyCircle(g, c.x, c.y, r, 0.04, time, 3 + i).stroke({ width: 0.012, color: C.hot, alpha: 0.18 * (1 - tp) });
      wobblyCircle(g, c.x, c.y, r, 0.04, time, 3 + i).stroke({ width: 0.004, color: C.hot, alpha: 0.85 * (1 - tp) });
    });
  }

  private drawUnusedMarks(): void {
    const g = this.fx;
    for (const p of this.ctx.points) {
      if (this.ctx.sequence.includes(p.id)) continue;
      const { x, y } = p.pos;
      const r = p.r * 1.25;
      const d = r * 0.7;
      circle(g, x, y, r).stroke({ width: 0.004, color: 0xff4040, alpha: 0.9 });
      g.moveTo(x - d, y - d).lineTo(x + d, y + d).moveTo(x + d, y - d).lineTo(x - d, y + d).stroke({ width: 0.004, color: 0xff4040, alpha: 0.9 });
    }
  }

  /** After the demo's last blink: the breath goes out (a wobbling ring expands from the centre and fades). */
  private drawOutro(now: number): void {
    if (!this.outro) return;
    const t = (now - this.outro.start) / this.outro.dur;
    if (t < 0 || t >= 1) {
      if (t >= 1) this.outro = null;
      return;
    }
    const g = this.fx;
    const c = this.centre;
    const time = now / 1000;
    const out = easeOut(t);
    const fade = 1 - smooth(t);
    wobblyCircle(g, c.x, c.y, 0.07 + 0.38 * out, 0.035, time, 7).stroke({ width: 0.016, color: C.gold, alpha: 0.14 * fade });
    wobblyCircle(g, c.x, c.y, 0.07 + 0.38 * out, 0.035, time, 7).stroke({ width: 0.0035, color: C.gold, alpha: 0.75 * fade });
    wobblyCircle(g, c.x, c.y, 0.045 * (1 - out) + 0.005, 0.08, time * 1.6, 2).fill({ color: C.hot, alpha: 0.5 * fade });
  }

  /** A stylized eye inside a thin ring of light; breathes in READY, ~8 % elsewhere. */
  private drawMaster(active: boolean, now: number, dt: number): void {
    const target = active ? 0.62 + 0.3 * Math.sin(now / 900) : 0.08;
    this.masterAlpha += (target - this.masterAlpha) * (1 - Math.exp(-dt / 0.35));
    const a = this.masterAlpha;
    const { pos, r } = this.ctx.master;
    const g = this.master;
    g.clear();
    circle(g, pos.x, pos.y, r).stroke({ width: 0.012, color: C.gold, alpha: 0.14 * a });
    circle(g, pos.x, pos.y, r).stroke({ width: 0.003, color: C.gold, alpha: a });
    almond(g, pos.x, pos.y, 0.62 * r, 0.3 * r).stroke({ width: 0.0028, color: C.gold, alpha: a });
    circle(g, pos.x, pos.y, 0.2 * r).fill({ color: C.gold, alpha: 0.5 * a });
    circle(g, pos.x, pos.y, 0.09 * r).fill({ color: C.hot, alpha: a });
  }
}
