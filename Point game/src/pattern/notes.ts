const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A minor pentatonic, E3–E6: the 16 notes the points are tuned to. */
export const SCALE = ['E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'];
export const START_NOTE = 'A3';
export const END_NOTE = 'A4';

/** MIDI number of a note name like "A4", "C#5" or "Eb3"; null if it does not parse. */
export function noteToMidi(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + SEMITONES[m[1]] + acc;
}

export function noteToFreq(name: string): number {
  const midi = noteToMidi(name);
  if (midi === null) throw new Error(`Unknown note "${name}"`);
  return 440 * Math.pow(2, (midi - 69) / 12);
}
