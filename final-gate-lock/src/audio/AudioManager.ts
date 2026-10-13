/**
 * Small Web Audio manager (PLAN §7).
 * - Decodes every cue at boot (allowed before a gesture); resumes the context on the first tap.
 * - Missing or undecodable file → that variant is silent (warned once per cue), or a synthesised
 *   placeholder when `?placeholderSfx` is on.
 * - Variants are picked at random without immediate repeats.
 * - Two buses: ambience (loops; ducked at success) and effects.
 */
import { CUES, type Cue, type Sfx } from './sfx';
import { fileNames, synthesize } from './placeholder';
import { pickNoRepeat } from '../util/random';

type Ctx = AudioContext;

interface LoopState {
  /** Playing and queued sources (an alternating loop keeps the next run queued ahead). */
  srcs: Set<AudioBufferSourceNode>;
  gain: GainNode;
  stopped: boolean;
  /** Alternating loops: when the last queued run ends. */
  nextAt: number;
}

/** Max simultaneous voices per cue (rapid ticks shouldn't pile up). */
const MAX_VOICES: Partial<Record<Cue, number>> = { drag_tick: 4, detent_click: 6, arrow_tap: 4, eye_blink: 4, spin_ratchet: 4, lock_clunk: 8 };

/** Loop level relative to the file (default 1). */
const LOOP_VOLUME: Partial<Record<Cue, number>> = { eye_loop: 0.25 };

/** Alternating loops: one variant repeats a random number of times in [min, max], then fades out and the next starts. */
const LOOP_REPEATS: Partial<Record<Cue, readonly [number, number]>> = { eye_loop: [3, 8] };
/** Fade-out at the end of each alternating run (s). */
const RUN_FADE_S = 1;

export class AudioManager implements Sfx {
  readonly ctx: Ctx | null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private fx: GainNode | null = null;
  private buffers = new Map<Cue, (AudioBuffer | null)[]>();
  private lastVariant = new Map<Cue, number>();
  private voices = new Map<Cue, number>();
  private loops = new Map<Cue, LoopState>();
  private wantLoops = new Set<Cue>();
  private warned = new Set<Cue>();
  private ducked = false;
  /** Diagnostics: cues played (bounded), loaded sources per cue. */
  readonly played: Cue[] = [];
  readonly sources: Partial<Record<Cue, ('file' | 'placeholder' | 'missing')[]>> = {};
  loaded = false;

  constructor(
    private volume: number,
    private placeholders: boolean,
    private baseUrl = 'sfx/',
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {
    let ctx: Ctx | null = null;
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
    } catch (e) {
      console.warn('[audio] Web Audio unavailable; running silent', e);
    }
    this.ctx = ctx;
    if (ctx) {
      this.master = ctx.createGain();
      this.master.gain.value = volume;
      this.master.connect(ctx.destination);
      this.ambience = ctx.createGain();
      this.ambience.connect(this.master);
      this.fx = ctx.createGain();
      this.fx.connect(this.master);
    }
  }

  /** Decode everything. Never throws. */
  async load(): Promise<void> {
    const ctx = this.ctx;
    await Promise.all(
      (Object.keys(CUES) as Cue[]).map(async (cue) => {
        const variants = CUES[cue].variants;
        const names = fileNames(cue, variants);
        const list: (AudioBuffer | null)[] = [];
        const src: ('file' | 'placeholder' | 'missing')[] = [];
        for (let v = 0; v < names.length; v++) {
          let buffer: AudioBuffer | null = null;
          if (ctx) {
            for (const name of names[v]) {
              buffer = await this.tryDecode(ctx, this.baseUrl + name);
              if (buffer) break;
            }
          }
          if (buffer) src.push('file');
          else if (this.placeholders && ctx) {
            const s = synthesize(cue, v, ctx.sampleRate);
            buffer = ctx.createBuffer(1, s.samples.length, s.sampleRate);
            buffer.copyToChannel(s.samples as Float32Array<ArrayBuffer>, 0);
            src.push('placeholder');
          } else src.push('missing');
          list.push(buffer);
        }
        this.buffers.set(cue, list);
        this.sources[cue] = src;
        if (src.includes('missing')) this.warnOnce(cue, `[audio] no file for "${cue}" in ${this.baseUrl} — silent`);
      }),
    );
    this.loaded = true;
    // start any loops requested before loading finished
    for (const cue of this.wantLoops) this.startLoop(cue, 400);
  }

  private async tryDecode(ctx: Ctx, url: string): Promise<AudioBuffer | null> {
    try {
      const res = await this.fetchFn(url);
      if (!res.ok) return null;
      const type = res.headers.get('content-type') ?? '';
      if (type.includes('text/html')) return null; // SPA fallback, not audio
      const data = await res.arrayBuffer();
      if (data.byteLength < 16) return null;
      return await ctx.decodeAudioData(data);
    } catch {
      return null;
    }
  }

  private warnOnce(cue: Cue, msg: string) {
    if (this.warned.has(cue)) return;
    this.warned.add(cue);
    console.warn(msg);
  }

