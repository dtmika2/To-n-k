/**
 * Operator overlay (plain DOM over the canvas — the only place with text). PIN pad first; a wrong
 * PIN closes the pad. The menu auto-closes after 60 s without input.
 */
import type { Timings, VisualMode } from '../config';

export interface OperatorActions {
  resetToShrouded(): void;
  forceOpen(): void;
  setSolutionVisible(on: boolean): void;
  getSolutionVisible(): boolean;
  setCorrectMinusOne(): void;
  soundTest(): void;
  beep(): void;
  getVolume(): number;
  setVolume(v: number): void;
  getVisualMode(): VisualMode;
  setVisualMode(m: VisualMode): Promise<void>;
  getFps(): boolean;
  setFps(on: boolean): void;
  getTimings(): Timings;
  setTimings(t: Partial<Timings>): void;
  /** Game-clock timers (so `?speed` also shortens the auto-close in tests). */
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(h: number): void;
  status(): string;
}

export const AUTO_CLOSE_MS = 60_000;

/** "Version 0.1.0 · build 57 · 610732d · 2026-10-13" (filled in by vite.config.ts at build time). */
export function versionLabel(): string {
  if (typeof __BUILD__ === 'undefined') return 'Version unknown';
  const b = __BUILD__;
  return [`Version ${b.version}`, b.build && `build ${b.build}`, b.commit, b.date].filter(Boolean).join(' · ');
}

const TIMING_FIELDS: { key: keyof Timings; label: string }[] = [
  { key: 'resetAfterSuccessMs', label: 'Reset after success (s)' },
  { key: 'resetAfterIdleMs', label: 'Reset after idle (s)' },
  { key: 'settledToDrowsyMs', label: 'Settled → drowsy (s)' },
  { key: 'operatorHoldMs', label: 'Operator hold (s)' },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('data-')) e.setAttribute(k, v);
    else e.setAttribute(k, v);
  }
  if (text !== undefined) e.textContent = text;
  return e;
}

export class OperatorMenu {
  private overlay: HTMLDivElement | null = null;
  private idleTimer: number | null = null;
  /** 'pin' | 'menu' | null */
  view: 'pin' | 'menu' | null = null;

