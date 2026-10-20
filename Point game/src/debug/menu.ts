/**
 * M key: operator menu overlay. A legend of every key in use, plus live controls for the switches and
 * tunables that are safe to change while the game runs. Controls read their state through `get`, so
 * changes made with the keys show up here too (`sync()`).
 */

export interface KeyHelp {
  keys: string;
  what: string;
}

export type MenuControl =
  | { kind: 'toggle'; label: string; key?: string; hint?: string; get(): boolean; set(v: boolean): void }
  | { kind: 'choice'; label: string; key?: string; options: readonly string[]; get(): string; set(v: string): void }
  | { kind: 'range'; label: string; min: number; max: number; step: number; hint?: string; get(): number; set(v: number): void };

export interface MenuSection {
  title: string;
  controls: MenuControl[];
}

export class Menu {
  private readonly el: HTMLDivElement;
  private readonly syncers: (() => void)[] = [];
  isOpen = false;

  constructor(keys: readonly KeyHelp[], sections: readonly MenuSection[]) {
    this.el = document.createElement('div');
    this.el.className = 'menu-panel';
    this.el.style.display = 'none';

    const head = document.createElement('div');
    head.className = 'menu-head';
    const title = document.createElement('h3');
    title.textContent = 'Menu';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.title = 'Close (M or Esc)';
    close.addEventListener('click', () => this.toggle(false));
    head.append(title, close);
    this.el.append(head);

    for (const s of sections) {
      const h = document.createElement('h4');
      h.textContent = s.title;
      this.el.append(h);
      for (const c of s.controls) this.el.append(this.control(c));
    }

    const kh = document.createElement('h4');
    kh.textContent = 'Keys';
    const table = document.createElement('table');
    table.className = 'menu-keys';
    for (const k of keys) {
      const tr = document.createElement('tr');
      const key = document.createElement('td');
      key.className = 'menu-key';
      key.textContent = k.keys;
      const what = document.createElement('td');
      what.textContent = k.what;
      tr.append(key, what);
      table.append(tr);
    }
    this.el.append(kh, table);
    document.body.appendChild(this.el);
  }

  toggle(open = !this.isOpen): void {
    this.isOpen = open;
    this.el.style.display = open ? 'block' : 'none';
    if (open) this.sync();
  }

  /** Refresh every control from its current value (after a key changed something). */
  sync(): void {
    if (this.isOpen) for (const s of this.syncers) s();
  }

  private control(c: MenuControl): HTMLElement {
    const row = document.createElement('label');
    row.className = 'menu-row';
    const name = document.createElement('span');
    name.textContent = c.label;
    if ('key' in c && c.key) {
      const k = document.createElement('kbd');
      k.textContent = c.key;
      name.append(' ', k);
    }
    row.append(name);
    if (c.kind === 'toggle') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => c.set(input.checked));
      this.syncers.push(() => (input.checked = c.get()));
      row.append(input);
    } else if (c.kind === 'choice') {
      const sel = document.createElement('select');
      for (const o of c.options) sel.append(new Option(o, o));
      sel.addEventListener('change', () => c.set(sel.value));
      this.syncers.push(() => (sel.value = c.get()));
      row.append(sel);
    } else {
      const wrap = document.createElement('span');
      wrap.className = 'menu-range';
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min: String(c.min), max: String(c.max), step: String(c.step) });
      const out = document.createElement('output');
      const show = (v: number) => (out.textContent = String(Math.round(v * 100) / 100));
      input.addEventListener('input', () => {
        c.set(Number(input.value));
        show(Number(input.value));
      });
      this.syncers.push(() => {
        input.value = String(c.get());
        show(c.get());
      });
      wrap.append(input, out);
      row.append(wrap);
    }
    if ('hint' in c && c.hint) row.title = c.hint;
    return row;
  }
}
