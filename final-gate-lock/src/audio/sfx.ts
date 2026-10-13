/** Sound cue names (PLAN §7) and the interface the game talks to. */
export const CUES = {
  mist_loop: { loop: true, variants: 1 },
  /** Ambience from the mist parting until the lock opens; the two variants alternate (AudioManager). */
  eye_loop: { loop: true, variants: 2 },
  reveal_whoosh: { loop: false, variants: 1 },
  eye_open: { loop: false, variants: 3 },
  spin_ratchet: { loop: false, variants: 1 },
  detent_click: { loop: false, variants: 3 },
  arrow_tap: { loop: false, variants: 2 },
  drag_tick: { loop: false, variants: 2 },
  eye_blink: { loop: false, variants: 3 },
  idle_whisper: { loop: false, variants: 4 },
  success_stinger: { loop: false, variants: 1 },
  eye_glowup: { loop: false, variants: 1 },
  lock_clunk: { loop: false, variants: 2 },
  plate_slide: { loop: false, variants: 1 },
  dust_fall: { loop: false, variants: 1 },
  core_hum: { loop: true, variants: 1 },
  reset_wind: { loop: false, variants: 1 },
  operator_beep: { loop: false, variants: 1 },
} as const;

export type Cue = keyof typeof CUES;

export interface Sfx {
  play(cue: Cue, opts?: { volume?: number; rate?: number }): void;
  /** Start/stop a looping cue (with a short fade). */
  loop(cue: Cue, on: boolean, fadeMs?: number): void;
  /** Duck all ambience (success "held breath"). */
  duck(on: boolean, fadeMs?: number): void;
  /** Resume the audio context (first user gesture). */
  unlock(): void;
}

export const silentSfx: Sfx = {
  play() {},
  loop() {},
  duck() {},
  unlock() {},
};
