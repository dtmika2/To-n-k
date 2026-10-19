import { END_NOTE, SCALE, START_NOTE } from './notes.ts';
import type { Pattern } from './types.ts';

export interface PitchAssignment {
  notes: Map<number, string>;
  /** Human-readable lines describing the result, for review. */
  report: string[];
}

/**
 * Plan §5: start = A3, end = A4; the other used points get the notes nearest the middle of the
 * range (ascending, in order of first appearance); unused points get the extreme notes.
 */
export function assignPitches(pattern: Pattern): PitchAssignment {
  const seq = pattern.sequence;
  const start = seq[0];
  const end = seq[seq.length - 1];
  const used: number[] = [];
  for (const id of seq) if (id !== start && id !== end && !used.includes(id)) used.push(id);
  const unused = pattern.points.map((p) => p.id).filter((id) => !seq.includes(id)).sort((a, b) => a - b);

  const rest = SCALE.filter((n) => n !== START_NOTE && n !== END_NOTE);
  const centre = (SCALE.length - 1) / 2;
  const byCentrality = [...rest].sort((a, b) => {
    const da = Math.abs(SCALE.indexOf(a) - centre);
    const db = Math.abs(SCALE.indexOf(b) - centre);
    return da - db || SCALE.indexOf(a) - SCALE.indexOf(b);
  });
  const ascending = (list: string[]) => [...list].sort((a, b) => SCALE.indexOf(a) - SCALE.indexOf(b));
  const middle = ascending(byCentrality.slice(0, used.length));
  const edges = ascending(byCentrality.slice(used.length));

  const notes = new Map<number, string>();
  notes.set(start, START_NOTE);
  notes.set(end, END_NOTE);
  used.forEach((id, i) => notes.set(id, middle[i] ?? middle[middle.length - 1] ?? START_NOTE));
  unused.forEach((id, i) => notes.set(id, edges[i] ?? edges[edges.length - 1] ?? SCALE[0]));

  const report = [
    `start ${start} = ${START_NOTE}, end ${end} = ${END_NOTE}`,
    `used (first appearance): ${used.map((id) => `${id}=${notes.get(id)}`).join(' ') || '—'}`,
    `unused: ${unused.map((id) => `${id}=${notes.get(id)}`).join(' ') || '—'}`,
    `melody: ${seq.map((id) => notes.get(id)).join(' ')}`,
  ];
  if (used.length !== 8 || unused.length !== 6) {
    report.push(`note: ${used.length} middle points and ${unused.length} unused points (plan default is 8 and 6)`);
  }
  return { notes, report };
}

export function withAssignedPitches(pattern: Pattern): Pattern {
  const { notes } = assignPitches(pattern);
  return { ...pattern, points: pattern.points.map((p) => ({ ...p, note: notes.get(p.id) ?? p.note })) };
}
