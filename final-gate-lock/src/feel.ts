/**
 * The feel of the lock, in one place: every timing and weight number that decides whether the
 * mechanism reads as stone and iron or as paper. Geometry lives in layout.ts; this is motion.
 * All times are game ms (scaled by `?speed`).
 */
const DEG = Math.PI / 180;

export const FEEL = {
  wheel: {
    /** Arrow tap: one slot, heavy start, long deceleration, hard stop. */
    stepMs: 650,
    /** Release snap duration = min + perSlot × distance (in slots), capped. */
    snapMinMs: 450,
    snapPerSlotMs: 420,
    snapMaxMs: 800,
    /** Abort-drag snap (state change). */
    cancelMs: 350,
    /** Recoil after the hard stop: the plate bounces back this far, then settles. */
    recoilRad: 1.3 * DEG,
    recoilMs: 160,
    /** Drag: the plate trails the finger through a critically damped spring (lag ≈ 2/ω s). */
    dragOmega: 24,
    /** Notch strength 0…1: sticky near each number, quicker between numbers (ratchet). */
    notch: 0.55,
    /** Release: arrival speed at the detent as a share of the average speed (hard stop). */
    arrivalSpeed: 0.55,
    /** Thud on settle: dip into the socket and a short jolt. */
    thudMs: 240,
    thudScale: 0.017,
    thudJoltPx: 1.1,
  },
  arrow: {
    pressTravelPx: 2.5,
    pressScale: 0.94,
    releaseMs: 180,
    /**
     * Arrows show only on the active wheel (the last one touched; the first wheel when play starts)
     * and on any wheel a finger is still on. Hidden arrows don't take taps.
     */
    fadeInMs: 140,
    fadeOutMs: 700,
  },
  eye: {
    blinkMs: 280,
    slowBlinkMs: 900,
    /** Exponential approach rates (1/s): lower = slower, heavier lids. */
    lidRate: { shut: 3, asleep: 2, peaceful: 1.1, wide: 10, awake: 8, settled: 5, curious: 4.5, drowsy: 1.4 },
    lookRate: { default: 7, wide: 16, touch: 9, curious: 6, glance: 7 },
    glanceHoldMs: [1400, 2200] as const,
    breathPeriodMs: [5500, 7500] as const,
    scaleRate: 3,
    scaleRateWide: 9,
    glowRate: 2,
    glowRateWide: 6,
    /** After a finger lifts, the eye stays awake this long. */
    awakeLingerMs: 500,
    /** Glow targets (drowsy breathes around 0.2). */
    glow: { awake: 0.7, settled: 0.45, curious: 0.36 },
    /** No blinks while an eye is in use, nor for this long after (it holds still for the player). */
    calmAfterUseMs: 1200,
  },
  intro: {
    totalMs: 6500,
    veilMs: 2600,
    eyeWave: [1000, 3400] as const,
    spinStart: [2600, 3300] as const,
    spinMs: [2600, 3100] as const,
  },
  success: {
    totalMs: 10_000,
    breathMs: 600,
    eyesWideAt: 600,
    clunkAt: 1400,
    sinkMs: 1400,
    joltPx: 7,
    collarMs: 750,
    collarStaggerMs: 70,
    /** lock_clunk repeats once per socket, each after a small random gap */
    clunkCount: 8,
    clunkGapMs: [40, 110] as const,
    eyesCloseAt: 2400,
    splitAt: 4000,
    breakFreePx: 6,
    breakFreeMs: 120,
    splitPauseMs: 250,
    slideMs: 4400,
    /**
     * Final flight: about 2 s after the core is fully clear of the parting halves (~6 s) it swells a
     * little and flies up off the top of the screen (done by coreFlyAt + coreFlyMs, before Open).
     */
    coreFlyAt: 8000,
    coreFlyMs: 1800,
  },
} as const;
