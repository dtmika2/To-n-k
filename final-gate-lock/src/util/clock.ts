/**
 * Game clock. Everything animated or timed in the app reads `clock.now` (ms), which advances by
 * the frame delta × `speed`. The `?speed=N` test flag therefore shortens every timing uniformly.
 */
export interface Timers {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

interface Pending {
  at: number;
  fn: () => void;
}

export class Clock implements Timers {
  now = 0;
  speed = 1;
  /** Last scaled delta (ms). */
  dt = 0;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  /** Advance by a real frame delta (ms). Returns the scaled delta. */
  tick(realDtMs: number): number {
    // Clamp huge gaps (tab in background) so animations don't jump wildly.
    const dt = Math.min(realDtMs, 100) * this.speed;
    this.now += dt;
    this.dt = dt;
    this.runDue();
    return dt;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.pending.set(id, { at: this.now + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(handle: number): void {
    this.pending.delete(handle);
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  private runDue() {
    if (this.pending.size === 0) return;
    const due: [number, Pending][] = [];
    for (const entry of this.pending) if (entry[1].at <= this.now) due.push(entry);
    due.sort((a, b) => a[1].at - b[1].at);
    for (const [id, p] of due) {
      if (!this.pending.has(id)) continue; // cleared by an earlier callback
      this.pending.delete(id);
      p.fn();
    }
  }
}
