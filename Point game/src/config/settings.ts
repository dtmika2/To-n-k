/** Tunables. Everything that is worth adjusting on the real TV lives here. */
export const settings = {
  timing: {
    demoStepMs: 900,
    demoNoteMs: 600,
    /** Pause between entering GAME (or pressing the master button) and the first demo blink. */
    demoLeadMs: 900,
    liftStrikeMs: 4000,
    retractMs: 600,
    collapseMs: 1500,
    revealDisperseMs: 5000,
    revealHoldMs: 15000,
    cloudsReturnMs: 3000,
    inactivityMs: 30000,
  },
  hit: { correctScale: 1.5, wrongScale: 0.6, exitHysteresis: 1.25, masterScale: 1.5 },
  audio: {
    masterGain: 0.7,
    reverbWet: 0.35,
    vibratoHz: 5.5,
    vibratoCents: 8,
    glideHint: true,
    introDrone: true,
    /** Theremin level while sustaining a note (before the master gain). */
    voiceLevel: 0.32,
    /** Extra level at full finger speed while tracing. */
    speedSwell: 0.18,
    introDroneLevel: 0.035,
    padLevel: 0.08,
  },
  display: { rotateDeg: 0, renderScale: 0.5 },
  game: { allowSkipDemo: false },
  reveal: { image: 'assets/reveal-number.png', widthFraction: 0.45, placeholderText: '5' },
  /** Master button, in normalized portrait coordinates (x across, y down); r is in portrait-width units. */
  master: { x: 0.5, y: 0.06, r: 0.045 },
  /** Validator: extra clearance (portrait-width units) added to wrongScale × r for segments passing points. */
  validator: { segmentMargin: 0.015, edgeWarnFraction: 0.04 },
};

export type Settings = typeof settings;
