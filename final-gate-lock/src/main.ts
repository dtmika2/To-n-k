import '@fontsource/cinzel/latin-700.css';
import './styles.css';
import { loadConfig } from './config';
import { parseFlags } from './flags';
import { showErrorScreen } from './app/errorScreen';
import { startApp } from './app/App';

async function boot() {
  const flags = parseFlags(location.search);
  const result = await loadConfig(flags.configUrl);
  if (!result.ok) {
    showErrorScreen('Configuration error', result.errors);
    (window as unknown as { __fglBoot: string }).__fglBoot = 'config-error';
    return;
  }
  try {
    await startApp(result.config, flags);
    (window as unknown as { __fglBoot: string }).__fglBoot = 'ok';
  } catch (e) {
    console.error(e);
    showErrorScreen('Startup error', [(e as Error).message]);
    (window as unknown as { __fglBoot: string }).__fglBoot = 'startup-error';
  }
}

// Block the long-press context menu and gesture zoom on the play screen.
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

void boot();