  constructor(
    private pin: string,
    private a: OperatorActions,
  ) {}

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  openPin(): void {
    this.close();
    this.mount();
    this.view = 'pin';
    const box = el('div', { class: 'op-box op-pin' });
    const display = el('div', { class: 'op-pin-display', 'data-testid': 'op-pin-display' }, '');
    let entry = '';
    const render = () => (display.textContent = '•'.repeat(entry.length));
    const keys = el('div', { class: 'op-keys' });
    const press = (k: string) => {
      this.touch();
      if (k === '⌫') entry = entry.slice(0, -1);
      else if (k === 'OK') {
        if (entry === this.pin) {
          this.a.beep();
          this.openMenu();
        } else {
          this.close(); // wrong PIN closes the pad
        }
        return;
      } else if (entry.length < 8) entry += k;
      render();
    };
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK']) {
      const b = el('button', { class: 'op-key', 'data-testid': `op-key-${k === '⌫' ? 'del' : k}`, type: 'button' }, k);
      b.addEventListener('click', () => press(k));
      keys.appendChild(b);
    }
    const cancel = el('button', { class: 'op-btn op-ghost', 'data-testid': 'op-pin-cancel', type: 'button' }, 'Cancel');
    cancel.addEventListener('click', () => this.close());
    box.append(el('h2', {}, 'Operator PIN'), display, keys, cancel);
    this.overlay!.appendChild(box);
  }

  private openMenu(): void {
    const ov = this.overlay!;
    ov.replaceChildren();
    this.view = 'menu';
    const box = el('div', { class: 'op-box op-menu', 'data-testid': 'op-menu' });
    const status = el('div', { class: 'op-status', 'data-testid': 'op-status' }, this.a.status());
    const action = (label: string, id: string, fn: () => void, cls = 'op-btn') => {
      const b = el('button', { class: cls, 'data-testid': `op-${id}`, type: 'button' }, label);
      b.addEventListener('click', () => {
        this.touch();
        this.a.beep();
        fn();
        status.textContent = this.a.status();
      });
      return b;
    };

    const actions = el('div', { class: 'op-grid' });
    actions.append(
      action('Reset to Shrouded', 'reset', () => {
        this.a.resetToShrouded();
        this.close();
      }),
      action('Force open', 'force-open', () => {
        this.a.forceOpen();
        this.close();
      }),
      action(`Show solution: ${this.a.getSolutionVisible() ? 'ON' : 'off'}`, 'solution', () => {}, 'op-btn op-toggle'),
      action('All wheels correct − 1', 'minus-one', () => this.a.setCorrectMinusOne()),
      action('Sound test', 'sound-test', () => this.a.soundTest()),
    );
    const solBtn = actions.querySelector<HTMLButtonElement>('[data-testid="op-solution"]')!;
    solBtn.addEventListener('click', () => {
      const on = !this.a.getSolutionVisible();
      this.a.setSolutionVisible(on);
      solBtn.textContent = `Show solution: ${on ? 'ON' : 'off'}`;
    });

    // volume
    const vol = el('input', { type: 'range', min: '0', max: '100', step: '1', 'data-testid': 'op-volume' }) as HTMLInputElement;
    vol.value = String(Math.round(this.a.getVolume() * 100));
    const volLabel = el('span', { class: 'op-value' }, `${vol.value}%`);
    vol.addEventListener('input', () => {
      this.touch();
      this.a.setVolume(Number(vol.value) / 100);
      volLabel.textContent = `${vol.value}%`;
    });
    vol.addEventListener('change', () => this.a.beep());

    // visual mode
    const mode = el('div', { class: 'op-seg' });
    const modeBtns = (['procedural', 'sprites'] as VisualMode[]).map((m) => {
      const b = el('button', { class: 'op-seg-btn', 'data-testid': `op-mode-${m}`, type: 'button' }, m);
      b.addEventListener('click', async () => {
        this.touch();
        this.a.beep();
        await this.a.setVisualMode(m);
        syncMode();
      });
      mode.appendChild(b);
      return b;
    });
    const syncMode = () => modeBtns.forEach((b, i) => b.classList.toggle('on', ['procedural', 'sprites'][i] === this.a.getVisualMode()));
    syncMode();

    // fps
    const fps = el('button', { class: 'op-btn op-toggle', 'data-testid': 'op-fps', type: 'button' }, '');
    const syncFps = () => (fps.textContent = `FPS meter: ${this.a.getFps() ? 'ON' : 'off'}`);
    syncFps();
    fps.addEventListener('click', () => {
      this.touch();
      this.a.beep();
      this.a.setFps(!this.a.getFps());
      syncFps();
    });

    // timings
    const timings = el('div', { class: 'op-timings' });
    const t = this.a.getTimings();
    for (const f of TIMING_FIELDS) {
      const row = el('label', { class: 'op-row' });
      const input = el('input', {
        type: 'number',
        min: '1',
        step: '1',
        'data-testid': `op-t-${f.key}`,
        value: String(Math.round(t[f.key] as number / 1000)),
      }) as HTMLInputElement;
      input.addEventListener('change', () => {
        this.touch();
        const v = Number(input.value);
        if (Number.isFinite(v) && v >= 1) {
          this.a.setTimings({ [f.key]: Math.round(v * 1000) } as Partial<Timings>);
          this.a.beep();
        } else input.value = String(Math.round((this.a.getTimings()[f.key] as number) / 1000));
      });
      row.append(el('span', {}, f.label), input);
      timings.appendChild(row);
    }

    const close = el('button', { class: 'op-btn op-close', 'data-testid': 'op-close', type: 'button' }, 'Close');
    close.addEventListener('click', () => {
      this.a.beep();
      this.close();
    });

    const volRow = el('label', { class: 'op-row' });
    volRow.append(el('span', {}, 'Master volume'), vol, volLabel);
    const modeRow = el('div', { class: 'op-row' });
    modeRow.append(el('span', {}, 'Visual mode'), mode);

    box.append(el('h2', {}, 'Final Gate Lock — operator'), el('div', { class: 'op-version', 'data-testid': 'op-version' }, versionLabel()), status, actions, volRow, modeRow, fps, el('h3', {}, 'Timings'), timings, close);
    ov.appendChild(box);
  }

  private mount() {
    const ov = el('div', { class: 'op-overlay', 'data-testid': 'op-overlay' }) as HTMLDivElement;
    // Any interaction keeps the menu open; nothing reaches the game underneath.
    for (const ev of ['pointerdown', 'pointermove', 'input', 'keydown']) {
      ov.addEventListener(ev, (e) => {
        e.stopPropagation();
        this.touch();
      });
    }
    document.body.appendChild(ov);
    this.overlay = ov;
    this.touch();
  }

  /** Restart the 60 s inactivity timer. */
  private touch() {
    if (this.idleTimer !== null) this.a.clearTimeout(this.idleTimer);
    this.idleTimer = this.a.setTimeout(() => this.close(), AUTO_CLOSE_MS);
  }

  close(): void {
    if (this.idleTimer !== null) this.a.clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.overlay?.remove();
    this.overlay = null;
    this.view = null;
  }
}
