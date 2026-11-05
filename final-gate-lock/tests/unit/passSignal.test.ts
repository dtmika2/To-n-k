import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  linkLabel,
  parsePcAddress,
  PassSignal,
  SIGNAL,
  type PendingPass,
  type SignalStatus,
  type SignalStore,
} from '../../src/signal/passSignal';

function memoryStore(initial: PendingPass[] = []): SignalStore & { saved: PendingPass[] } {
  return {
    saved: initial,
    load() {
      return [...this.saved];
    },
    save(p) {
      this.saved = [...p];
    },
  };
}

/** A server that can be switched off, recording what reached it. */
function fakeServer() {
  const server = {
    up: true,
    passes: [] as PendingPass[],
    pings: 0,
    post: async (path: string, body: unknown) => {
      if (!server.up) throw new Error('Failed to fetch');
      if (path === '/api/passed') server.passes.push(body as PendingPass);
      else server.pings++;
    },
  };
  return server;
}

describe('PassSignal', () => {
  let signal: PassSignal | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    signal?.stop();
    signal = null;
    vi.useRealTimers();
  });

  it('sends a pass once and clears it when confirmed', async () => {
    const server = fakeServer();
    const store = memoryStore();
    signal = new PassSignal(server.post, store);
    signal.start();
    signal.passed();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.passes).toHaveLength(1);
    expect(store.saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(SIGNAL.heartbeatMs * 3);
    expect(server.passes).toHaveLength(1);
  });

  it('keeps retrying through an outage, with the same id, then delivers', async () => {
    const server = fakeServer();
    server.up = false;
    const store = memoryStore();
    const seen: SignalStatus[] = [];
    signal = new PassSignal(server.post, store, (s) => seen.push(s));
    signal.start();
    signal.passed();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(store.saved).toHaveLength(1);
    expect(seen.at(-1)).toMatchObject({ link: 'down', waiting: 1, error: 'Failed to fetch' });
    const { id } = store.saved[0];

    server.up = true;
    await vi.advanceTimersByTimeAsync(SIGNAL.retryMaxMs);
    expect(server.passes.map((p) => p.id)).toEqual([id]);
    expect(store.saved).toEqual([]);
    expect(seen.at(-1)).toMatchObject({ link: 'ok', waiting: 0, error: null });
  });

  it('backs off between retries up to the limit', async () => {
    const post = vi.fn(async (path: string) => {
      if (path === '/api/passed') throw new Error('down');
    });
    signal = new PassSignal(post, memoryStore());
    signal.passed();
    const attempts = () => post.mock.calls.filter(([p]) => p === '/api/passed').length;
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts()).toBe(1);
    await vi.advanceTimersByTimeAsync(SIGNAL.retryMinMs);
    expect(attempts()).toBe(2);
    await vi.advanceTimersByTimeAsync(SIGNAL.retryMinMs); // now waiting twice as long
    expect(attempts()).toBe(2);
    await vi.advanceTimersByTimeAsync(SIGNAL.retryMinMs);
    expect(attempts()).toBe(3);
    await vi.advanceTimersByTimeAsync(SIGNAL.retryMaxMs * 3); // long enough to reach the limit
    const before = attempts();
    await vi.advanceTimersByTimeAsync(SIGNAL.retryMaxMs * 10);
    expect(attempts() - before).toBe(10);
  });

  it('resends a pass saved before a reload, keeping its id', async () => {
    const server = fakeServer();
    const store = memoryStore([{ id: 'from-before', at: Date.now() }]);
    signal = new PassSignal(server.post, store);
    signal.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.passes.map((p) => p.id)).toEqual(['from-before']);
    expect(store.saved).toEqual([]);
  });

  it('drops a pass that is too old instead of firing the TV late', async () => {
    const server = fakeServer();
    const store = memoryStore([{ id: 'stale', at: Date.now() - SIGNAL.maxAgeMs - 1 }]);
    signal = new PassSignal(server.post, store);
    signal.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.passes).toEqual([]);
    expect(store.saved).toEqual([]);
  });

  it('stops retrying a pass once it expires during an outage', async () => {
    const server = fakeServer();
    server.up = false;
    const store = memoryStore();
    signal = new PassSignal(server.post, store);
    signal.passed();
    await vi.advanceTimersByTimeAsync(SIGNAL.maxAgeMs + SIGNAL.retryMaxMs * 2);
    expect(store.saved).toEqual([]);
    server.up = true;
    await vi.advanceTimersByTimeAsync(SIGNAL.retryMaxMs * 2);
    expect(server.passes).toEqual([]);
  });

  it('delivers two passes in order', async () => {
    const server = fakeServer();
    signal = new PassSignal(server.post, memoryStore());
    signal.passed();
    signal.passed();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.passes).toHaveLength(2);
    expect(server.passes[0].id).not.toBe(server.passes[1].id);
  });

  it('reports the link going down and coming back through the heartbeat', async () => {
    const server = fakeServer();
    const seen: SignalStatus[] = [];
    signal = new PassSignal(server.post, memoryStore(), (s) => seen.push(s));
    signal.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)?.link).toBe('ok');
    server.up = false;
    await vi.advanceTimersByTimeAsync(SIGNAL.heartbeatMs);
    expect(seen.at(-1)?.link).toBe('down');
    server.up = true;
    await vi.advanceTimersByTimeAsync(SIGNAL.heartbeatMs);
    expect(seen.at(-1)?.link).toBe('ok');
    expect(server.pings).toBeGreaterThanOrEqual(2);
  });

  it('hands a waiting pass to the new PC when the address changes', async () => {
    const oldPc = fakeServer();
    oldPc.up = false;
    const newPc = fakeServer();
    const store = memoryStore();
    const first = new PassSignal(oldPc.post, store);
    first.passed();
    await vi.advanceTimersByTimeAsync(1000);
    first.stop();

    signal = new PassSignal(newPc.post, store);
    signal.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(newPc.passes).toHaveLength(1);
    expect(store.saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(SIGNAL.retryMaxMs * 2);
    expect(oldPc.passes).toEqual([]);
  });

  it('a replaced signal leaves the store and the status alone when its request finishes', async () => {
    let finish = () => {};
    const slow = () => new Promise<void>((ok) => (finish = ok));
    const store = memoryStore();
    const seen: SignalStatus[] = [];
    const old = new PassSignal(slow, store, (s) => seen.push(s));
    old.passed();
    const saved = [...store.saved];
    const before = seen.length;
    old.stop();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.saved).toEqual(saved);
    expect(seen).toHaveLength(before);
  });
});

