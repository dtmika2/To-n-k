/**
 * Keeps the screen awake. Requested on the first tap (needs a user gesture on some browsers) and
 * re-requested whenever the page becomes visible again, because the browser drops the lock on hide.
 */
interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', fn: () => void): void;
}

export class WakeLock {
  private sentinel: WakeLockSentinelLike | null = null;
  private wanted = false;
  /** Count of successful acquisitions, for diagnostics. */
  acquired = 0;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wanted) void this.request();
    });
  }

  get active(): boolean {
    return !!this.sentinel && !this.sentinel.released;
  }

  async request(): Promise<void> {
    this.wanted = true;
    if (this.active) return;
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> } })
      .wakeLock;
    if (!wl) return;
    try {
      this.sentinel = await wl.request('screen');
      this.acquired++;
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
    } catch (e) {
      console.warn('[wakeLock] request failed:', (e as Error).message);
    }
  }
}
