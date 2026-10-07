export type Row = 'top' | 'middle' | 'bottom';
export type VisualMode = 'procedural' | 'sprites';

export interface WheelConfig {
  id: number;
  row: Row;
  /** Three numbers, slot 0..2, clockwise around the disc. */
  slots: [number, number, number];
  correct: number;
  start: number;
}

export interface Timings {
  resetAfterSuccessMs: number;
  asleepAfterIdleMs: number;
  blinkIntervalMs: [number, number];
  glanceIntervalMs: [number, number];
  settledToDrowsyMs: number;
  operatorHoldMs: number;
}

export interface AppConfig {
  wheels: WheelConfig[];
  timings: Timings;
  operator: { pin: string };
  visual: { mode: VisualMode; manifest: string };
  audio: { masterVolume: number };
}

export type ValidationResult = { ok: true; config: AppConfig } | { ok: false; errors: string[] };

const ROW_COUNTS: Record<Row, number> = { top: 3, middle: 4, bottom: 3 };
const ROW_ORDER: Row[] = ['top', 'middle', 'bottom'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isPositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function isRange(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && isPositive(v[0]) && isPositive(v[1]) && v[0] <= v[1];
}

/** Hand-written validation; returns every problem found, not just the first. */
export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['config is not a JSON object'] };

  const wheels = raw.wheels;
  if (!Array.isArray(wheels)) {
    errors.push('"wheels" must be an array');
  } else {
    if (wheels.length !== 10) errors.push(`expected 10 wheels, found ${wheels.length}`);
    const seenIds = new Set<number>();
    const seenValues = new Map<number, number>();
    let lastRowIdx = 0;
    const rowCounts: Record<Row, number> = { top: 0, middle: 0, bottom: 0 };
    wheels.forEach((w, i) => {
      const label = `wheel #${i + 1}`;
      if (!isObj(w)) {
        errors.push(`${label}: not an object`);
        return;
      }
      if (!isInt(w.id)) errors.push(`${label}: "id" must be an integer`);
      else if (seenIds.has(w.id)) errors.push(`${label}: duplicate id ${w.id}`);
      else seenIds.add(w.id);

      if (typeof w.row !== 'string' || !(w.row in ROW_COUNTS)) {
        errors.push(`${label}: "row" must be top, middle or bottom`);
      } else {
        const row = w.row as Row;
        rowCounts[row]++;
        const idx = ROW_ORDER.indexOf(row);
        if (idx < lastRowIdx) errors.push(`${label}: rows must be listed top, then middle, then bottom`);
        lastRowIdx = Math.max(lastRowIdx, idx);
      }

      const slots = w.slots;
      if (!Array.isArray(slots) || slots.length !== 3) {
        errors.push(`${label}: "slots" must have exactly 3 numbers`);
      } else {
        slots.forEach((s, k) => {
          if (!isInt(s) || s < 0 || s > 99) {
            errors.push(`${label}: slot ${k} must be an integer 0–99`);
          } else if (seenValues.has(s)) {
            errors.push(`${label}: number ${s} is already used by wheel #${seenValues.get(s)}`);
          } else {
            seenValues.set(s, i + 1);
          }
        });
      }

      const slotOk = (v: unknown) => isInt(v) && v >= 0 && v <= 2;
      if (!slotOk(w.correct)) errors.push(`${label}: "correct" must be a slot index 0, 1 or 2`);
      if (!slotOk(w.start)) errors.push(`${label}: "start" must be a slot index 0, 1 or 2`);
      if (slotOk(w.correct) && slotOk(w.start) && w.correct === w.start) {
        errors.push(`${label}: "start" must differ from "correct"`);
      }
    });
    if (wheels.length === 10) {
      for (const row of ROW_ORDER) {
        if (rowCounts[row] !== ROW_COUNTS[row]) {
          errors.push(`row "${row}" must have ${ROW_COUNTS[row]} wheels, found ${rowCounts[row]}`);
        }
      }
    }
  }

  const t = raw.timings;
  if (!isObj(t)) {
    errors.push('"timings" must be an object');
  } else {
    for (const key of ['resetAfterSuccessMs', 'asleepAfterIdleMs', 'settledToDrowsyMs', 'operatorHoldMs']) {
      if (!isPositive(t[key])) errors.push(`timings.${key} must be a positive number`);
    }
    for (const key of ['blinkIntervalMs', 'glanceIntervalMs']) {
      if (!isRange(t[key])) errors.push(`timings.${key} must be [min, max] with 0 < min ≤ max`);
    }
  }

  const op = raw.operator;
  if (!isObj(op) || typeof op.pin !== 'string' || !/^\d{4,8}$/.test(op.pin)) {
    errors.push('operator.pin must be a string of 4–8 digits');
  }

  const vis = raw.visual;
  if (!isObj(vis) || (vis.mode !== 'procedural' && vis.mode !== 'sprites') || typeof vis.manifest !== 'string') {
    errors.push('visual must be { mode: "procedural" | "sprites", manifest: string }');
  }

  const audio = raw.audio;
  if (
    !isObj(audio) ||
    typeof audio.masterVolume !== 'number' ||
    !(audio.masterVolume >= 0 && audio.masterVolume <= 1)
  ) {
    errors.push('audio.masterVolume must be a number between 0 and 1');
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, config: raw as unknown as AppConfig };
}

export async function loadConfig(url: string, fetchFn: typeof fetch = fetch): Promise<ValidationResult> {
  let raw: unknown;
  try {
    const res = await fetchFn(url, { cache: 'no-cache' });
    if (!res.ok) return { ok: false, errors: [`could not load ${url} (HTTP ${res.status})`] };
    raw = await res.json();
  } catch (e) {
    return { ok: false, errors: [`could not load or parse ${url}: ${(e as Error).message}`] };
  }
  return validateConfig(raw);
}