  unlock(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  setMasterVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  get masterVolume(): number {
    return this.volume;
  }

  private pick(cue: Cue): AudioBuffer | null {
    const list = this.buffers.get(cue);
    if (!list || list.length === 0) return null;
    const available = list.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    if (available.length === 0) return null;
    const last = available.indexOf(this.lastVariant.get(cue) ?? -1);
    const k = pickNoRepeat(Math.random, available.length, last);
    this.lastVariant.set(cue, available[k]);
    return list[available[k]];
  }

  play(cue: Cue, opts: { volume?: number; rate?: number } = {}): void {
    this.played.push(cue);
    if (this.played.length > 500) this.played.splice(0, this.played.length - 500);
    const ctx = this.ctx;
    if (!ctx || !this.fx || ctx.state !== 'running') return;
    const max = MAX_VOICES[cue] ?? 8;
    if ((this.voices.get(cue) ?? 0) >= max) return;
    const buffer = this.pick(cue);
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g).connect(this.fx);
    this.voices.set(cue, (this.voices.get(cue) ?? 0) + 1);
    src.onended = () => {
      this.voices.set(cue, Math.max(0, (this.voices.get(cue) ?? 1) - 1));
      g.disconnect();
    };
    src.start();
  }

  loop(cue: Cue, on: boolean, fadeMs = 800): void {
    if (on) {
      this.wantLoops.add(cue);
      this.startLoop(cue, fadeMs);
    } else {
      this.wantLoops.delete(cue);
      this.stopLoop(cue, fadeMs);
    }
  }

  private startLoop(cue: Cue, fadeMs: number) {
    const ctx = this.ctx;
    if (!ctx || !this.ambience || this.loops.has(cue)) return;
    const g = ctx.createGain();
    const l: LoopState = { srcs: new Set(), gain: g, stopped: false, nextAt: ctx.currentTime };
    const repeats = LOOP_REPEATS[cue];
    if (repeats) {
      // queue two runs; each run that ends queues the next, so one is always waiting
      if (!this.queueRun(cue, l, repeats) || !this.queueRun(cue, l, repeats)) return;
    } else {
      const buffer = this.pick(cue);
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(g);
      src.start();
      l.srcs.add(src);
    }
    g.gain.value = 0;
    g.gain.setTargetAtTime(LOOP_VOLUME[cue] ?? 1, ctx.currentTime, fadeMs / 3000);
    g.connect(this.ambience);
    this.loops.set(cue, l);
  }

  /**
   * Alternating loop: one variant played `repeats` times back to back, then faded out over
   * RUN_FADE_S (the variants don't join seamlessly); the next run starts once it is silent.
   */
  private queueRun(cue: Cue, l: LoopState, [min, max]: readonly [number, number]): boolean {
    const ctx = this.ctx!;
    const buffer = this.pick(cue);
    if (!buffer) return false;
    const n = min + Math.floor(Math.random() * (max - min + 1));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const fade = ctx.createGain();
    src.connect(fade).connect(l.gain);
    const start = l.nextAt;
    const fadeAt = start + n * buffer.duration;
    l.nextAt = fadeAt + RUN_FADE_S;
    // a short fade-in too, so the new run doesn't start with a click
    fade.gain.setValueAtTime(0, start);
    fade.gain.linearRampToValueAtTime(1, start + 0.05);
    fade.gain.setValueAtTime(1, fadeAt);
    fade.gain.linearRampToValueAtTime(0, l.nextAt);
    src.start(start);
    src.stop(l.nextAt);
    l.srcs.add(src);
    src.onended = () => {
      l.srcs.delete(src);
      fade.disconnect();
      if (!l.stopped) this.queueRun(cue, l, [min, max]);
    };
    return true;
  }

  private stopLoop(cue: Cue, fadeMs: number) {
    const ctx = this.ctx;
    const l = this.loops.get(cue);
    if (!ctx || !l) return;
    this.loops.delete(cue);
    l.stopped = true;
    l.gain.gain.setTargetAtTime(0, ctx.currentTime, fadeMs / 3000);
    // a queued run whose start lies past `end` never plays
    const end = ctx.currentTime + fadeMs / 1000 + 0.1;
    for (const src of l.srcs) {
      src.onended = null;
      src.stop(end);
    }
    setTimeout(() => l.gain.disconnect(), fadeMs + 200);
  }

  duck(on: boolean, fadeMs = 200): void {
    this.ducked = on;
    if (this.ctx && this.ambience) this.ambience.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, fadeMs / 3000);
  }

  get isDucked(): boolean {
    return this.ducked;
  }

  get activeLoops(): Cue[] {
    return [...this.loops.keys()];
  }

  /** Operator "sound test": play every cue once, spaced out. */
  async soundTest(gapMs = 700): Promise<void> {
    for (const cue of Object.keys(CUES) as Cue[]) {
      if (CUES[cue].loop) {
        this.startLoop(cue, 50);
        await new Promise((r) => setTimeout(r, gapMs * 2));
        if (!this.wantLoops.has(cue)) this.stopLoop(cue, 200);
      } else {
        this.play(cue);
        await new Promise((r) => setTimeout(r, gapMs));
      }
    }
  }
}
