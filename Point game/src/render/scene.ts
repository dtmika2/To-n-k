import { Assets, Container, Graphics, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
import type { AttractView } from '../game/attract.ts';
import { NOTICE, noticeProgress, noticeSpanMs } from '../config/notice.ts';
import { liftIntensity } from '../game/reducer.ts';
import type { Effect, GameContext, GameState } from '../game/types.ts';
import { lerpVec } from '../pattern/geometry.ts';
import { noteToMidi } from '../pattern/notes.ts';
import { ASPECT, type Pattern, type Vec } from '../pattern/types.ts';
import { Atmosphere } from './atmosphere.ts';
import { CloudCover, type CloudConfig } from './clouds.ts';
import type { RevealConfig } from './debugRenderer.ts';
import { almond, circle, easeOut, easeOutElastic, lerpColor, smooth, wobblyCircle } from './draw.ts';
import { Eye, type EyeLook } from './eye.ts';
import { Particles } from './particles.ts';
import { Sky } from './sky.ts';
import { softDotTexture } from './textures.ts';
import { beamStrand, strandRuns, strokeStrand, type StrandStyle } from './strand.ts';
import { BeamBatch } from './vfx/beam.ts';
import { LidLightBatch } from './vfx/lidLight.ts';
import { EnergyOrb } from './vfx/orb.ts';
import { RingBatch } from './vfx/ring.ts';

const C = {
  gold: 0xf3d99a,
  hot: 0xfffbe8,
  cold: 0x7d8aa6,
  violet: 0xa060ff,
  lavender: 0x8f84ff,
  mist: 0xb8b8e0,
};

/**
 * vfx look: rings are lavender with a full soft fill and no dashes, except the eye rings (gold in both
 * looks) and the touch ripple (gold here). Beams and the rest keep their colours.
 */
const VFX_RING = { color: C.lavender, fill: 1 };

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
  /** Colour in the vfx look. */
  vfxColor: number;
}
interface Retract extends Anim {
  from: Vec;
  to: number;
}

