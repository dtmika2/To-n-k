let sentinel: WakeLockSentinel | null = null;
let listening = false;

/** Plan §10: keep the TV from sleeping. Re-acquired whenever the page becomes visible again. */
export function keepScreenAwake(): void {
  if (!('wakeLock' in navigator)) return;
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') keepScreenAwake();
    });
  }
  if (sentinel && !sentinel.released) return;
  navigator.wakeLock
    .request('screen')
    .then((s) => {
      sentinel = s;
    })
    .catch(() => {
      /* not allowed yet (e.g. before the first gesture); retried on the next touch */
    });
}
