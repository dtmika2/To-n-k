import { NOTICE, noticeSpanMs } from '../config/notice.ts';
import type { Settings } from '../config/settings.ts';
import { liftIntensity } from '../game/reducer.ts';
import type { Effect, GameContext, GameState } from '../game/types.ts';
import { dist } from '../pattern/geometry.ts';

type VoiceMode = 'silent' | 'demo' | 'trace' | 'unsettled' | 'collapse' | 'reveal';

const HARMONICS = [0, 1, 0.25, 0.08, 0.03];
const ATTACK_TC = 0.08 / 3; // setTargetAtTime reaches ~95 % after 3 time constants
const RELEASE_TC = 0.6 / 3;
const SNAP_TC = 0.06;
const DRAG_TC = 0.25;
const VIBRATO_RAMP_S = 0.4;

/**
 * Plan §5: one continuous theremin-like voice (custom PeriodicWave + a detuned sine, delayed vibrato,
 * portamento), lowpass → convolution reverb → limiter. Plus one-shot voices for the wrong note, hints,
 * the reveal pad and the intro drone.
 */
export class AudioEngine {
  private ac: AudioContext | null = null;
  private bus!: GainNode;
  private wave!: PeriodicWave;
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private amp!: GainNode;
  private vibLfo!: OscillatorNode;
  private vibDepth!: GainNode;
  private droneGain: GainNode | null = null;

  private mode: VoiceMode = 'silent';
  private modeAt = 0;
  /** Until this audio time, per-frame glide/swell updates leave the voice alone (note snap / ring accent). */
  private holdUntil = 0;
  private wobble = 0;

  constructor(
    private freqs: Map<number, number>,
    private ctx: GameContext,
    private readonly cfg: Settings['audio'],
  ) {}

  /** After the layout editor applies a new pattern. */
  setPattern(freqs: Map<number, number>, ctx: GameContext): void {
    this.freqs = freqs;
    this.ctx = ctx;
  }

  /** Call from a user gesture (pointerdown). Creates the graph the first time and resumes the context. */
  unlock(): void {
    if (!this.ac) this.build();
    if (this.ac && this.ac.state !== 'running') void this.ac.resume();
  }

  get running(): boolean {
    return this.ac?.state === 'running';
  }

  get contextState(): string {
    return this.ac?.state ?? 'none';
  }

  private build(): void {
    const ac = new AudioContext({ latencyHint: 'interactive' });
    this.ac = ac;

    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ac.destination);

    const master = ac.createGain();
    master.gain.value = this.cfg.masterGain;
    master.connect(limiter);

    const lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2500;
    lowpass.Q.value = 0.5;
    const dry = ac.createGain();
    dry.gain.value = 1 - this.cfg.reverbWet;
    const wet = ac.createGain();
    wet.gain.value = this.cfg.reverbWet;
    const reverb = ac.createConvolver();
    reverb.buffer = makeImpulse(ac, 3.5);
    lowpass.connect(dry).connect(master);
    lowpass.connect(reverb).connect(wet).connect(master);

    this.bus = ac.createGain();
    this.bus.connect(lowpass);

    this.wave = ac.createPeriodicWave(new Float32Array(HARMONICS.length), new Float32Array(HARMONICS));
    this.amp = ac.createGain();
    this.amp.gain.value = 0;
    this.amp.connect(this.bus);

    this.osc1 = ac.createOscillator();
    this.osc1.setPeriodicWave(this.wave);
    this.osc1.connect(this.amp);
    this.osc2 = ac.createOscillator();
    this.osc2.detune.value = 3;
    const warm = ac.createGain();
    warm.gain.value = 0.15;
    this.osc2.connect(warm).connect(this.amp);

    this.vibLfo = ac.createOscillator();
    this.vibLfo.frequency.value = this.cfg.vibratoHz;
    this.vibDepth = ac.createGain();
    this.vibDepth.gain.value = 0;
    this.vibLfo.connect(this.vibDepth);
    this.vibDepth.connect(this.osc1.detune);
    this.vibDepth.connect(this.osc2.detune);

