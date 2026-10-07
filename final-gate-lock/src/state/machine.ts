/**
 * Game state machine. Pure: no rendering, timers are injected (game clock in the app, fake timers in
 * tests).
 *
 *   Shrouded --tap--> Intro --introDone--> Playable --solved--> Success --successDone--> Open
 *      ^                                                                                  |
 *      +-------------------- resetDone <-- Reset <-- (resetAfterSuccessMs timer) ---------+
 *
 * Operator shortcuts: forceOpen() (Shrouded/Intro/Playable → Success) and operatorReset() (any state
 * except Shrouded/Reset → Reset).
 *
 * While Playable, the machine also tracks inactivity: no activity() for asleepAfterIdleMs → asleep.
 */
import type { Timers } from '../util/clock';

export type GameState = 'Shrouded' | 'Intro' | 'Playable' | 'Success' | 'Open' | 'Reset';

export interface MachineTimings {
  resetAfterSuccessMs: number;
  asleepAfterIdleMs: number;
}

export type MachineEvent =
  | { type: 'state'; from: GameState; to: GameState }
  | { type: 'asleep' }
  | { type: 'wake' };

type Listener = (e: MachineEvent) => void;

export class Machine {
  private _state: GameState = 'Shrouded';
  private _asleep = false;
  private listeners = new Set<Listener>();
  private resetTimer: number | null = null;
  private idleTimer: number | null = null;
  /** Number of completed Shrouded → … → Shrouded loops. */
  loops = 0;

  constructor(
    private timings: MachineTimings,
    private timers: Timers,
  ) {}

  get state(): GameState {
    return this._state;
  }

  get asleep(): boolean {
    return this._asleep;
  }

  /** Players may only move wheels while Playable. */
  get inputEnabled(): boolean {
    return this._state === 'Playable';
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setTimings(t: Partial<MachineTimings>): void {
    this.timings = { ...this.timings, ...t };
  }

  private emit(e: MachineEvent) {
    for (const fn of [...this.listeners]) fn(e);
  }

  private go(to: GameState): void {
    const from = this._state;
    this._state = to;
    this.clearIdle();
    if (this._asleep) {
      this._asleep = false;
      this.emit({ type: 'wake' });
    }
    if (to !== 'Open') this.clearReset();
    if (to === 'Playable') this.armIdle();
    if (to === 'Open') {
      this.clearReset();
      this.resetTimer = this.timers.setTimeout(() => {
        this.resetTimer = null;
        if (this._state === 'Open') this.go('Reset');
      }, this.timings.resetAfterSuccessMs);
    }
    if (to === 'Shrouded' && from === 'Reset') this.loops++;
    this.emit({ type: 'state', from, to });
  }

  /** First tap on the shrouded screen. */
  tap(): boolean {
    if (this._state !== 'Shrouded') return false;
    this.go('Intro');
    return true;
  }

  introDone(): boolean {
    if (this._state !== 'Intro') return false;
    this.go('Playable');
    return true;
  }

  /** The last wheel settled correct. */
  solved(): boolean {
    if (this._state !== 'Playable') return false;
    this.go('Success');
    return true;
  }

  successDone(): boolean {
    if (this._state !== 'Success') return false;
    this.go('Open');
    return true;
  }

  resetDone(): boolean {
    if (this._state !== 'Reset') return false;
    this.go('Shrouded');
    return true;
  }

  /** Operator: run the success sequence now. */
  forceOpen(): boolean {
    if (this._state !== 'Shrouded' && this._state !== 'Intro' && this._state !== 'Playable') return false;
    this.go('Success');
    return true;
  }

  /** Operator: roll the mist back and return to Shrouded. */
  operatorReset(): boolean {
    if (this._state === 'Shrouded' || this._state === 'Reset') return false;
    this.go('Reset');
    return true;
  }

  /** Dev/test: jump straight into Playable (used by `?skip-intro`). */
  skipToPlayable(): boolean {
    if (this._state !== 'Shrouded' && this._state !== 'Intro') return false;
    this.go('Playable');
    return true;
  }

  /** Any touch while Playable. Wakes the plate if asleep and restarts the idle countdown. */
  activity(): void {
    if (this._state !== 'Playable') return;
    if (this._asleep) {
      this._asleep = false;
      this.emit({ type: 'wake' });
    }
    this.armIdle();
  }

  dispose(): void {
    this.clearIdle();
    this.clearReset();
    this.listeners.clear();
  }

  private armIdle() {
    this.clearIdle();
    this.idleTimer = this.timers.setTimeout(() => {
      this.idleTimer = null;
      if (this._state === 'Playable' && !this._asleep) {
        this._asleep = true;
        this.emit({ type: 'asleep' });
      }
    }, this.timings.asleepAfterIdleMs);
  }

  private clearIdle() {
    if (this.idleTimer !== null) this.timers.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private clearReset() {
    if (this.resetTimer !== null) this.timers.clearTimeout(this.resetTimer);
    this.resetTimer = null;
  }
}
