/**
 * Pure lock model: owns the truth about which slot each wheel rests on.
 *
 * Slot indices are 0-based and run clockwise around the disc. The window is fixed, so turning the
 * disc clockwise brings the *previous* slot (counter-clockwise neighbour) into the window:
 *   rotate(id, 'cw')  → slot - 1 (mod 3)
 *   rotate(id, 'ccw') → slot + 1 (mod 3)
 */
export type Dir = 'cw' | 'ccw';

export interface WheelSpec {
  id: number;
  slots: readonly number[];
  correct: number;
  start: number;
}

export const SLOT_COUNT = 3;

export function stepSlot(slot: number, dir: Dir): number {
  const d = dir === 'cw' ? -1 : 1;
  return (((slot + d) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
}

export class LockModel {
  private readonly specs: WheelSpec[];
  private readonly index = new Map<number, number>();
  private positions: number[];

  constructor(specs: readonly WheelSpec[]) {
    this.specs = specs.map((s) => ({ ...s, slots: [...s.slots] }));
    this.specs.forEach((s, i) => this.index.set(s.id, i));
    this.positions = this.specs.map((s) => s.start);
  }

  get ids(): number[] {
    return this.specs.map((s) => s.id);
  }

  private idx(id: number): number {
    const i = this.index.get(id);
    if (i === undefined) throw new Error(`unknown wheel id ${id}`);
    return i;
  }

  spec(id: number): WheelSpec {
    return this.specs[this.idx(id)];
  }

  get(id: number): number {
    return this.positions[this.idx(id)];
  }

  /** The number currently in the window. */
  value(id: number): number {
    const i = this.idx(id);
    return this.specs[i].slots[this.positions[i]];
  }

  rotate(id: number, dir: Dir): number {
    const i = this.idx(id);
    this.positions[i] = stepSlot(this.positions[i], dir);
    return this.positions[i];
  }

  setSlot(id: number, slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) throw new Error(`bad slot ${slot}`);
    this.positions[this.idx(id)] = slot;
  }

  isCorrect(id: number): boolean {
    const i = this.idx(id);
    return this.positions[i] === this.specs[i].correct;
  }

  isSolved(): boolean {
    return this.specs.every((s, i) => this.positions[i] === s.correct);
  }

  correctCount(): number {
    return this.specs.reduce((n, s, i) => n + (this.positions[i] === s.correct ? 1 : 0), 0);
  }

  /** Back to the configured start slots. */
  reset(): void {
    this.positions = this.specs.map((s) => s.start);
  }

  snapshot(): number[] {
    return [...this.positions];
  }

  /** Every wheel one slot before its correct one (one ccw step from correct). Operator test aid. */
  setAllCorrectMinusOne(): void {
    this.positions = this.specs.map((s) => (s.correct + SLOT_COUNT - 1) % SLOT_COUNT);
  }

  /** All wheels correct except the last, which is one step off (the `?solve` dev flag). */
  setOneMoveFromSolved(): void {
    this.positions = this.specs.map((s) => s.correct);
    const last = this.specs.length - 1;
    this.positions[last] = (this.specs[last].correct + SLOT_COUNT - 1) % SLOT_COUNT;
  }
}
