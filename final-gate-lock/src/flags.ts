/**
 * Dev URL flags.
 *   ?debug           FPS meter + hit-area outlines
 *   ?skip-intro      boot straight into Playable
 *   ?solve           start one move from solved (wheel 10 one step off)
 *   ?placeholderSfx  synthesise placeholder tones for missing sound files
 *   ?speed=N         run all animation and timers N× faster (tests)
 *   ?config=path     load an alternative config file (tests)
 *   ?sprites / ?procedural   force the visual mode for this session
 */
export interface Flags {
  debug: boolean;
  skipIntro: boolean;
  solve: boolean;
  placeholderSfx: boolean;
  speed: number;
  configUrl: string;
  visualMode: 'procedural' | 'sprites' | null;
  /** `?manifest=path`: use another sprite manifest (e.g. assets/test-sprites/manifest.json). */
  manifestUrl: string | null;
}

/** Only same-origin relative .json paths are accepted. */
const safeJsonPath = (v: string | null) => (v && /^[\w./-]+\.json$/.test(v) && !v.includes('..') ? v : null);

export function parseFlags(search: string): Flags {
  const p = new URLSearchParams(search);
  const speedRaw = Number(p.get('speed'));
  const speed = Number.isFinite(speedRaw) && speedRaw > 0 ? Math.min(Math.max(speedRaw, 0.1), 500) : 1;
  const configUrl = safeJsonPath(p.get('config')) ?? 'config.json';
  return {
    manifestUrl: safeJsonPath(p.get('manifest')),
    debug: p.has('debug'),
    skipIntro: p.has('skip-intro'),
    solve: p.has('solve'),
    placeholderSfx: p.has('placeholderSfx'),
    speed,
    configUrl,
    visualMode: p.has('sprites') ? 'sprites' : p.has('procedural') ? 'procedural' : null,
  };
}