/** The two visual looks, chosen per session (`?look=`, L key); see settings.display.look. */
export type Look = 'classic' | 'vfx';

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
 * animations. The "vfx" look swaps primitives for shaders: the iris and lids (eye.ts, the lids into
 * lidLight), the strands (beams), the rings and the notice centre; everything else is shared.
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
  private readonly beams = new BeamBatch();
  private readonly ringFx = new RingBatch();
  /** vfx look: every eye's lids and lashes as light (eye.ts draws into it). */
  private readonly lidLight = new LidLightBatch();
  /** vfx look: the gathering orb at the centre of the "get ready" notice. */
  private readonly orb = new EnergyOrb(C.gold, C.hot);
  /** Index of the last notice pulse that burst sparks (vfx look). */
  private noticeBurst = -1;
  /** Whether the outro's opening spark burst has fired (vfx look). */
  private outroBurst = false;
  private look: Look = 'classic';

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
    // scaled about the screen centre, so the number recedes into the distance there
    this.revealLayer.pivot.set(0.5, ASPECT / 2);
    this.revealLayer.position.set(0.5, ASPECT / 2);
    this.clouds = new CloudCover(cfg.clouds);
    this.atmosphere = new Atmosphere(pixi, this.softDot, cfg.octaves);
    this.strands.blendMode = 'add';
    this.fx.blendMode = 'add';
    this.dust = new Particles(this.dot, 600, 'add');
    this.puffs = new Particles(this.softDot, 120, 'normal');
    this.root.addChild(
      this.sky.root,
      this.clouds.root,
      this.atmosphere.sprite,
      this.puffs.container,
      this.strands,
      this.beams.mesh,
      this.dust.container,
      this.eyesLayer,
      this.lidLight.mesh,
      this.revealLayer,
      this.master,
      this.ringFx.mesh,
      this.orb.mesh,
      this.fx,
    );
  }

  setLook(look: Look): void {
    this.look = look;
  }

  private get vfx(): boolean {
    return this.look === 'vfx';
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
      eye.lidLight = this.lidLight;
      eye.sparks = this.dust;
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

  /** Gold rings (the eye rings) stay gold in the vfx look; the others turn lavender unless `vfxColor` says otherwise. */
  private ring(now: number, pos: Vec, opts: Partial<Ring> & { to: number }): void {
    const color = opts.color ?? C.gold;
    const vfxColor = color === C.gold ? C.gold : VFX_RING.color;
    this.rings.push({ start: now, dur: 800, pos, color, from: 0, width: 0.004, alpha: 0.8, vfxColor, ...opts });
  }

  /** A touch: the mist ripples and parts. */
  ripple(pos: Vec, now: number): void {
    this.atmosphere.part(pos, now, 1, 0.1);
    this.ring(now, pos, { to: 0.11, dur: 1100, color: C.mist, vfxColor: C.gold, alpha: 0.35, width: 0.003 });
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
        this.outroBurst = false;
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
        if (this.clouds.shrouded) this.clouds.part(this.centre, 1200); // debug jumps straight here
        break;
      case 'creativeStart':
        // opened from INTRO: the clouds part from the button; debug jumps land here shrouded too
        if (this.clouds.shrouded) this.clouds.part(e.at ?? this.centre, e.at ? this.cfg.clouds.partMs : 1200);
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

    this.beams.begin();
    this.ringFx.begin(now);
    this.lidLight.begin();
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
    this.beams.end(now);
    this.ringFx.end();
    this.lidLight.end(now);
  }

  /**
   * The number is drawn above the eyes, only from the reveal on: it fades in over revealDisperseMs,
   * then through IDLE it slowly shrinks and fades into the distance, gone as the clouds close again.
   */
  private updateReveal(s: GameState, now: number): void {
    const show = s.mode === 'REVEAL' || s.mode === 'IDLE';
    this.revealLayer.visible = show && !!this.revealNode;
    if (!show) return;
    const t = this.ctx.timing;
    if (s.mode === 'REVEAL') {
      this.revealLayer.alpha = smooth((now - s.modeSince) / t.revealDisperseMs);
      this.revealLayer.scale.set(1);
    } else {
      const k = Math.min(1, (now - s.modeSince) / (t.revealHoldMs + t.cloudsReturnMs));
      this.revealLayer.scale.set(1 - 0.7 * smooth(k));
      this.revealLayer.alpha = 1 - smooth((k - 0.15) / 0.8);
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

  /** A luminous, slightly wavy strand (a beam in the vfx look); `u` (0…1) makes it jitter, gap and thin out. */
  private strand(a: Vec, b: Vec, now: number, seed: number, o: StrandStyle): void {
    const runs = strandRuns(a, b, now, seed, o.u ?? 0, !this.vfx);
    if (this.vfx) beamStrand(this.beams, a, b, runs, seed, o);
    else strokeStrand(this.strands, runs, o);
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
      eye.update(now, dt, look, this.vfx);
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
      if (this.vfx) {
        this.ringFx.add(r.pos.x, r.pos.y, rad, { color: r.vfxColor, alpha: r.alpha * (1 - t), width: r.width * 0.5, fill: VFX_RING.fill * (1 - t) });
        continue;
      }
      circle(g, r.pos.x, r.pos.y, rad).stroke({ width: r.width * 3, color: r.color, alpha: r.alpha * 0.18 * (1 - t) });
      circle(g, r.pos.x, r.pos.y, rad).stroke({ width: r.width, color: r.color, alpha: r.alpha * (1 - t) });
    }
    this.drawNotice(s, now, dt);
    this.drawOutro(now, dt);
    if (this.markUnused) this.drawUnusedMarks();

    const ready = s.mode === 'GAME' && s.sub === 'READY';
    this.drawMaster(ready || (s.mode === 'GAME' && s.sub === 'LIFTED' && s.progress === 1), now, dt);
    this.drawCreativeButton(ready || s.mode === 'CREATIVE' || s.mode === 'INTRO', now, dt);
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
    if (this.vfx) {
      this.ringFx.add(pos.x, pos.y, r, { color: VFX_RING.color, alpha: a, width: 0.0016, fill: VFX_RING.fill });
    } else {
      circle(g, pos.x, pos.y, r).stroke({ width: 0.012, color: col, alpha: 0.14 * a });
      circle(g, pos.x, pos.y, r).stroke({ width: 0.003, color: col, alpha: a });
    }
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
  private drawNotice(s: GameState, now: number, dt: number): void {
    const p = noticeProgress(s, now);
    this.orb.hide();
    if (p === null) return;
    const g = this.fx;
    const c = this.centre;
    const [i0, i1] = NOTICE.inhale;
    const inhale = smooth((p - i0) / (i1 - i0));
    const a = smooth(p / i0) * (1 - smooth((p - 0.9) / 0.1));
    const rad = 0.42 + (0.07 - 0.42) * inhale;
    const time = now / 1000;
    // slight organic wobble, so the rings aren't perfectly even (glow and core share the shape)
    if (this.vfx) {
      this.ringFx.add(c.x, c.y, rad, { color: VFX_RING.color, alpha: (0.25 + 0.6 * inhale) * a, width: 0.002, wobble: 0.035, seed: 1, fill: VFX_RING.fill * inhale });
    } else {
      wobblyCircle(g, c.x, c.y, rad, 0.035, time, 1).stroke({ width: 0.016, color: C.gold, alpha: 0.12 * a * (0.4 + inhale) });
      wobblyCircle(g, c.x, c.y, rad, 0.035, time, 1).stroke({ width: 0.0035, color: C.gold, alpha: (0.25 + 0.6 * inhale) * a });
    }
    if (this.vfx) this.noticeOrb(s, p, inhale, a, rad, now, dt);
    else wobblyCircle(g, c.x, c.y, 0.02 + 0.025 * inhale, 0.08, time * 1.6, 2).fill({ color: C.hot, alpha: 0.5 * inhale * a });
    NOTICE.pulses.forEach((pk, i) => {
      const tp = ((p - pk) * noticeSpanMs(s.demoLeadMs)) / 500;
      if (tp < 0 || tp > 1) return;
      const r = 0.07 + 0.22 * easeOut(tp);
      if (this.vfx) {
        this.ringFx.add(c.x, c.y, r, { color: VFX_RING.color, alpha: 0.85 * (1 - tp), width: 0.002, wobble: 0.04, seed: 3 + i, fill: VFX_RING.fill * (1 - tp) });
        return;
      }
      wobblyCircle(g, c.x, c.y, r, 0.04, time, 3 + i).stroke({ width: 0.012, color: C.hot, alpha: 0.18 * (1 - tp) });
      wobblyCircle(g, c.x, c.y, r, 0.04, time, 3 + i).stroke({ width: 0.004, color: C.hot, alpha: 0.85 * (1 - tp) });
    });
  }

  /**
   * vfx look, the notice's centre: an energy orb that gathers as the ring contracts. Sparks stream in
   * from the ring, swirling slightly; each pulse flares the orb and bursts sparks outward.
   */
  private noticeOrb(s: GameState, p: number, inhale: number, a: number, rad: number, now: number, dt: number): void {
    const c = this.centre;
    let flare = 0;
    if (p < NOTICE.pulses[0]) this.noticeBurst = -1;
    NOTICE.pulses.forEach((pk, i) => {
      const tp = ((p - pk) * noticeSpanMs(s.demoLeadMs)) / 500;
      if (tp < 0 || tp > 1) return;
      flare = Math.max(flare, 1 - tp);
      if (this.noticeBurst < i) {
        this.noticeBurst = i;
        this.dust.burst(now, 22, { pos: c, speed: 0.32, life: 0.6, size: 0.008, tint: i === NOTICE.pulses.length - 1 ? C.hot : C.gold });
      }
    });
    this.orb.show(now, c.x, c.y, 0.045 + 0.05 * inhale + 0.03 * flare, a * (0.2 + 0.55 * inhale) + 0.45 * flare * a);

    // sparks drawn in from the contracting ring: they start on it and reach the centre as they fade
    const rate = 110 * inhale * a * (1 - smooth((p - NOTICE.pulses[0]) / 0.05));
    const n = Math.floor(rate * dt) + (Math.random() < (rate * dt) % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const r0 = rad * (0.9 + Math.random() * 0.2);
      const life = 0.7;
      const v = (r0 / life) * 1.3; // particles drag, so start faster to arrive
      const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
      this.dust.emit(now, {
        pos: { x: c.x + ux * r0, y: c.y + uy * r0 },
        speed: 0,
        life,
        size: 0.009,
        grow: 0.35,
        tint: Math.random() < 0.6 ? C.gold : C.hot,
        drift: { x: -ux * v - uy * v * 0.35, y: -uy * v + ux * v * 0.35 },
      });
    }
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

  /** After the demo's last blink: the breath goes out (a wobbling ring expands from the centre and fades); the notice in reverse. */
  private drawOutro(now: number, dt: number): void {
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
    if (this.vfx) {
      this.outroOrb(now, dt, t, out, fade);
      return;
    }
    wobblyCircle(g, c.x, c.y, 0.07 + 0.38 * out, 0.035, time, 7).stroke({ width: 0.016, color: C.gold, alpha: 0.14 * fade });
    wobblyCircle(g, c.x, c.y, 0.07 + 0.38 * out, 0.035, time, 7).stroke({ width: 0.0035, color: C.gold, alpha: 0.75 * fade });
    wobblyCircle(g, c.x, c.y, 0.045 * (1 - out) + 0.005, 0.08, time * 1.6, 2).fill({ color: C.hot, alpha: 0.5 * fade });
  }

  /**
   * vfx look, the outro as the notice in reverse: the same ring (shape, colour, fill) expands from where
   * the inhale left it, the orb shrinks away, and its sparks scatter outward with the ring.
   */
  private outroOrb(now: number, dt: number, t: number, out: number, fade: number): void {
    const c = this.centre;
    const rad = 0.07 + 0.38 * out;
    this.ringFx.add(c.x, c.y, rad, { color: VFX_RING.color, alpha: 0.85 * fade, width: 0.002, wobble: 0.035, seed: 1, fill: VFX_RING.fill * fade });
    this.orb.show(now, c.x, c.y, 0.095 * (1 - out) + 0.01, 0.75 * fade);
    if (!this.outroBurst) {
      this.outroBurst = true;
      this.dust.burst(now, 26, { pos: c, speed: 0.4, life: 0.8, size: 0.009, grow: 0.35, tint: C.gold });
    }
    // sparks released from the shrinking orb ride out towards the ring
    const rate = 110 * (1 - t) * fade;
    const n = Math.floor(rate * dt) + (Math.random() < (rate * dt) % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
      const v = 0.35 + Math.random() * 0.2;
      this.dust.emit(now, {
        pos: { x: c.x + ux * 0.01, y: c.y + uy * 0.01 },
        speed: 0,
        life: 0.7,
        size: 0.009,
        grow: 0.35,
        tint: Math.random() < 0.6 ? C.gold : C.hot,
        drift: { x: ux * v + uy * v * 0.35, y: uy * v - ux * v * 0.35 },
      });
    }
  }

  /** A stylized eye inside a thin ring of light; breathes in READY, ~8 % elsewhere. */
  private drawMaster(active: boolean, now: number, dt: number): void {
    const target = active ? 0.62 + 0.3 * Math.sin(now / 900) : 0.08;
    this.masterAlpha += (target - this.masterAlpha) * (1 - Math.exp(-dt / 0.35));
    const a = this.masterAlpha;
    const { pos, r } = this.ctx.master;
    const g = this.master;
    g.clear();
    if (this.vfx) {
      this.ringFx.add(pos.x, pos.y, r, { color: VFX_RING.color, alpha: a, width: 0.0016, fill: VFX_RING.fill });
    } else {
      circle(g, pos.x, pos.y, r).stroke({ width: 0.012, color: C.gold, alpha: 0.14 * a });
      circle(g, pos.x, pos.y, r).stroke({ width: 0.003, color: C.gold, alpha: a });
    }
    almond(g, pos.x, pos.y, 0.62 * r, 0.3 * r).stroke({ width: 0.0028, color: C.gold, alpha: a });
    circle(g, pos.x, pos.y, 0.2 * r).fill({ color: C.gold, alpha: 0.5 * a });
    circle(g, pos.x, pos.y, 0.09 * r).fill({ color: C.hot, alpha: a });
  }
}
