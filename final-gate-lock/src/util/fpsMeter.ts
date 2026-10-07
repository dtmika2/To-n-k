/** Frame-time statistics, always collected (cheap), optionally shown as a DOM overlay. */
export class FrameStats {
  private times: number[] = [];
  private cursor = 0;
  private filled = 0;
  private el: HTMLDivElement | null = null;
  private lastPaint = 0;
  extra: () => string = () => '';

  constructor(private capacity = 600) {
    this.times = new Array(capacity).fill(0);
  }

  push(dtMs: number, nowMs: number): void {
    this.times[this.cursor] = dtMs;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.filled = Math.min(this.filled + 1, this.capacity);
    if (this.el && nowMs - this.lastPaint > 500) {
      this.lastPaint = nowMs;
      const s = this.summary();
      this.el.textContent = `${s.fps.toFixed(0)} fps  p95 ${s.p95.toFixed(1)} ms  max ${s.max.toFixed(1)} ms${this.extra()}`;
    }
  }

  summary(): { fps: number; avg: number; p95: number; max: number; frames: number } {
    const n = this.filled;
    if (!n) return { fps: 0, avg: 0, p95: 0, max: 0, frames: 0 };
    const arr = this.times.slice(0, n).sort((a, b) => a - b);
    const avg = arr.reduce((a, b) => a + b, 0) / n;
    return { fps: 1000 / avg, avg, p95: arr[Math.floor(n * 0.95)] ?? 0, max: arr[n - 1] ?? 0, frames: n };
  }

  reset(): void {
    this.filled = 0;
    this.cursor = 0;
  }

  setVisible(on: boolean): void {
    if (on && !this.el) {
      this.el = document.createElement('div');
      this.el.className = 'fps-meter';
      this.el.dataset.testid = 'fps';
      document.body.appendChild(this.el);
    } else if (!on && this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  get visible(): boolean {
    return !!this.el;
  }
}
