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
}

export function parseFlags(search: string): Flags {
  const p = new URLSearchParams(search);
  const speedRaw = Number(p.get('speed'));
  const speed = Number.isFinite(speedRaw) && speedRaw > 0 ? Math.min(Math.max(speedRaw, 0.1), 500) : 1;
  const cfg = p.get('config');
  // Only same-origin relative paths are accepted.
  const configUrl = cfg && /^[\w./-]+\.json$/.test(cfg) && !cfg.includes('..') ? cfg : 'config.json';
  return {
    debug: p.has('debug'),
    skipIntro: p.has('skip-intro'),
    solve: p.has('solve'),
    placeholderSfx: p.has('placeholderSfx'),
    speed,
    configUrl,
    visualMode: p.has('sprites') ? 'sprites' : p.has('procedural') ? 'procedural' : null,
  };
}
