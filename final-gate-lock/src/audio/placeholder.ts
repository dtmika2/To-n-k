/**
 * Placeholder sound synthesis (pure: returns raw samples). Used only behind `?placeholderSfx` when
 * the real file for a cue is missing. Each cue gets a short, recognisable tone so the wiring can be
 * checked by ear on the tablet before the client's files arrive.
 */
import type { Cue } from './sfx';
import { mulberry32 } from '../util/random';

export interface Synth {
  samples: Float32Array;
  sampleRate: number;
}

const TAU = Math.PI * 2;

function buf(seconds: number, sr: number): Float32Array {
  return new Float32Array(Math.max(1, Math.round(seconds * sr)));
}

/** Exponential decay envelope. */
const decay = (t: number, tau: number) => Math.exp(-t / tau);

export function synthesize(cue: Cue, variant: number, sr = 44100): Synth {
  const rng = mulberry32(cue.length * 131 + variant * 17);
  const noise = () => rng() * 2 - 1;
  const v = variant; // 0-based, shifts pitch slightly so variants differ
  let out: Float32Array;
  switch (cue) {
    case 'detent_click': {
      // iron dropping into a stone notch: a pitch-falling low thump plus a short gritty knock
      const len = 0.22;
      out = buf(len, sr);
      let lp = 0;
      let phase = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        const f = (95 + 90 * Math.exp(-t / 0.03)) * (1 + v * 0.05);
        phase += (TAU * f) / sr;
        lp += 0.12 * (noise() - lp);
        out[i] = (0.85 * Math.sin(phase) * decay(t, 0.06) + 1.6 * lp * decay(t, 0.012)) * 0.9;
      }
      break;
    }
    case 'arrow_tap':
    case 'drag_tick': {
      // heavy lever / ratchet tooth: low knock, no bright click
      const len = cue === 'arrow_tap' ? 0.1 : 0.07;
      const f = (cue === 'drag_tick' ? 520 : 300) * (1 + v * 0.06);
      out = buf(len, sr);
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        lp += 0.2 * (noise() - lp);
        out[i] = (0.55 * Math.sin(TAU * f * t) + 0.9 * lp) * decay(t, len / 6) * 0.8;
      }
      break;
    }
    case 'eye_blink': {
      out = buf(0.12, sr);
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        out[i] = noise() * decay(t, 0.02) * 0.25 * (1 + v * 0.1);
      }
      break;
    }
    case 'eye_open': {
      out = buf(0.6, sr);
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        const f = 300 + 500 * (t / 0.6) + v * 40;
        out[i] = Math.sin(TAU * f * t) * Math.sin(Math.PI * (t / 0.6)) * 0.3;
      }
      break;
    }
    case 'spin_ratchet': {
      // slow, heavy pawl over a big gear, slowing down
      const len = 2.2;
      out = buf(len, sr);
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        const rate = 13 * (1 - t / (len * 1.15));
        const phase = (t * rate) % 1;
        lp += 0.15 * (noise() - lp);
        out[i] = (1.4 * lp + 0.4 * Math.sin(TAU * 140 * t)) * decay(phase, 0.025) * 0.55 * (1 - t / len);
      }
      break;
    }
    case 'reveal_whoosh':
    case 'reset_wind':
    case 'dust_fall': {
      const len = cue === 'reset_wind' ? 3 : 2;
      out = buf(len, sr);
      let lp = 0;
      const k = cue === 'dust_fall' ? 0.25 : 0.06;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        lp += k * (noise() - lp);
        out[i] = lp * Math.sin(Math.PI * (t / len)) * (cue === 'dust_fall' ? 0.5 : 1.4);
      }
      break;
    }
    case 'success_stinger': {
      out = buf(2.4, sr);
      const chord = [220, 277.18, 329.63, 440];
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        let s = 0;
        for (const f of chord) s += Math.sin(TAU * f * t);
        out[i] = (s / chord.length) * Math.min(1, t * 8) * decay(t, 0.9) * 0.7;
      }
      break;
    }
    case 'lock_clunk': {
      // massive bolts slamming home: deep body, a low metallic ring, a stony crack on top
      const len = 1.6;
      out = buf(len, sr);
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        lp += 0.08 * (noise() - lp);
        const body = Math.sin(TAU * 40 * t) * decay(t, 0.38);
        const ring = Math.sin(TAU * 196 * t) * 0.18 * decay(t, 0.5);
        const crack = lp * 1.2 * decay(t, 0.03);
        out[i] = (body + ring + crack) * 0.72;
      }
      break;
    }
    case 'plate_slide': {
      // stone and iron grinding apart: low rumble, gritty scrape, uneven pressure
      const len = 4.6;
      out = buf(len, sr);
      let lp = 0;
      let grit = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        lp += 0.012 * (noise() - lp);
        grit += 0.3 * (noise() - grit);
        const pressure = 0.7 + 0.3 * Math.sin(TAU * 3.1 * t) * Math.sin(TAU * 0.7 * t);
        const env = Math.min(1, t / 0.4) * Math.min(1, (len - t) / 0.8);
        out[i] = (lp * 4 + Math.sin(TAU * 35 * t) * 0.3 + grit * 0.12 * pressure) * env * 0.8;
      }
      break;
    }
    case 'idle_whisper': {
      out = buf(1.6, sr);
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        lp += 0.4 * (noise() - lp);
        const am = 0.5 + 0.5 * Math.sin(TAU * (5 + v) * t);
        out[i] = lp * am * Math.sin(Math.PI * (t / 1.6)) * 0.18;
      }
      break;
    }
    case 'operator_beep': {
      out = buf(0.12, sr);
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        out[i] = Math.sin(TAU * 1000 * t) * 0.3 * Math.min(1, (0.12 - t) * 60);
      }
      break;
    }
    case 'mist_loop':
    case 'core_hum': {
      // seamless loop: whole number of cycles, noise crossfaded at the ends
      const len = 4;
      out = buf(len, sr);
      let lp = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        if (cue === 'core_hum') {
          out[i] = (Math.sin(TAU * 55 * t) * 0.5 + Math.sin(TAU * 110 * t) * 0.25 + Math.sin(TAU * 165 * t) * 0.08) * 0.5;
        } else {
          lp += 0.02 * (noise() - lp);
          out[i] = lp * 1.6 * (0.8 + 0.2 * Math.sin((TAU * t) / len));
        }
      }
      const fade = Math.round(0.05 * sr);
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        out[i] *= k;
        out[out.length - 1 - i] *= k;
      }
      break;
    }
  }
  return { samples: out, sampleRate: sr };
}

/** Accepted sound formats, in the order they are tried. MP3 decodes everywhere (incl. older iPad Safari). */
export const SFX_EXTS = ['mp3', 'ogg'] as const;

/** Candidate file names for a cue (PLAN §7): `<name>.mp3` or `<name>_1.mp3`, `<name>_2.mp3`, … (`.ogg` also accepted) */
export function fileNames(cue: Cue, variants: number): string[][] {
  const stems =
    variants <= 1
      ? [[cue, `${cue}_1`]]
      : Array.from({ length: variants }, (_, i) => [`${cue}_${i + 1}`, ...(i === 0 ? [cue] : [])]);
  return stems.map((names) => SFX_EXTS.flatMap((ext) => names.map((n) => `${n}.${ext}`)));
}
