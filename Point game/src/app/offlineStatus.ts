/**
 * How far the offline copy is: for the D overlay, so staff know when a first start online can be
 * closed. The service worker saves every file of the install (its precache) before it switches on,
 * and until then a start without internet shows the browser's "no internet" page.
 */

export interface OfflineFacts {
  /** The browser has service workers (needs https or localhost). */
  supported: boolean;
  /** A service worker is switched on: the offline copy is complete. */
  active: boolean;
  /** A service worker is downloading: the first install, or an update when `active` too. */
  installing: boolean;
  /** Files in the precache so far. */
  saved: number;
  /** Files the install needs, or null when unknown (sw.js not reachable). */
  total: number | null;
}

export function describeOffline(f: OfflineFacts): string {
  if (!f.supported) return 'offline copy: not possible here (needs https or localhost)';
  if (f.active && f.installing) return `offline copy: ready ✓ · update downloading, keep online (this version works offline meanwhile)`;
  if (f.active) return `offline copy: ready ✓ (${f.saved} files)`;
  if (f.installing) {
    const of = f.total !== null ? `/${f.total}` : '';
    return `offline copy: saving ${f.saved}${of} files… keep online, don't close yet`;
  }
  return 'offline copy: none (no service worker: dev server, or not loaded online yet)';
}

/** Unique precache URLs listed in the built sw.js (`{url:"…",revision:…}`). */
export function countPrecacheEntries(swSource: string): number | null {
  const urls = new Set<string>();
  for (const m of swSource.matchAll(/url:"([^"]+)"/g)) urls.add(m[1]!);
  return urls.size > 0 ? urls.size : null;
}

/** Polls the browser's service worker and caches, at most once a second, while someone looks. */
export class OfflineStatus {
  text = 'offline copy: checking…';
  private lastAt = -Infinity;
  private busy = false;
  private total: number | null = null;

  tick(now: number): void {
    if (this.busy || now - this.lastAt < 1000) return;
    this.lastAt = now;
    this.busy = true;
    void this.refresh()
      .then((t) => (this.text = t))
      .catch(() => (this.text = 'offline copy: unknown (check failed)'))
      .finally(() => (this.busy = false));
  }

  private async refresh(): Promise<string> {
    const supported = 'serviceWorker' in navigator && 'caches' in window;
    if (!supported) return describeOffline({ supported, active: false, installing: false, saved: 0, total: null });
    const reg = await navigator.serviceWorker.getRegistration();
    const active = reg?.active?.state === 'activated';
    const installing = !!reg?.installing || !!reg?.waiting;
    let saved = 0;
    for (const name of await caches.keys()) {
      if (name.startsWith('workbox-precache')) saved += (await (await caches.open(name)).keys()).length;
    }
    // only needed while downloading, which is online anyway
    if (installing && !active && this.total === null) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}sw.js`, { cache: 'no-store' });
        if (res.ok) this.total = countPrecacheEntries(await res.text());
      } catch {
        /* offline: show the count without a total */
      }
    }
    return describeOffline({ supported, active, installing, saved, total: this.total });
  }
}