describe('parsePcAddress', () => {
  it('accepts what the operator is likely to type or paste', () => {
    expect(parsePcAddress('192.168.2.51:8787')).toBe('http://192.168.2.51:8787');
    expect(parsePcAddress('  192.168.2.51:8788 ')).toBe('http://192.168.2.51:8788');
    expect(parsePcAddress('192.168.2.51')).toBe('http://192.168.2.51:8787');
    expect(parsePcAddress('http://192.168.2.51:8787/?signal')).toBe('http://192.168.2.51:8787');
    expect(parsePcAddress('gate-pc.local:8787')).toBe('http://gate-pc.local:8787');
  });

  it('rejects typing mistakes and anything that is not an address', () => {
    for (const bad of ['', '   ', '192.168.2', '192,168,2,51', '192.168.2.51:port', '192.168.2.51:99999', 'a b', 'javascript:alert(1)', 'ftp://192.168.2.51', 'user@192.168.2.51']) {
      expect(parsePcAddress(bad), bad).toBeNull();
    }
  });
});

describe('linkLabel', () => {
  const status: SignalStatus = { link: 'ok', rttMs: 12, waiting: 0, error: null };
  it('describes each state', () => {
    expect(linkLabel(status)).toBe('TV link OK · 12 ms');
    expect(linkLabel({ ...status, link: 'down', error: 'Failed to fetch', waiting: 2 })).toBe('TV link DOWN · Failed to fetch · 2 waiting');
    expect(linkLabel({ ...status, link: 'connecting' })).toBe('TV link connecting…');
  });
});
