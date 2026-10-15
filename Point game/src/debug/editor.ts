import type { Settings } from '../config/settings.ts';
import { formatPattern } from '../pattern/format.ts';
import { dist } from '../pattern/geometry.ts';
import { assignPitches, withAssignedPitches } from '../pattern/pitches.ts';
import { ASPECT, SEQUENCE_LENGTH, toWorld, type Pattern, type Vec } from '../pattern/types.ts';
import { validatePattern } from '../pattern/validate.ts';
import type { EditorView } from '../render/debugRenderer.ts';

const R_STEP = 0.002;
const R_MIN = 0.02;
const R_MAX = 0.1;

/**
 * Plan §9, E key: drag points, change r (mouse wheel or [ ]), record a sequence by clicking points in
 * order, export pattern.json. The validator and the pitch assignment run live.
 */
export class Editor {
  isOpen = false;
  private working!: Pattern;
  private selected: number | null = null;
  private recording = false;
  private drag: { id: number; offset: Vec } | null = null;
  private message = '';
  private readonly panel: HTMLDivElement;

  constructor(
    private readonly settings: Settings,
    private readonly apply: (p: Pattern) => void,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'editor-panel';
    this.panel.style.display = 'none';
    document.body.appendChild(this.panel);
    this.panel.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) void this.action(action);
    });
  }

  /** Opens on a copy of `current`; closing applies a valid pattern, or asks before discarding an invalid one. */
  toggle(current: Pattern): void {
    if (!this.isOpen) {
      this.working = JSON.parse(JSON.stringify(current)) as Pattern;
      this.isOpen = true;
      this.message = '';
      this.panel.style.display = 'block';
      this.refresh();
      return;
    }
    const { errors } = this.validate();
    if (errors.length === 0) this.apply(this.working);
    else if (!window.confirm('The pattern has errors. Close the editor and discard these changes?')) return;
    this.isOpen = false;
    this.recording = false;
    this.drag = null;
    this.panel.style.display = 'none';
  }

  view(): EditorView {
    return { pattern: this.working, selected: this.selected, recording: this.recording, hit: this.settings.hit };
  }

  private validate() {
    return validatePattern(this.working, this.settings);
  }

  private pointAt(pos: Vec): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const p of this.working.points) {
      const d = dist(pos, toWorld(p));
      if (d <= Math.max(p.r * 1.2, 0.03) && d < bestD) {
        best = p.id;
        bestD = d;
      }
    }
    return best;
  }

  private changed(): void {
    this.working = withAssignedPitches(this.working);
    this.refresh();
  }

  // ── input ────────────────────────────────────────────────────

  down(pos: Vec): void {
    const id = this.pointAt(pos);
    if (this.recording) {
      if (id === null) return;
      const seq = this.working.sequence;
      if (seq[seq.length - 1] === id) return;
      seq.push(id);
      if (seq.length >= SEQUENCE_LENGTH) this.recording = false;
      this.changed();
      return;
    }
    this.selected = id;
    if (id !== null) {
      const w = toWorld(this.working.points.find((p) => p.id === id)!);
      this.drag = { id, offset: { x: w.x - pos.x, y: w.y - pos.y } };
    }
    this.refresh();
  }

  move(pos: Vec): void {
    if (!this.drag) return;
    const p = this.working.points.find((q) => q.id === this.drag!.id)!;
    p.x = round3(clamp01(pos.x + this.drag.offset.x));
    p.y = round3(clamp01((pos.y + this.drag.offset.y) / ASPECT));
    this.refresh();
  }

  up(): void {
    if (this.drag) this.changed();
    this.drag = null;
  }

  wheel(deltaY: number): void {
    this.resize(deltaY < 0 ? R_STEP : -R_STEP);
  }

  key(k: string): boolean {
    if (k === '[') this.resize(-R_STEP);
    else if (k === ']') this.resize(R_STEP);
    else if (k === 'Backspace' && this.recording) void this.action('undo');
    else return false;
    return true;
  }

  private resize(dr: number): void {
    if (this.selected === null) return;
    const p = this.working.points.find((q) => q.id === this.selected)!;
    p.r = round3(Math.min(R_MAX, Math.max(R_MIN, p.r + dr)));
    this.refresh();
  }

  // ── panel ────────────────────────────────────────────────────

  private async action(a: string): Promise<void> {
    const json = formatPattern(this.working);
    switch (a) {
      case 'record':
        this.recording = !this.recording;
        if (this.recording) this.working.sequence = [];
        this.message = this.recording ? `Click ${SEQUENCE_LENGTH} points in order (Backspace undoes).` : '';
        this.changed();
        return;
      case 'undo':
        this.working.sequence.pop();
        this.changed();
        return;
      case 'apply':
        if (this.validate().errors.length > 0) this.message = 'Not applied: fix the errors first.';
        else {
          this.apply(this.working);
          this.message = 'Applied to the running game (not saved to disk).';
        }
        break;
      case 'save': {
        const res = await fetch(`${import.meta.env.BASE_URL}__save-pattern`, { method: 'POST', body: json });
        this.message = res.ok ? 'Saved to src/config/pattern.json.' : `Save failed: ${await res.text()}`;
        break;
      }
      case 'download': {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'pattern.json';
        link.click();
        URL.revokeObjectURL(url);
        this.message = 'Downloaded pattern.json.';
        break;
      }
      case 'copy':
        try {
          await navigator.clipboard.writeText(json);
          this.message = 'Copied to the clipboard.';
        } catch {
          this.message = 'Clipboard not available.';
        }
        break;
    }
    this.refresh();
  }

  private refresh(): void {
    const { errors, warnings } = this.validate();
    const sel = this.working.points.find((p) => p.id === this.selected);
    const seq = this.working.sequence;
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    this.panel.innerHTML = `
      <h3>Layout editor <small>(E closes and applies)</small></h3>
      <p>Drag points. Wheel or [ ] changes r of the selected point.</p>
      <p class="sel">${sel ? `point ${sel.id} · x ${sel.x} · y ${sel.y} · r ${sel.r} · ${sel.note}` : 'no point selected'}</p>
      <p>sequence (${seq.length}/${SEQUENCE_LENGTH}): ${seq.join(' → ') || '—'}</p>
      <div class="buttons">
        <button data-action="record">${this.recording ? 'Stop recording' : 'Record sequence'}</button>
        <button data-action="undo">Undo step</button>
        <button data-action="apply">Apply to game</button>
        ${import.meta.env.DEV ? '<button data-action="save">Save to project</button>' : ''}
        <button data-action="download">Download JSON</button>
        <button data-action="copy">Copy JSON</button>
      </div>
      ${this.message ? `<p class="msg">${esc(this.message)}</p>` : ''}
      <div class="${errors.length ? 'err' : 'ok'}">${errors.length ? errors.map((e) => `✗ ${esc(e)}`).join('<br>') : '✓ valid'}</div>
      ${warnings.length ? `<div class="warn">${warnings.map((w) => `! ${esc(w)}`).join('<br>')}</div>` : ''}
      ${seq.length >= 2 ? `<div class="pitches">${assignPitches(this.working).report.map(esc).join('<br>')}</div>` : ''}
    `;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
