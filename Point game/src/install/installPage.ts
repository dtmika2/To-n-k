/**
 * install.html: one Install button for the PWA (Chrome's beforeinstallprompt), plus whether the
 * offline copy is ready. The service worker is registered by vite-plugin-pwa on this page too, so
 * opening this page alone is enough to install and precache everything.
 */
export {}; // a module: its names must not clash with the browser's globals (open, status)

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const button = document.getElementById('install') as HTMLButtonElement;
const open = document.getElementById('open') as HTMLAnchorElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const offline = document.getElementById('offline') as HTMLParagraphElement;
const help = document.getElementById('help') as HTMLDetailsElement;

let deferred: InstallPromptEvent | null = null;

function say(text: string, ok = false) {
  status.textContent = text;
  status.classList.toggle('ok', ok);
}

function installed() {
  deferred = null;
  button.hidden = true;
  open.hidden = false;
  say('Installed. Open it from its icon (a gold eye).', true);
}

if (window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) {
  installed();
} else {
  // Chrome and Edge fire this only when the app can be installed (and isn't already)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    button.disabled = false;
    say('Ready to install.');
  });
  window.addEventListener('appinstalled', installed);

  button.addEventListener('click', async () => {
    if (!deferred) return;
    const prompt = deferred;
    deferred = null;
    button.disabled = true;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'dismissed') say('Install cancelled. Reload the page to try again.');
  });

  // no prompt after a while: already installed, or a browser without it (iPhone, iPad, Firefox)
  setTimeout(() => {
    if (!deferred && !button.hidden && button.disabled) {
      say('The button isn’t offered here. It may already be installed; otherwise see the steps below.');
      open.hidden = false;
      help.open = true;
    }
  }, 6000);
}

// offline copy: the service worker precaches every file before it activates
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.ready.then(() => {
    offline.textContent = 'All files saved: works offline.';
    offline.classList.add('ok');
  });
} else {
  offline.textContent = 'This browser can’t save the app for offline use.';
}
