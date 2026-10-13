import { test, expect, type Page } from '@playwright/test';
import { Touch, waitForBoot } from './helpers';

type A = {
  loaded: boolean;
  sources: Record<string, string[]>;
  played: string[];
  isDucked: boolean;
  activeLoops: string[];
  ctx: { state: string } | null;
};
type G = {
  audio: A;
  snap(): { state: string };
  toClient(x: number, y: number): { x: number; y: number };
  arrow(id: number, dir: string): { x: number; y: number };
};
const g = <T>(page: Page, fn: (g: G) => T) => page.evaluate(`(${fn.toString()})(window.__fgl)`) as Promise<T>;

/** A tiny valid PCM WAV (decodeAudioData sniffs the content, not the extension). */
function wav(seconds = 0.1, sr = 22050): Buffer {
  const n = Math.round(seconds * sr);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 3) * 8000), 44 + i * 2);
  return b;
}

async function tapArrow(page: Page, touch: Touch, id: number, dir: 'cw' | 'ccw') {
  const p = await page.evaluate(
    ([i, d]) => {
      const f = (window as unknown as { __fgl: G }).__fgl;
      const a = f.arrow(i as number, d as string);
      return f.toClient(a.x, a.y);
    },
    [id, dir],
  );
  await touch.tap(p.x, p.y);
}

test('no sound files at all: app runs silently, every cue reported missing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?skip-intro');
  await waitForBoot(page);
  await expect.poll(() => g(page, (x) => x.audio.loaded)).toBe(true);
  const sources = await g(page, (x) => x.audio.sources);
  for (const list of Object.values(sources)) for (const s of list) expect(s).toBe('missing');
  const touch = await Touch.create(page);
  await tapArrow(page, touch, 1, 'cw');
  // the click plays when the heavy step lands (~650 ms)
  await expect.poll(() => g(page, (x) => x.audio.played)).toContain('detent_click');
  expect(errors).toEqual([]);
});

test('?placeholderSfx synthesises every cue; a real file wins over its placeholder', async ({ page }) => {
  await page.route('**/sfx/detent_click_1.ogg', (r) => r.fulfill({ status: 200, contentType: 'audio/ogg', body: wav() }));
  await page.goto('/?skip-intro&placeholderSfx');
  await waitForBoot(page);
  await expect.poll(() => g(page, (x) => x.audio.loaded)).toBe(true);
  const sources = await g(page, (x) => x.audio.sources);
  expect(sources.detent_click).toEqual(['file', 'placeholder', 'placeholder']);
  const all = Object.values(sources).flat();
  expect(all.filter((s) => s === 'missing')).toHaveLength(0);
  expect(all.length).toBe(1 + 2 + 1 + 3 + 1 + 3 + 2 + 2 + 3 + 4 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1);
});

test('first tap resumes the context; arrow, click, mist loop; ducking and cues through a success', async ({ page }) => {
  await page.goto('/?skip-intro&solve&placeholderSfx&speed=4');
  await waitForBoot(page);
  await expect.poll(() => g(page, (x) => x.audio.loaded)).toBe(true);
  const touch = await Touch.create(page);
  await tapArrow(page, touch, 1, 'cw'); // any tap resumes audio
  await expect.poll(() => g(page, (x) => x.audio.ctx?.state)).toBe('running');
  await expect.poll(() => g(page, (x) => x.audio.activeLoops)).toEqual(['eye_loop']); // no mist while playing
  await page.waitForTimeout(300);
  await tapArrow(page, touch, 1, 'ccw'); // back to correct
  await page.waitForTimeout(300);
  await tapArrow(page, touch, 10, 'cw'); // solves
  await expect.poll(() => g(page, (x) => x.snap().state)).toBe('Success');
  expect(await g(page, (x) => x.audio.isDucked)).toBe(true);
  // the core hums while it is revealed, then the hum leaves with it
  await expect.poll(() => g(page, (x) => x.audio.activeLoops), { timeout: 10_000, intervals: [50] }).toContain('core_hum');
  expect(await g(page, (x) => x.audio.isDucked)).toBe(false);
  await expect.poll(() => g(page, (x) => x.snap().state), { timeout: 10_000 }).toBe('Open');
  const played = await g(page, (x) => x.audio.played);
  for (const cue of ['arrow_tap', 'detent_click', 'success_stinger', 'eye_glowup', 'lock_clunk', 'plate_slide', 'dust_fall', 'reveal_whoosh']) {
    expect(played, cue).toContain(cue);
  }
  expect(played.indexOf('success_stinger')).toBeGreaterThan(played.lastIndexOf('arrow_tap'));
  await expect.poll(() => g(page, (x) => x.audio.activeLoops)).not.toContain('core_hum');
  expect(await g(page, (x) => x.audio.activeLoops)).not.toContain('mist_loop');
  // after reset: hum off, mist back, un-ducked
  await expect.poll(() => g(page, (x) => x.snap().state), { timeout: 20_000 }).toBe('Shrouded');
  expect(await g(page, (x) => x.audio.played)).toContain('reset_wind');
  await expect.poll(() => g(page, (x) => x.audio.activeLoops)).toEqual(['mist_loop']);
  expect(await g(page, (x) => x.audio.isDucked)).toBe(false);
});