    const f0 = this.freqs.get(this.ctx.sequence[0]) ?? 220;
    this.osc1.frequency.value = f0;
    this.osc2.frequency.value = f0;
    for (const o of [this.osc1, this.osc2, this.vibLfo]) o.start();
  }

  // ── voice primitives ─────────────────────────────────────────

  private get t(): number {
    return this.ac?.currentTime ?? 0;
  }

  private setMode(mode: VoiceMode): void {
    this.mode = mode;
    this.modeAt = this.t;
  }

  private freqTo(f: number, tc: number, at = this.t): void {
    for (const p of [this.osc1.frequency, this.osc2.frequency]) {
      p.cancelScheduledValues(at);
      p.setTargetAtTime(f, at, tc);
    }
  }

  private ampTo(v: number, tc: number, at = this.t): void {
    this.amp.gain.cancelScheduledValues(at);
    this.amp.gain.setTargetAtTime(v, at, tc);
  }

  /** Delayed vibrato: depth ramps from 0 after each note onset, as a thereminist plays. */
  private restartVibrato(): void {
    const t = this.t;
    const d = this.vibDepth.gain;
    d.cancelScheduledValues(t);
    d.setValueAtTime(0, t);
    d.linearRampToValueAtTime(this.cfg.vibratoCents, t + VIBRATO_RAMP_S);
    this.vibLfo.frequency.cancelScheduledValues(t);
    this.vibLfo.frequency.setTargetAtTime(this.cfg.vibratoHz, t, 0.05);
  }

  private get silentNow(): boolean {
    return this.amp.gain.value < 0.01;
  }

  /** Start or move the voice to a note. A silent voice jumps to the pitch; a sounding one glides. */
  private noteOn(f: number): void {
    this.freqTo(f, this.silentNow ? 0.005 : SNAP_TC);
    this.ampTo(this.cfg.voiceLevel, ATTACK_TC);
    this.restartVibrato();
    this.holdUntil = this.t + 0.15;
  }

  private ring(f: number): void {
    const t = this.t;
    const level = this.cfg.voiceLevel;
    this.freqTo(f, SNAP_TC);
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setTargetAtTime(level * 1.7, t, 0.012);
    this.amp.gain.setTargetAtTime(level, t + 0.07, 0.15);
    this.restartVibrato();
    this.holdUntil = t + 0.3;
  }

  /** A short independent voice (wrong note, hint). */
  private oneShot(f: number, level: number, opts: { bend?: boolean; durS: number }): void {
    const ac = this.ac!;
    const t = this.t;
    const osc = ac.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = f;
    const g = ac.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(level, t, 0.01);
    g.gain.setTargetAtTime(0, t + opts.durS * 0.3, opts.durS / 4);
    osc.connect(g).connect(this.bus);
    if (opts.bend) {
      osc.frequency.setValueAtTime(f, t + 0.12);
      osc.frequency.exponentialRampToValueAtTime(f * Math.pow(2, -1 / 12), t + 0.45);
      const wob = ac.createOscillator();
      wob.frequency.value = 9;
      const wobDepth = ac.createGain();
      wobDepth.gain.value = 30;
      wob.connect(wobDepth).connect(osc.detune);
      wob.start(t);
      wob.stop(t + opts.durS + 0.5);
    }
    osc.start(t);
    osc.stop(t + opts.durS + 0.5);
  }

  private revealPad(): void {
    const ac = this.ac!;
    const t = this.t;
    const unique = [...new Set(this.ctx.sequence)].map((id) => this.freqs.get(id) ?? 220).sort((a, b) => a - b);
    const level = this.cfg.padLevel / Math.sqrt(unique.length);
    for (const f of unique) {
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 1.5);
      g.gain.setTargetAtTime(0, t + 1.5, 6 / 4);
      g.connect(this.bus);
      const a = ac.createOscillator();
      a.frequency.value = f;
      a.detune.value = (Math.random() - 0.5) * 8;
      a.connect(g);
      const b = ac.createOscillator();
      b.setPeriodicWave(this.wave);
      b.frequency.value = f;
      b.detune.value = 4;
      const bg = ac.createGain();
      bg.gain.value = 0.4;
      b.connect(bg).connect(g);
      for (const o of [a, b]) {
        o.start(t);
        o.stop(t + 12);
      }
    }
  }

  /** Very quiet A2 + E3 drone for the attract mode. */
  setDrone(on: boolean): void {
    if (!this.ac || !this.cfg.introDrone) return;
    const ac = this.ac;
    if (!this.droneGain) {
      if (!on) return;
      this.droneGain = ac.createGain();
      this.droneGain.gain.value = 0;
      this.droneGain.connect(this.bus);
      for (const [f, lvl] of [
        [110, 1],
        [164.81, 0.45],
      ]) {
        const o = ac.createOscillator();
        o.frequency.value = f;
        const g = ac.createGain();
        g.gain.value = lvl;
        o.connect(g).connect(this.droneGain);
        o.start();
      }
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.11;
      const lfoDepth = ac.createGain();
      lfoDepth.gain.value = this.cfg.introDroneLevel * 0.3;
      lfo.connect(lfoDepth).connect(this.droneGain.gain);
      lfo.start();
    }
    const p = this.droneGain.gain;
    p.cancelScheduledValues(this.t);
    p.setTargetAtTime(on ? this.cfg.introDroneLevel : 0, this.t, on ? 1.2 : 0.4);
  }

  // ── game effects ─────────────────────────────────────────────

  /** A demo-style note: sound, sustain `noteMs`, release; consecutive notes glide with a dip. */
  private blinkNote(f: number, noteMs: number): void {
    this.setMode('demo');
    this.noteOn(f);
    this.amp.gain.setTargetAtTime(0, this.t + noteMs / 1000, RELEASE_TC);
  }

  /**
   * "Get ready" sound under the visual notice: a soft A3 + E4 swell that rises with the breath, then
   * three quiet chimes with the pulses, the last one higher.
   */
  private notice(leadMs: number): void {
    const ac = this.ac!;
    const t0 = this.t;
    const L = noticeSpanMs(leadMs) / 1000;
    const [i0, i1] = NOTICE.inhale;
    const breath = ac.createGain();
    breath.gain.setValueAtTime(0, t0);
    breath.gain.setValueAtTime(0, t0 + i0 * L);
    breath.gain.linearRampToValueAtTime(this.cfg.noticeLevel, t0 + i1 * L);
    breath.gain.setTargetAtTime(0, t0 + i1 * L, 0.35);
    breath.connect(this.bus);
    for (const [freq, lvl] of [
      [220, 1],
      [329.63, 0.5],
    ]) {
      const o = ac.createOscillator();
      o.frequency.value = freq;
      o.detune.setValueAtTime(-30, t0 + i0 * L);
      o.detune.linearRampToValueAtTime(20, t0 + i1 * L);
      const og = ac.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(breath);
      o.start(t0);
      o.stop(t0 + L + 1.5);
    }
    NOTICE.pulses.forEach((pk, i) => {
      const at = t0 + pk * L;
      const last = i === NOTICE.pulses.length - 1;
      const o = ac.createOscillator();
      o.frequency.value = last ? 659.25 : 440;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(this.cfg.noticePingLevel * (last ? 1.2 : 1), at + 0.008);
      g.gain.setTargetAtTime(0, at + 0.01, 0.18);
      o.connect(g).connect(this.bus);
      o.start(at);
      o.stop(at + 1.5);
    });
  }

  /** The demo's outro: a quiet, resolving A-minor chord (A3 E4 A4) that fades over `ms`. */
  private outroChord(ms: number): void {
    const ac = this.ac!;
    const t0 = this.t;
    const dur = ms / 1000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(this.cfg.noticeLevel, t0 + 0.06);
    g.gain.setTargetAtTime(0, t0 + 0.1, dur / 3);
    g.connect(this.bus);
    for (const [freq, lvl] of [
      [220, 1],
      [329.63, 0.6],
      [440, 0.45],
    ]) {
      const o = ac.createOscillator();
      o.setPeriodicWave(this.wave);
      o.frequency.value = freq;
      const og = ac.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(g);
      o.start(t0);
      o.stop(t0 + dur + 2);
    }
  }

  /** INTRO attract demo note (full voice level, like the game demo). */
  onAttractNote(point: number, noteMs: number): void {
    if (!this.running) return;
    this.blinkNote(this.freqs.get(point) ?? 220, noteMs);
  }

  onEffect(e: Effect): void {
    // Effects may arrive while a first tap is still resuming the context; scheduling then is fine,
    // because the context clock only starts running once it has resumed.
    if (!this.ac) return;
    const f = (id: number) => this.freqs.get(id) ?? 220;
    switch (e.type) {
      case 'startGame':
        this.setDrone(false);
        break;
      case 'demoStart':
        this.ampTo(0, 0.08);
        this.setMode('silent');
        if (e.leadMs >= NOTICE.minLeadMs) this.notice(e.leadMs);
        break;
      case 'ready':
        this.ampTo(0, 0.08);
        this.setMode('silent');
        break;
      case 'demoOutro':
        this.outroChord(e.ms);
        break;
      case 'demoBlink':
        this.blinkNote(f(e.point), e.noteMs);
        break;
      case 'playNote':
        if (e.kind === 'reach') this.ring(f(e.point));
        else this.noteOn(f(e.point));
        this.setMode('trace');
        break;
      case 'flinch':
        this.oneShot(f(e.point), 0.22, { bend: true, durS: 0.7 });
        this.ampTo(this.cfg.voiceLevel * 0.3, 0.05);
        break;
      case 'lift':
        this.setMode('unsettled');
        break;
      case 'pulseHint': {
        this.oneShot(f(e.point), 0.06, { durS: 0.5 });
        break;
      }
      case 'collapse': {
        this.setMode('collapse');
        const t = this.t;
        const dur = this.ctx.timing.collapseMs / 1000;
        const from = this.osc1.frequency.value;
        for (const p of [this.osc1.frequency, this.osc2.frequency]) {
          p.cancelScheduledValues(t);
          p.setValueAtTime(from, t);
          p.exponentialRampToValueAtTime(from / 4, t + dur + 0.6);
        }
        this.amp.gain.cancelScheduledValues(t);
        this.amp.gain.setTargetAtTime(this.cfg.voiceLevel * 0.6, t, 0.05);
        this.amp.gain.setTargetAtTime(0, t + 0.25, dur / 3);
        this.vibDepth.gain.setTargetAtTime(this.cfg.vibratoCents * 3, t, 0.3);
        break;
      }
      case 'startReveal':
        this.setMode('reveal');
        this.amp.gain.setTargetAtTime(0, this.t + 0.5, 0.8);
        this.revealPad();
        break;
      case 'toIntro':
        this.ampTo(0, 0.3);
        this.setMode('silent');
        this.setDrone(true);
        break;
      case 'creativeStart':
        this.ampTo(0, 0.08);
        this.setMode('silent');
        this.setDrone(false); // when opened from INTRO
        break;
      case 'creativeRelease':
      case 'creativeExit':
        this.ampTo(0, RELEASE_TC);
        this.setMode('silent');
        break;
      default:
        break;
    }
  }

  /** Per-frame continuous control: drag glide, speed swell, unsettled vibrato. */
  update(s: GameState, now: number, fingerSpeed: number): void {
    if (!this.running) return;
    const t = this.t;
    if (this.mode === 'trace' && s.mode === 'GAME' && s.sub === 'TRACING' && s.finger && t > this.holdUntil) {
      const last = this.ctx.sequence[s.progress - 1];
      const next = this.ctx.sequence[s.progress];
      const fLast = this.freqs.get(last) ?? 220;
      let f = fLast;
      if (this.cfg.glideHint && next !== undefined) {
        const pl = this.ctx.points.find((p) => p.id === last)!.pos;
        const pn = this.ctx.points.find((p) => p.id === next)!.pos;
        const span = dist(pl, pn);
        const k = span > 0 ? 1 - Math.min(1, Math.max(0, dist(s.finger, pn) / span)) : 0;
        const fNext = this.freqs.get(next) ?? fLast;
        f = fLast * Math.pow(fNext / fLast, k);
      }
      this.freqTo(f, DRAG_TC);
      this.ampTo(this.cfg.voiceLevel + this.cfg.speedSwell * Math.min(1, fingerSpeed / 1.5), 0.08);
    } else if (this.mode === 'trace' && s.mode === 'CREATIVE' && s.chain.length > 0 && t > this.holdUntil) {
      // free play: hold the last note, swell with finger speed (no target, so no glide hint)
      this.ampTo(this.cfg.voiceLevel + this.cfg.speedSwell * Math.min(1, fingerSpeed / 1.5), 0.08);
    } else if (this.mode === 'unsettled' && s.mode === 'GAME' && s.sub === 'LIFTED') {
      const u = liftIntensity(s, now, this.ctx.timing.liftStrikeMs);
      const elapsed = t - this.modeAt;
      this.wobble += (Math.random() - 0.5) * 0.4;
      this.wobble *= 0.95;
      this.vibLfo.frequency.setTargetAtTime(this.cfg.vibratoHz * (1 + u * this.wobble), t, 0.05);
      this.vibDepth.gain.cancelScheduledValues(t);
      this.vibDepth.gain.setTargetAtTime(this.cfg.vibratoCents * (1 + u * 4), t, 0.1);
      this.ampTo(this.cfg.voiceLevel * 0.45 * Math.exp(-elapsed / 2.5), 0.1);
    }
  }
}

/** Decaying stereo noise as a reverb impulse response. */
function makeImpulse(ac: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}
