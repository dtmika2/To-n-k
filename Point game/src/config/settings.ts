import type { Look } from '../render/scene.ts';

/** Tunables. Everything that is worth adjusting on the real TV lives here. */
export const settings = {
  timing: {
    demoStepMs: 900,
    demoNoteMs: 600,
    /** Pause between entering GAME (or pressing the master button) and the first demo blink. */
    demoLeadMs: 900,
    /** After the start tap: the clouds part and a "breathe in, pay attention" notice plays before the demo (ends NOTICE.tailMs before the first eye). */
    introLeadMs: 5500,
    /** After the last demo blink: a short outro (the breath goes out, a closing chord) before READY. */
    demoOutroMs: 1000,
    liftStrikeMs: 4000,
    retractMs: 600,
    collapseMs: 1500,
    revealDisperseMs: 5000,
    revealHoldMs: 15000,
    /**
     * The reveal figure (the number drawn by joining eyes): starts this long into the reveal (after the
     * Leo lines' flare has faded, at 0.65 × revealDisperseMs), draws over revealFigureDrawMs (it may run
     * on into IDLE).
     */
    revealFigureDelayMs: 3400,
    revealFigureDrawMs: 4000,
    cloudsReturnMs: 3000,
    inactivityMs: 30000,
    /** Creative mode: how long a drawing takes to fade after the finger lifts. */
    creativeFadeMs: 3000,
    /** INTRO attract demo: three random points connect, then the line un-draws from start to end. */
    attract: { drawMs: 700, noteMs: 600, holdMs: 900, undrawMs: 1600, gapMs: 1000 },
  },
  /** creativeScale: point radius (× r) for connecting points in creative mode. */
  hit: { correctScale: 1.5, wrongScale: 0.6, exitHysteresis: 1.25, masterScale: 1.5, creativeScale: 1.0 },
  audio: {
    masterGain: 0.7,
    reverbWet: 0.35,
    vibratoHz: 5.5,
    vibratoCents: 8,
    glideHint: true,
    /** Each eye of the reveal figure plays its note as the line reaches it. */
    revealNotes: true,
    introDrone: true,
    /** Theremin level while sustaining a note (before the master gain). */
    voiceLevel: 0.32,
    /** Extra level at full finger speed while tracing. */
    speedSwell: 0.18,
    introDroneLevel: 0.035,
    padLevel: 0.08,
    /** "Get ready" notice: the breath swell and the three chimes. */
    noticeLevel: 0.07,
    noticePingLevel: 0.12,
  },
  display: {
    /**
     * Visual look: 'classic' (drawn lines, nebula irises) or 'vfx' (shader beams, portal irises, rings of
     * light). Both ship in the same build; `?look=` overrides this and the L key switches it live.
     */
    look: 'vfx' as Look,
    /** Turns the whole picture and touch together (0/90/180/270); 270 fills a TV Windows drives in landscape. `?rotate=` overrides it. */
    rotateDeg: 270,
    /** Resolution of the cloud/mist shader layer relative to the screen. */
    renderScale: 0.5,
    /** fBm octaves in the cloud/mist shader (performance vs. detail). */
    noiseOctaves: 5,
    /** Lower renderScale step by step (never below minRenderScale) if the frame rate stays under 55 fps. */
    autoScale: true,
    minRenderScale: 0.3,
    stars: 600,
    /** Eyes never close further than this (0 = closed lid line, 1 = wide open). */
    eyeMinOpen: 0.2,
    /** Eyes look this much bigger (0.4 = +40 %), also in the M menu. Visual only: the hit radii stay as they are. */
    eyeGrow: 0.4,
    /** Bottom layer image (portrait 9:16, in public/; at least 2160×3840 to stay sharp at 4K); '' = plain night gradient. */
    backdrop: 'assets/BackdropHighRes.jpeg',
    /**
     * Experimental backdrops (B key, M menu, `?backdrop=`): looping silent videos, portrait 9:16, H.264 MP4.
     * A name here becomes a choice; the image above stays the default and the fallback.
     */
    backdropVideos: { loop: 'assets/BackdropLoop.mp4', swirl: 'assets/BackdropSwirlHighRes.mp4' } as Record<string, string>,
    /**
     * Depth mode (Z key, M menu, `?depth=0` for off): eyes at different distances. Ranges are
     * [far, near]. Visual only: the hit radii don't change. See render/depth.ts.
     */
    depth: {
      enabled: true,
      eyeScale: [0.72, 1.2] as [number, number],
      haze: [0.5, 0] as [number, number],
      lineWidth: [0.41, 1.54] as [number, number],
      lineAlpha: [0.75, 1] as [number, number],
      lineRegion: 4.5,
      orbitersPerEye: 3,
      mistOver: 0.4,
      clouds: { mid: 0.25, front: 0.15, overCap: 0.35, veilAlpha: [0.1, 0.16] as [number, number] },
    },
    /**
     * Cloud cover (puffs, as in final-gate-lock): covers the INTRO, parts outward from the tap that
     * starts the game (over partMs), rolls back in from the edges after the reveal.
     * `opacity` < 1 keeps it slightly see-through.
     */
    clouds: {
      partMs: 2600,
      count: 34,
      shroudAlpha: [0.45, 0.7] as [number, number],
      wispAlpha: [0.03, 0.06] as [number, number],
      opacity: 0.85,
      tints: [0x9a8cd0, 0x8a6fb0, 0xb48ac8, 0x7a74b8, 0xc8b8ec],
    },
  },
  game: { allowSkipDemo: false },
  /** Master button, in normalized portrait coordinates (x across, y down); r is in portrait-width units. */
  master: { x: 0.5, y: 0.06, r: 0.045 },
  /** Creative-mode button (free play), bottom centre; same units as master. */
  creative: { x: 0.5, y: 0.94, r: 0.045 },
  /** Validator: extra clearance (portrait-width units) added to wrongScale × r for segments passing points. */
  validator: { segmentMargin: 0.015, edgeWarnFraction: 0.04 },
};

export type Settings = typeof settings;
