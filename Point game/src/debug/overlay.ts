import type { GameContext, GameState } from '../game/types.ts';

/** Plan §9, D key / ?debug: state, counters, timers and FPS. Hit radii and labels are drawn by the renderer. */
export class DebugOverlay {
  private readonly el: HTMLDivElement;
  visible = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.el.style.display = v ? 'block' : 'none';
  }

  update(s: GameState, ctx: GameContext, now: number, fps: number, extra: string): void {
    if (!this.visible) return;
    const t = ctx.timing;
    const secs = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
    const lift = s.liftTimerAt !== null ? secs(t.liftStrikeMs - (now - s.liftTimerAt)) : '—';
    const idle = s.mode === 'GAME' ? secs(t.inactivityMs - (now - s.lastInputAt)) : '—';
    const next = s.mode === 'GAME' && s.progress > 0 ? ctx.sequence[s.progress] ?? '—' : '—';
    this.el.textContent = [
      `${s.mode}${s.mode === 'GAME' ? ` / ${s.sub}` : ''}`,
      `progress ${s.progress}/${ctx.sequence.length}  next ${next}`,
      `wrong strikes ${s.wrongStrikes}  lift strikes ${s.liftStrikes}`,
      `lift timer ${lift}  inactivity ${idle}`,
      `pointer ${s.pointer ? `${s.pointer.id}${s.pointer.ignored ? ' (ignored)' : ''}` : '—'}  hysteresis [${s.inside.join(',')}]`,
      ...(s.mode === 'CREATIVE' ? [`chain ${s.chain.join(' → ') || '—'}`] : []),
      `${fps.toFixed(0)} fps  ${extra}`,
      `M menu · D overlay · P primitives · L look · E editor · R reset · 1–5 INTRO/GAME/REVEAL/IDLE/CREATIVE`,
    ].join('\n');
  }
}
