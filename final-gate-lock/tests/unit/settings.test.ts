import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { applySettings, clearSettings, loadSettings, sanitize, saveSettings } from '../../src/operator/settings';
import type { AppConfig } from '../../src/config';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const throwing = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
  removeItem() {
    throw new Error('blocked');
  },
} as unknown as Storage;

const cfg = JSON.parse(readFileSync('public/config.json', 'utf8')) as AppConfig;

describe('operator settings', () => {
  it('round-trips through storage', () => {
    const st = new MemStorage() as unknown as Storage;
    expect(saveSettings({ masterVolume: 0.4, visualMode: 'sprites', fps: true, timings: { resetAfterSuccessMs: 20000 } }, st)).toBe(true);
    expect(loadSettings(st)).toEqual({ masterVolume: 0.4, visualMode: 'sprites', fps: true, timings: { resetAfterSuccessMs: 20000 } });
    clearSettings(st);
    expect(loadSettings(st)).toEqual({});
  });

  it('survives blocked or missing storage', () => {
    expect(loadSettings(throwing)).toEqual({});
    expect(saveSettings({ fps: true }, throwing)).toBe(false);
    expect(() => clearSettings(throwing)).not.toThrow();
    expect(loadSettings(null)).toEqual({});
    expect(saveSettings({}, null)).toBe(false);
  });

  it('ignores corrupted JSON and malformed values', () => {
    const st = new MemStorage();
    st.setItem('final-gate-lock.settings.v1', '{nope');
    expect(loadSettings(st as unknown as Storage)).toEqual({});
    expect(
      sanitize({
        masterVolume: 7,
        visualMode: 'weird' as never,
        fps: 'yes' as never,
        timings: { resetAfterSuccessMs: -1, blinkIntervalMs: [9, 4], glanceIntervalMs: [1000, 2000] },
      }),
    ).toEqual({ timings: { glanceIntervalMs: [1000, 2000] } });
  });

  it('applies only timings, volume and mode over config.json', () => {
    const c = applySettings(cfg, { masterVolume: 0.2, visualMode: 'sprites', timings: { asleepAfterIdleMs: 5000 } });
    expect(c.audio.masterVolume).toBe(0.2);
    expect(c.visual.mode).toBe('sprites');
    expect(c.timings.asleepAfterIdleMs).toBe(5000);
    expect(c.timings.resetAfterSuccessMs).toBe(40000);
    expect(c.wheels).toBe(cfg.wheels);
    expect(applySettings(cfg, {})).toEqual(cfg);
  });
});
