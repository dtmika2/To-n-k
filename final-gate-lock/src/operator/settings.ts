/**
 * Operator settings persisted in localStorage (config.json stays the default).
 * Every access is wrapped in try/catch: private mode or blocked storage must never break the lock.
 */
import type { AppConfig, Timings, VisualMode } from '../config';

export interface OperatorSettings {
  masterVolume?: number;
  visualMode?: VisualMode;
  fps?: boolean;
  timings?: Partial<Timings>;
}

const KEY = 'final-gate-lock.settings.v1';

export function loadSettings(storage: Storage | null = safeStorage()): OperatorSettings {
  if (!storage) return {};
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as OperatorSettings;
    return v && typeof v === 'object' ? sanitize(v) : {};
  } catch {
    return {};
  }
}

export function saveSettings(s: OperatorSettings, storage: Storage | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(sanitize(s)));
    return true;
  } catch {
    return false;
  }
}

export function clearSettings(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const pos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Drop anything malformed so a corrupted entry can't break boot. */
export function sanitize(s: OperatorSettings): OperatorSettings {
  const out: OperatorSettings = {};
  if (typeof s.masterVolume === 'number' && s.masterVolume >= 0 && s.masterVolume <= 1) out.masterVolume = s.masterVolume;
  if (s.visualMode === 'procedural' || s.visualMode === 'sprites') out.visualMode = s.visualMode;
  if (typeof s.fps === 'boolean') out.fps = s.fps;
  if (s.timings && typeof s.timings === 'object') {
    const t: Partial<Timings> = {};
    for (const k of ['resetAfterSuccessMs', 'asleepAfterIdleMs', 'settledToDrowsyMs', 'operatorHoldMs'] as const) {
      if (pos(s.timings[k])) t[k] = s.timings[k];
    }
    for (const k of ['blinkIntervalMs', 'glanceIntervalMs'] as const) {
      const r = s.timings[k];
      if (Array.isArray(r) && r.length === 2 && pos(r[0]) && pos(r[1]) && r[0] <= r[1]) t[k] = [r[0], r[1]];
    }
    if (Object.keys(t).length) out.timings = t;
  }
  return out;
}

/** config.json + operator overrides (only timings, volume and visual mode can be overridden). */
export function applySettings(config: AppConfig, s: OperatorSettings): AppConfig {
  return {
    ...config,
    timings: { ...config.timings, ...(s.timings ?? {}) },
    audio: { ...config.audio, masterVolume: s.masterVolume ?? config.audio.masterVolume },
    visual: { ...config.visual, mode: s.visualMode ?? config.visual.mode },
  };
}
