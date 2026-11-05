import { linkLabel, type SignalStatus } from './passSignal';

/**
 * Small corner label showing the link to the PC, because a tablet has no console to look at.
 * Test only: shown when the lock is started with `?signal`, never to players in the installed app,
 * where the operator menu shows the same line. Touches pass straight through it.
 */
export function createSignalBadge(): (s: SignalStatus) => void {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;right:8px;bottom:8px;z-index:50;pointer-events:none;padding:3px 8px;' +
    'border-radius:4px;color:#fff;font:12px/1.4 monospace;';
  document.body.appendChild(el);
  return (s) => {
    el.textContent = linkLabel(s);
    el.style.background =
      s.link === 'ok' ? 'rgba(20,110,60,.85)' : s.link === 'down' ? 'rgba(160,30,30,.9)' : 'rgba(70,70,70,.85)';
  };
}
