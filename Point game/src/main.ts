import './styles.css';
import { startApp } from './app/App.ts';

// A long press on Windows touch screens becomes a right-click; block it and gesture zoom everywhere.
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

startApp().catch((e: unknown) => {
  console.error(e);
  document.body.style.cursor = 'default';
  document.body.innerHTML = `<pre style="color:#f88;padding:24px;font:16px monospace">Startup error:\n${String((e as Error)?.stack ?? e)}</pre>`;
});
