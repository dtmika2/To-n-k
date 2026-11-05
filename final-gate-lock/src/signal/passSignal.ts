/**
 * Tells the PC behind the TV that the lock was passed.
 *
 * A pass is saved first, then sent until the server confirms it, so a Wi-Fi dropout or a watchdog
 * reload only delays it. Each pass has an id: the server ignores a retry it has already seen, so the
 * TV can't fire twice. A pass that can't be delivered within SIGNAL.maxAgeMs is dropped, so a PC
 * switched on the next morning doesn't fire the TV for yesterday's group.
 *
 * A heartbeat tells the TV page the tablet is still there, and measures the round trip.
 */
export const SIGNAL = {
  heartbeatMs: 3000,
  retryMinMs: 300,
  retryMaxMs: 5000,
  requestTimeoutMs: 3000,
  maxAgeMs: 10 * 60_000,
} as const;

export interface PendingPass {
  id: string;
  at: number;
}

export interface SignalStatus {
  link: 'connecting' | 'ok' | 'down';
  rttMs: number | null;
  /** Passes saved but not yet confirmed by the server. */
  waiting: number;
  error: string | null;
}

/** Sends one message; rejects unless the server confirmed it. */
export type SignalPost = (path: string, body: unknown) => Promise<void>;

export interface SignalStore {
  load(): PendingPass[];
  save(pending: PendingPass[]): void;
}

export class PassSignal {
  private pending: PendingPass[];
  private flushing = false;
  private stopped = false;
  private retryDelay: number = SIGNAL.retryMinMs;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private status: SignalStatus = { link: 'connecting', rttMs: null, waiting: 0, error: null };

  constructor(
    private readonly post: SignalPost,
    private readonly store: SignalStore,
    private readonly onStatus: (s: SignalStatus) => void = () => {},
  ) {
    this.pending = store.load();
  }

  /** Start the heartbeat and resend anything left over from before a reload. */
  start(): void {
    this.publish({});
    void this.flush();
    void this.beat();
  }

  /** The lock was passed. */
  passed(): void {
    // not crypto.randomUUID: it doesn't exist on a plain-HTTP page
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    this.pending.push({ id, at: Date.now() });
    this.store.save(this.pending);
    this.publish({});
    void this.flush();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    if (this.heartbeatTimer !== null) clearTimeout(this.heartbeatTimer);
    this.retryTimer = null;
    this.heartbeatTimer = null;
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.stopped) return;
    this.flushing = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    try {
      this.dropExpired();
      while (this.pending.length > 0) {
        const pass = this.pending[0];
        const started = Date.now();
        try {
          await this.post('/api/passed', pass);
        } catch (e) {
          if (this.stopped) return;
          this.markDown(e);
          this.retryTimer = setTimeout(() => void this.flush(), this.retryDelay);
          this.retryDelay = Math.min(this.retryDelay * 2, SIGNAL.retryMaxMs);
          return;
        }
        // replaced while this was in flight: the store belongs to the new signal now
        if (this.stopped) return;
        this.pending.shift();
        this.store.save(this.pending);
        this.retryDelay = SIGNAL.retryMinMs;
        this.markOk(started);
        this.dropExpired();
      }
    } finally {
      this.flushing = false;
    }
  }

  private async beat(): Promise<void> {
    const started = Date.now();
    try {
      await this.post('/api/ping', { rttMs: this.status.rttMs });
      if (this.stopped) return;
      this.markOk(started);
    } catch (e) {
      if (this.stopped) return;
      this.markDown(e);
    }
    this.heartbeatTimer = setTimeout(() => void this.beat(), SIGNAL.heartbeatMs);
  }

  private dropExpired(): void {
    const oldest = Date.now() - SIGNAL.maxAgeMs;
    const kept = this.pending.filter((p) => p.at >= oldest);
    if (kept.length === this.pending.length) return;
    this.pending = kept;
    this.store.save(kept);
    this.publish({});
  }

  private markOk(started: number): void {
    this.publish({ link: 'ok', rttMs: Math.max(0, Date.now() - started), error: null });
  }

  private markDown(e: unknown): void {
    this.publish({ link: 'down', error: e instanceof Error ? e.message : String(e) });
  }

  private publish(change: Partial<SignalStatus>): void {
    this.status = { ...this.status, ...change, waiting: this.pending.length };
    this.onStatus(this.status);
  }
}

/** One line for the operator menu and the test label. */
export function linkLabel(s: SignalStatus): string {
  const waiting = s.waiting > 0 ? ` · ${s.waiting} waiting` : '';
  if (s.link === 'ok') return `TV link OK · ${s.rttMs ?? '?'} ms${waiting}`;
  if (s.link === 'down') return `TV link DOWN · ${s.error ?? 'no reply'}${waiting}`;
  return `TV link connecting…${waiting}`;
}

const DEFAULT_PORT = '8787';

/**
 * What the operator typed → the server's base URL, or null if it isn't an address.
 * Accepts `192.168.2.51:8787`, `192.168.2.51` (default port) and a pasted `http://…/?signal` link.
 */
export function parsePcAddress(input: string): string | null {
  const raw = input.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  const host = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[:/?#]/)[0];
  if (!/^[a-z0-9.-]+$/i.test(host)) return null;
  // the URL parser would quietly turn a mistyped 192.168.2 into 192.168.0.2
  if (/^[\d.]+$/.test(host) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  try {
    const url = new URL(hasScheme ? raw : `http://${raw}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.protocol === 'http:' && !url.port) url.port = DEFAULT_PORT;
    return url.origin;
  } catch {
    return null;
  }
}

/** POST to the signal server. text/plain keeps it a "simple" request, so no CORS preflight. */
export function httpSignalPost(baseUrl: string): SignalPost {
  return async (path, body) => {
    const res = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SIGNAL.requestTimeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  };
}

const STORE_KEY = 'fgl.signal.pending';

/** Saved passes survive a reload. Storage failures only lose that protection, never the send. */
export const localSignalStore: SignalStore = {
  load() {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (p): p is PendingPass => typeof p?.id === 'string' && typeof p?.at === 'number',
      );
    } catch {
      return [];
    }
  },
  save(pending) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(pending));
    } catch {
      /* private mode or full storage */
    }
  },
};
