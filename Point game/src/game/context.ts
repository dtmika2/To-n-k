import type { Settings } from '../config/settings.ts';
import { toWorld, type Pattern } from '../pattern/types.ts';
import type { GameContext } from './types.ts';

export function buildContext(pattern: Pattern, s: Pick<Settings, 'timing' | 'hit' | 'master' | 'game'>): GameContext {
  return {
    points: pattern.points.map((p) => ({ id: p.id, pos: toWorld(p), r: p.r })),
    sequence: [...pattern.sequence],
    master: { pos: toWorld(s.master), r: s.master.r },
    timing: { ...s.timing },
    hit: { ...s.hit },
    allowSkipDemo: s.game.allowSkipDemo,
  };
}
