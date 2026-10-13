import { describe, it, expect, vi } from 'vitest';
import { CUES, type Cue } from '../../src/audio/sfx';
import { fileNames, synthesize } from '../../src/audio/placeholder';
import { AudioManager } from '../../src/audio/AudioManager';

describe('placeholder synthesis', () => {
  for (const cue of Object.keys(CUES) as Cue[]) {
    it(`${cue}: every variant is finite, non-empty and within range`, () => {
      for (let v = 0; v < CUES[cue].variants; v++) {
        const { samples, sampleRate } = synthesize(cue, v, 22050);
        expect(sampleRate).toBe(22050);
        expect(samples.length).toBeGreaterThan(100);
        let peak = 0;
        for (const x of samples) {
          expect(Number.isFinite(x)).toBe(true);
          peak = Math.max(peak, Math.abs(x));
        }
        expect(peak).toBeGreaterThan(0.01);
        expect(peak).toBeLessThanOrEqual(1.5);
      }
    });
  }

  it('loops fade in and out at the seams (no click)', () => {
    for (const cue of ['mist_loop', 'eye_loop', 'core_hum'] as const) {
      const { samples } = synthesize(cue, 0, 22050);
      expect(Math.abs(samples[0])).toBeLessThan(1e-6);
      expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.01);
    }
  });

  it('variants differ', () => {
    const a = synthesize('detent_click', 0, 22050).samples;
    const b = synthesize('detent_click', 1, 22050).samples;
    expect(a.slice(0, 50)).not.toEqual(b.slice(0, 50));
  });
});

describe('file name convention', () => {
  it('single-variant cues try <name> then <name>_1, mp3 before ogg', () => {
    expect(fileNames('mist_loop', 1)).toEqual([['mist_loop.mp3', 'mist_loop_1.mp3', 'mist_loop.ogg', 'mist_loop_1.ogg']]);
  });
  it('multi-variant cues use <name>_N (first also accepts <name>), mp3 before ogg', () => {
    expect(fileNames('detent_click', 3)).toEqual([
      ['detent_click_1.mp3', 'detent_click.mp3', 'detent_click_1.ogg', 'detent_click.ogg'],
      ['detent_click_2.mp3', 'detent_click_2.ogg'],
      ['detent_click_3.mp3', 'detent_click_3.ogg'],
    ]);
  });
});

describe('AudioManager without Web Audio', () => {
  it('runs silently: load, play, loop and duck never throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const am = new AudioManager(0.9, true, 'sfx/', (async () => new Response('', { status: 404 })) as unknown as typeof fetch);
    expect(am.ctx).toBeNull();
    await am.load();
    expect(am.loaded).toBe(true);
    expect(am.sources.detent_click).toEqual(['missing', 'missing', 'missing']);
    am.play('detent_click');
    am.loop('mist_loop', true);
    am.loop('mist_loop', false);
    am.duck(true);
    expect(am.isDucked).toBe(true);
    am.setMasterVolume(3);
    expect(am.masterVolume).toBe(1);
    am.unlock();
    expect(am.played).toEqual(['detent_click']);
    warn.mockRestore();
  });
});
