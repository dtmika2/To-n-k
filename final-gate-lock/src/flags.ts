/**
 * Dev URL flags.
 *   ?debug           FPS meter + hit-area outlines
 *   ?skip-intro      boot straight into Playable
 *   ?solve           start one move from solved (wheel 10 one step off)
 *   ?placeholderSfx  synthesise placeholder tones for missing sound files
 *   ?speed=N         run all animation and timers N× faster (tests)
 *   ?config=path     load an alternative config file (tests)
 *   ?sprites / ?procedural   force the visual mode for this session
 *   ?signal          tell the signal server that served this page when the lock is passed
 *   ?signal=URL      the same, for a server elsewhere (e.g. http://192.168.1.50:8787)
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
  /** Base URL of the signal server: '' is this page's own server, null means no signal. */
  signalUrl: string | null;
}

/** Only same-origin relative .json paths are accepted. */
const safeJsonPath = (v: string | null) => (v && /^[\w./-]+\.json$/.test(v) && !v.includes('..') ? v : null);

function parseSignalUrl(p: URLSearchParams): string | null {
  const value = p.get('signal');
  if (value === null) return null;
  if (value === '') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function parseFlags(search: string): Flags {
  const p = new URLSearchParams(search);
  const speedRaw = Number(p.get('speed'));
  const speed = Number.isFinite(speedRaw) && speedRaw > 0 ? Math.min(Math.max(speedRaw, 0.1), 500) : 1;
  const configUrl = safeJsonPath(p.get('config')) ?? 'config.json';
  return {
    manifestUrl: safeJsonPath(p.get('manifest')),
    signalUrl: parseSignalUrl(p),
    debug: p.has('debug'),
    skipIntro: p.has('skip-intro'),
    solve: p.has('solve'),
    placeholderSfx: p.has('placeholderSfx'),
    speed,
    configUrl,
    visualMode: p.has('sprites') ? 'sprites' : p.has('procedural') ? 'procedural' : null,
  };
}
