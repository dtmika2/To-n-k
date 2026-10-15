import { Application } from 'pixi.js';
import { AudioEngine } from '../audio/engine.ts';
import patternJson from '../config/pattern.json';
import { settings } from '../config/settings.ts';
import { DebugOverlay } from '../debug/overlay.ts';
import { Editor } from '../debug/editor.ts';
import { buildContext } from '../game/context.ts';
import { createReducer, initialState } from '../game/reducer.ts';
import type { GameEvent, Mode } from '../game/types.ts';
import { attachPointerInput } from '../input/pointer.ts';
import { dist } from '../pattern/geometry.ts';
import { noteToFreq } from '../pattern/notes.ts';
import type { Pattern, Vec } from '../pattern/types.ts';
import { DebugRenderer } from '../render/debugRenderer.ts';
import { Viewport } from './viewport.ts';

const JUMP_KEYS: Record<string, Mode> = { '1': 'INTRO', '2': 'GAME', '3': 'REVEAL', '4': 'IDLE' };

export async function startApp(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const rotateDeg = params.has('rotate') ? Number(params.get('rotate')) : settings.display.rotateDeg;

  let pattern = patternJson as Pattern;
  let ctx = buildContext(pattern, settings);
  let reduce = createReducer(ctx);
  let state = initialState(performance.now());
  const freqsOf = (p: Pattern) => new Map(p.points.map((pt) => [pt.id, noteToFreq(pt.note)]));

  const app = new Application();
  await app.init({
    background: '#07051a',
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  document.getElementById('stage')!.appendChild(app.canvas);

  const viewport = new Viewport();
  const renderer = new DebugRenderer({
    imageUrl: import.meta.env.BASE_URL + settings.reveal.image,
    widthFraction: settings.reveal.widthFraction,
    placeholderText: settings.reveal.placeholderText,
  });
  app.stage.addChild(renderer.root);
  renderer.setPattern(ctx, pattern);
  await renderer.loadReveal();

  const audio = new AudioEngine(freqsOf(pattern), ctx, settings.audio);
  const overlay = new DebugOverlay();

  const layout = () => {
    viewport.update(window.innerWidth, window.innerHeight, rotateDeg);
    viewport.apply(renderer.root);
  };
  window.addEventListener('resize', layout);
  layout();

  const dispatch = (ev: GameEvent) => {
    const now = performance.now();
    const r = reduce(state, ev, now);
    state = r.state;
    for (const e of r.effects) {
      renderer.onEffect(e, now);
      audio.onEffect(e);
    }
  };

  const editor = new Editor(settings, (p) => {
    pattern = p;
    ctx = buildContext(pattern, settings);
    reduce = createReducer(ctx);
    state = initialState(performance.now());
    renderer.setPattern(ctx, pattern);
    audio.setPattern(freqsOf(pattern), ctx);
  });

  const setDebug = (on: boolean) => {
    overlay.setVisible(on);
    renderer.debug = on;
    document.body.classList.toggle('show-cursor', on || editor.isOpen);
  };
  setDebug(params.has('debug'));

  // Finger speed (world units / s), smoothed, for the theremin swell.
  let speed = 0;
  let lastSample: { pos: Vec; t: number } | null = null;

  attachPointerInput(app.canvas, (x, y) => viewport.screenToWorld(x, y), {
    gesture: () => audio.unlock(),
    down: (id, pos) => {
      const now = performance.now();
      lastSample = { pos, t: now };
      if (editor.isOpen) return editor.down(pos);
      renderer.ripple(pos, now);
      dispatch({ type: 'POINTER_DOWN', id, pos });
    },
    move: (id, path) => {
      const now = performance.now();
      const end = path[path.length - 1];
      if (lastSample && now > lastSample.t) {
        const inst = dist(lastSample.pos, end) / ((now - lastSample.t) / 1000);
        speed = speed * 0.8 + Math.min(inst, 5) * 0.2;
      }
      lastSample = { pos: end, t: now };
      if (editor.isOpen) return editor.move(end);
      dispatch({ type: 'POINTER_MOVE', id, path });
    },
    up: (id, cancelled) => {
      lastSample = null;
      if (editor.isOpen) return editor.up();
      dispatch({ type: cancelled ? 'POINTER_CANCEL' : 'POINTER_UP', id });
    },
  });
  app.canvas.addEventListener('wheel', (e) => editor.isOpen && editor.wheel(e.deltaY), { passive: true });

  window.addEventListener('keydown', (e) => {
    if (editor.isOpen && editor.key(e.key)) return;
    const k = e.key.toLowerCase();
    if (k === 'd') setDebug(!overlay.visible);
    else if (k === 'e') {
      editor.toggle(pattern);
      if (!editor.isOpen) renderer.refreshLabels();
      setDebug(overlay.visible);
    } else if (editor.isOpen) return;
    else if (k === 'r') dispatch({ type: 'JUMP', mode: 'INTRO' });
    else if (JUMP_KEYS[k]) dispatch({ type: 'JUMP', mode: JUMP_KEYS[k] });
  });

  app.ticker.add(() => {
    const now = performance.now();
    if (!lastSample) speed *= 0.9;
    if (editor.isOpen) {
      renderer.renderEditor(editor.view(), now);
    } else {
      dispatch({ type: 'TICK' });
      audio.update(state, now, speed);
      renderer.render(state, now);
    }
    overlay.update(state, ctx, now, app.ticker.FPS, audio.contextState);
  });

  // Debug handle for poking at the running game from the console.
  (window as unknown as { __dream: unknown }).__dream = { get state() { return state; }, dispatch, ctx: () => ctx };
}
