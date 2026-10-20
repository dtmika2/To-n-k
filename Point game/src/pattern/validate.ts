import type { Settings } from '../config/settings.ts';
import { dist, distToSegment } from './geometry.ts';
import { noteToMidi } from './notes.ts';
import { ASPECT, POINT_COUNT, SEQUENCE_LENGTH, toWorld, type Pattern } from './types.ts';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

type ValidatorSettings = Pick<Settings, 'hit' | 'master' | 'creative' | 'validator'>;

/** Plan §8: hard rules for pattern.json, plus a few warnings. */
export function validatePattern(pattern: Pattern, s: ValidatorSettings): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { points, sequence } = pattern;

  if (points.length !== POINT_COUNT) errors.push(`expected ${POINT_COUNT} points, found ${points.length}`);
  const byId = new Map(points.map((p) => [p.id, p]));
  if (byId.size !== points.length) errors.push('point ids are not unique');
  for (const p of points) {
    if (!p.note) errors.push(`point ${p.id}: note is missing`);
    else if (noteToMidi(p.note) === null) errors.push(`point ${p.id}: note "${p.note}" does not parse`);
    if (!(p.r > 0)) errors.push(`point ${p.id}: radius must be positive`);
  }

  if (sequence.length !== SEQUENCE_LENGTH) errors.push(`sequence must have ${SEQUENCE_LENGTH} touches, has ${sequence.length}`);
  for (const id of sequence) if (!byId.has(id)) errors.push(`sequence uses unknown id ${id}`);
  const start = sequence[0];
  const end = sequence[sequence.length - 1];
  if (sequence.length > 0) {
    if (start === end) errors.push('start and end are the same point');
    if (sequence.filter((id) => id === end).length > 1) errors.push(`end point ${end} appears more than once`);
  }
  for (let i = 1; i < sequence.length; i++) {
    if (sequence[i] === sequence[i - 1]) errors.push(`point ${sequence[i]} follows itself at step ${i}`);
  }

  // The reveal figure: known eyes, joined in order (it is only drawn, never traced, so no segment rules).
  const figure = pattern.figure ?? [];
  if (pattern.figure && figure.length < 2) errors.push('figure needs at least two points');
  for (const id of figure) if (!byId.has(id)) errors.push(`figure uses unknown id ${id}`);
  for (let i = 1; i < figure.length; i++) {
    if (figure[i] === figure[i - 1]) errors.push(`figure: point ${figure[i]} follows itself at step ${i}`);
  }

  // Points overlapping each other or the master/creative buttons.
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j];
      const d = dist(toWorld(a), toWorld(b));
      if (d < a.r + b.r) errors.push(`points ${a.id} and ${b.id} overlap`);
      else if (d < s.hit.correctScale * Math.max(a.r, b.r) + s.hit.wrongScale * Math.min(a.r, b.r)) {
        warnings.push(`points ${a.id} and ${b.id} are close: a generous hit on one reaches the other's wrong radius`);
      }
    }
    for (const [name, m] of [
      ['master', s.master],
      ['creative', s.creative],
    ] as const) {
      if (dist(toWorld(a), toWorld(m)) < a.r * s.hit.correctScale + m.r * s.hit.masterScale) {
        errors.push(`point ${a.id} overlaps the ${name} button's hit area`);
      }
    }
    const ex = s.validator.edgeWarnFraction;
    const ny = a.r / ASPECT;
    if (a.x - a.r < ex || a.x + a.r > 1 - ex || a.y - ny < ex || a.y + ny > 1 - ex) {
      warnings.push(`point ${a.id} is within ${Math.round(ex * 100)}% of the screen edge`);
    }
  }

  // Segments passing too close to points that are not their endpoints.
  for (let i = 1; i < sequence.length; i++) {
    const a = byId.get(sequence[i - 1]);
    const b = byId.get(sequence[i]);
    if (!a || !b) continue;
    for (const p of points) {
      if (p.id === a.id || p.id === b.id) continue;
      const d = distToSegment(toWorld(p), toWorld(a), toWorld(b));
      if (d < s.hit.wrongScale * p.r + s.validator.segmentMargin) {
        errors.push(`segment ${i} (${a.id}→${b.id}) passes too close to point ${p.id}`);
      }
    }
  }

  return { errors, warnings };
}
