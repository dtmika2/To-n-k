import type { Vec } from '../pattern/types.ts';

export type Mode = 'INTRO' | 'GAME' | 'REVEAL' | 'IDLE' | 'CREATIVE';
export type Sub = 'DEMO' | 'READY' | 'TRACING' | 'LIFTED' | 'COLLAPSE';

/** Geometry and timing the reducer needs. All positions and radii are in world units (see pattern/types.ts). */
export interface GameContext {
  points: { id: number; pos: Vec; r: number }[];
  sequence: number[];
  master: { pos: Vec; r: number };
  creative: { pos: Vec; r: number };
  timing: {
    demoStepMs: number;
    demoLeadMs: number;
    introLeadMs: number;
    demoOutroMs: number;
    demoNoteMs: number;
    retractMs: number;
    liftStrikeMs: number;
    collapseMs: number;
    revealDisperseMs: number;
    revealHoldMs: number;
    revealFigureDelayMs: number;
    revealFigureDrawMs: number;
    cloudsReturnMs: number;
    inactivityMs: number;
    creativeFadeMs: number;
  };
  hit: { correctScale: number; wrongScale: number; exitHysteresis: number; masterScale: number; creativeScale: number };
  allowSkipDemo: boolean;
  /** The reveal figure (pattern.json "figure"); empty = none. See game/figure.ts. */
  figure: number[];
}

export interface GameState {
  mode: Mode;
  /** Meaningful only in GAME. */
  sub: Sub;
  modeSince: number;
  subSince: number;
  /** Correct touches in the current attempt, 0…sequence.length. The last correct point is sequence[progress − 1]. */
  progress: number;
  wrongStrikes: number;
  liftStrikes: number;
  /** Start of the current 4 s lift interval while LIFTED, else null. */
  liftTimerAt: number | null;
  /** The locked pointer. `ignored`: after a wrong strike the physical pointer does nothing until it lifts. */
  pointer: { id: number; ignored: boolean } | null;
  /** Last known position of the locked pointer. */
  finger: Vec | null;
  /** Free end of the tether: the finger while TRACING, the lift position while hanging, null once retracted. */
  tether: Vec | null;
  /** Hysteresis: points registered during this touch that the finger has not yet left (exitHysteresis × r). */
  inside: number[];
  lastInputAt: number;
  /** Index of the next demo step to blink. */
  demoStep: number;
  /** Pause before the first blink of the current demo (long after the start tap, short on replays). */
  demoLeadMs: number;
  /** Progress at the moment COLLAPSE started (for the rewind animation). */
  collapseFrom: number;
  /** IDLE: the clouds have started rolling back in. */
  cloudsReturning: boolean;
  /** CREATIVE: the points connected during the current touch, in order. */
  chain: number[];
  /** CREATIVE: where leaving returns to (INTRO when it was opened under the clouds). */
  creativeFrom: 'INTRO' | 'READY';
}

export type GameEvent =
  | { type: 'POINTER_DOWN'; id: number; pos: Vec }
  /** `path`: the coalesced samples since the previous event, in order; the reducer interpolates between them. */
  | { type: 'POINTER_MOVE'; id: number; path: Vec[] }
  | { type: 'POINTER_UP'; id: number }
  | { type: 'POINTER_CANCEL'; id: number }
  | { type: 'TICK' }
  | { type: 'MASTER_PRESSED' }
  /** The creative-mode button (keyboard equivalent): enters from READY, leaves from CREATIVE. */
  | { type: 'CREATIVE_PRESSED' }
  /** Ends the demo right away (used when allowSkipDemo is on, and by tests). */
  | { type: 'DEMO_DONE' }
  /** Ends the current timed animation (collapse, reveal, clouds returning) right away. */
  | { type: 'ANIM_DONE' }
  /** Debug keys: jump straight to a top-level mode. */
  | { type: 'JUMP'; mode: Mode };

export type Effect =
  /** `at`: the tap that started it (the clouds part from there); absent for debug jumps. */
  | { type: 'startGame'; at?: Vec }
  | { type: 'demoStart'; leadMs: number }
  /** The sequence has been shown; READY (the players' turn) follows after `ms`. */
  | { type: 'demoOutro'; ms: number }
  | { type: 'demoBlink'; point: number; step: number; noteMs: number }
  | { type: 'ready' }
  /** A note for a point reached by the player: the start touch, a retouch or a newly reached point. */
  | { type: 'playNote'; point: number; kind: 'start' | 'retouch' | 'reach' }
  | { type: 'lockSegment'; from: number; to: number; index: number }
  | { type: 'flinch'; point: number }
  /** The tether snaps back to the last correct point from `from`. */
  | { type: 'retract'; from: Vec; to: number }
  | { type: 'lift' }
  | { type: 'liftStrike'; count: number }
  /** A lift strike with the tether already retracted: the line just pulses. */
  | { type: 'strikePulse' }
  | { type: 'pulseHint'; point: number }
  | { type: 'collapse'; progress: number }
  | { type: 'startReveal' }
  | { type: 'idle' }
  | { type: 'cloudsReturn' }
  | { type: 'toIntro'; reason: 'inactivity' | 'cycle' | 'debug' }
  /** `at`: the tap that opened it from INTRO (the clouds part from there). */
  | { type: 'creativeStart'; at?: Vec }
  | { type: 'creativeExit' }
  | { type: 'creativeLink'; from: number; to: number }
  /** The finger lifted in creative mode: the drawing of this touch starts to fade. */
  | { type: 'creativeRelease'; chain: number[] };

export interface ReduceResult {
  state: GameState;
  effects: Effect[];
}
