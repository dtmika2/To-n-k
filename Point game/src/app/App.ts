import { Application } from 'pixi.js';
import { AudioEngine } from '../audio/engine.ts';
import patternJson from '../config/pattern.json';
import { settings } from '../config/settings.ts';
import { DebugOverlay } from '../debug/overlay.ts';
import { Editor } from '../debug/editor.ts';
import { Menu } from '../debug/menu.ts';
import { AttractPlayer, type AttractView } from '../game/attract.ts';
import { buildContext } from '../game/context.ts';
import { figureProgress } from '../game/figure.ts';
import { createReducer, initialState } from '../game/reducer.ts';
import type { GameEvent, Mode } from '../game/types.ts';
import { attachPointerInput } from '../input/pointer.ts';
import { dist } from '../pattern/geometry.ts';
import { noteToFreq } from '../pattern/notes.ts';
import type { Pattern, Vec } from '../pattern/types.ts';
import { DebugRenderer } from '../render/debugRenderer.ts';
import { SceneRenderer, type Look } from '../render/scene.ts';
import { Viewport } from './viewport.ts';
import { keepScreenAwake } from './wakeLock.ts';

const JUMP_KEYS: Record<string, Mode> = { '1': 'INTRO', '2': 'GAME', '3': 'REVEAL', '4': 'IDLE', '5': 'CREATIVE' };

export async function startApp(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const num = (key: string, fallback: number) => (params.has(key) ? Number(params.get(key)) : fallback);
  const rotateDeg = num('rotate', settings.display.rotateDeg);
  let renderScale = num('scale', settings.display.renderScale);
  let autoScale = settings.display.autoScale && !params.has('scale');
  const lookParam = params.get('look');
  let look: Look = lookParam === 'vfx' || lookParam === 'classic' ? lookParam : settings.display.look;

  let pattern = patternJson as Pattern;
  let ctx = buildContext(pattern, settings);
  let reduce = createReducer(ctx);
  let state = initialState(performance.now());
  const freqsOf = (p: Pattern) => new Map(p.points.map((pt) => [pt.id, noteToFreq(pt.note)]));

  const app = new Application();
  await app.init({
    preference: 'webgl', // the cloud/mist shader is GLSL
    background: '#07051a',
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    powerPreference: 'high-performance',
  });
  document.getElementById('stage')!.appendChild(app.canvas);

  const viewport = new Viewport();
  const scene = new SceneRenderer(app.renderer, {
    stars: settings.display.stars,
    octaves: num('octaves', settings.display.noiseOctaves),
    renderScale,
    eyeMinOpen: settings.display.eyeMinOpen,
    clouds: settings.display.clouds,
  });
  scene.setLook(look);
  const primitives = new DebugRenderer();
  app.stage.addChild(scene.root, primitives.root);
  scene.setPattern(ctx, pattern);
  primitives.setPattern(ctx, pattern);
  const backdrop = settings.display.backdrop;
  await scene.loadBackdrop(backdrop && import.meta.env.BASE_URL + backdrop);

  const audio = new AudioEngine(freqsOf(pattern), ctx, settings.audio);
  const overlay = new DebugOverlay();
  // INTRO attract demo. The kiosk Chrome allows audio without a gesture, so try to start it right away;
  // in a normal browser the context stays suspended until the first tap.
  let attract = new AttractPlayer(ctx, settings.timing.attract, Math.random);
  audio.unlock();

  const layout = () => {
    viewport.update(window.innerWidth, window.innerHeight, rotateDeg);
    viewport.apply(scene.root);
    viewport.apply(primitives.root);
    scene.resize(viewport.scale * (window.devicePixelRatio || 1), renderScale);
  };
  window.addEventListener('resize', layout);
  layout();

  const dispatch = (ev: GameEvent) => {
    const now = performance.now();
    const r = reduce(state, ev, now);
    state = r.state;
    for (const e of r.effects) {
      scene.onEffect(e, now);
      primitives.onEffect(e, now);
      audio.onEffect(e);
    }
  };

  const editor = new Editor(settings, (p) => {
    pattern = p;
    ctx = buildContext(pattern, settings);
    reduce = createReducer(ctx);
    state = initialState(performance.now());
    scene.setPattern(ctx, pattern);
    primitives.setPattern(ctx, pattern);
    audio.setPattern(freqsOf(pattern), ctx);
    attract = new AttractPlayer(ctx, settings.timing.attract, Math.random);
  });

  // D: debug overlay (state text + hit radii drawn faintly over the scene). P: Phase 1 primitives only.
  let debugOn = params.has('debug');
  let primitivesOnly = params.has('primitives');
  scene.markUnused = params.has('unused');
  const setLook = (l: Look) => {
    look = l;
    scene.setLook(look);
  };

  // M: menu overlay, with the key legend and live switches (all of them also work by key, or are tunables)
  const menu = new Menu(
    [
      { keys: 'M / Esc', what: 'open / close this menu' },
      { keys: 'D', what: 'debug overlay: state, timers and fps; hit radii drawn over the scene' },
      { keys: 'P', what: 'primitives only (the Phase 1 debug drawing)' },
      { keys: 'L', what: 'switch the look: vfx ⇄ classic (also ?look=)' },
      { keys: 'U', what: 'mark the decoy eyes, which are never in the sequence (also ?unused)' },
      { keys: 'E', what: 'layout editor: drag eyes, mouse wheel or [ ] for the radius, Backspace undoes while recording' },
      { keys: 'R', what: 'reset to the intro' },
      { keys: '1 – 5', what: 'jump to INTRO · GAME · REVEAL · IDLE · CREATIVE' },
    ],
    [
      {
        title: 'View',
        controls: [
          { kind: 'choice', label: 'Look', key: 'L', options: ['vfx', 'classic'], get: () => look, set: (v) => setLook(v as Look) },
          { kind: 'toggle', label: 'Debug overlay', key: 'D', get: () => debugOn, set: (v) => ((debugOn = v), applyView()) },
          { kind: 'toggle', label: 'Primitives only', key: 'P', get: () => primitivesOnly, set: (v) => ((primitivesOnly = v), applyView()) },
          { kind: 'toggle', label: 'Mark decoy eyes', key: 'U', get: () => scene.markUnused, set: (v) => (scene.markUnused = v) },
        ],
      },
      {
        title: 'Sound',
        controls: [
          { kind: 'range', label: 'Volume', min: 0, max: 1, step: 0.01, get: () => settings.audio.masterGain, set: (v) => audio.setMasterGain(v) },
          {
            kind: 'toggle',
            label: 'Glide hint',
            hint: 'While tracing, the note bends towards the next eye’s note as the finger nears it.',
            get: () => settings.audio.glideHint,
            set: (v) => (settings.audio.glideHint = v),
          },
          {
            kind: 'toggle',
            label: 'Figure notes',
            hint: 'At the reveal, each eye of the number plays its note as the line reaches it.',
            get: () => settings.audio.revealNotes,
            set: (v) => (settings.audio.revealNotes = v),
          },
          {
            kind: 'toggle',
            label: 'Intro drone',
            hint: 'The very quiet drone under the intro.',
            get: () => settings.audio.introDrone,
            set: (v) => {
              if (!v) audio.setDrone(false);
              settings.audio.introDrone = v;
              if (v && state.mode === 'INTRO') audio.setDrone(true);
            },
          },
        ],
      },
      {
        title: 'Game',
        controls: [
          {
            kind: 'toggle',
            label: 'Tap skips the demo',
            hint: 'A tap during the demo ends it and goes straight to READY.',
            get: () => ctx.allowSkipDemo,
            set: (v) => {
              settings.game.allowSkipDemo = v; // kept when the layout editor rebuilds the context
              ctx.allowSkipDemo = v;
            },
          },
        ],
      },
      {
        title: 'Performance',
        controls: [
          {
            kind: 'toggle',
            label: 'Auto render scale',
            hint: 'Lower the mist shader resolution step by step while the frame rate stays under 55 fps.',
            get: () => autoScale,
            set: (v) => (autoScale = v),
          },
          {
            kind: 'range',
            label: 'Render scale',
            min: settings.display.minRenderScale,
            max: 1,
            step: 0.05,
            hint: 'Resolution of the mist shader relative to the screen.',
            get: () => renderScale,
            set: (v) => ((renderScale = v), layout()),
          },
          { kind: 'range', label: 'Noise octaves', min: 1, max: 6, step: 1, hint: 'Detail of the mist noise (performance vs. detail).', get: () => scene.octaves, set: (v) => (scene.octaves = v) },
        ],
      },
    ],
  );

  const applyView = () => {
    overlay.setVisible(debugOn);
    primitives.debug = debugOn;
    primitives.setOverlay(!primitivesOnly);
    scene.root.visible = !primitivesOnly && !editor.isOpen;
    primitives.root.visible = primitivesOnly || debugOn || editor.isOpen;
    document.body.classList.toggle('show-cursor', debugOn || editor.isOpen || menu.isOpen);
  };
  applyView();

  // Finger speed (world units / s), smoothed, for the theremin swell.
  let speed = 0;
  let lastSample: { pos: Vec; t: number } | null = null;

  attachPointerInput(app.canvas, (x, y) => viewport.screenToWorld(x, y), {
    gesture: () => {
      audio.unlock();
      keepScreenAwake();
    },
    down: (id, pos) => {
      const now = performance.now();
      lastSample = { pos, t: now };
      if (editor.isOpen) return editor.down(pos);
      scene.ripple(pos, now);
      primitives.ripple(pos, now);
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
      scene.trail(end, now);
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
    if (k === 'm' || (k === 'escape' && menu.isOpen)) menu.toggle(k === 'm' ? !menu.isOpen : false);
    else if (k === 'd') debugOn = !debugOn;
    else if (k === 'p') primitivesOnly = !primitivesOnly;
    else if (k === 'u') scene.markUnused = !scene.markUnused;
    else if (k === 'l') setLook(look === 'vfx' ? 'classic' : 'vfx');
    else if (k === 'e') {
      editor.toggle(pattern);
      if (!editor.isOpen) primitives.refreshLabels();
    } else if (editor.isOpen) return;
    else if (k === 'r') dispatch({ type: 'JUMP', mode: 'INTRO' });
    else if (JUMP_KEYS[k]) dispatch({ type: 'JUMP', mode: JUMP_KEYS[k] });
    applyView();
    menu.sync();
  });

  // Performance: if the frame rate stays low, lower the shader resolution step by step.
  let perfWindowStart = performance.now();
  let perfFrames = 0;
  let perfNote = '';
  const checkPerf = (now: number) => {
    perfFrames++;
    if (now - perfWindowStart < 3000) return;
    const fps = (perfFrames * 1000) / (now - perfWindowStart);
    perfWindowStart = now;
    perfFrames = 0;
    if (autoScale && !document.hidden && fps < 55 && renderScale > settings.display.minRenderScale + 1e-6) {
      renderScale = Math.max(settings.display.minRenderScale, Math.round((renderScale - 0.05) * 100) / 100);
      layout();
      perfNote = ` (auto-lowered at ${fps.toFixed(0)} fps)`;
      console.info(`[dream-pattern] renderScale → ${renderScale} (${fps.toFixed(1)} fps)`);
    }
  };

  // Reveal figure: each eye plays its note (and lights up) as the line reaches it. Jumping straight to
  // IDLE (debug) shows the finished figure silently.
  let figureNotes = -1;
  const figureTick = (now: number) => {
    const f = figureProgress(state, now, ctx);
    if (!f) {
      figureNotes = -1;
      return;
    }
    const reached = Math.min(ctx.figure.length - 1, Math.floor(f.head + 1e-6));
    if (state.mode !== 'REVEAL' && figureNotes < 0) {
      figureNotes = reached;
      return;
    }
    while (figureNotes < reached) {
      const id = ctx.figure[++figureNotes];
      scene.onFigureNote(id, now);
      if (settings.audio.revealNotes) audio.onAttractNote(id, 700);
    }
  };

  app.ticker.add(() => {
    const now = performance.now();
    if (!lastSample) speed *= 0.9;
    if (editor.isOpen) {
      primitives.renderEditor(editor.view(), now);
    } else {
      dispatch({ type: 'TICK' });
      figureTick(now);
      let attractView: AttractView | null = null;
      if (state.mode === 'INTRO') {
        const a = attract.update(now);
        attractView = a.view;
        for (const e of a.events) {
          scene.onAttractNote(e.point, e.noteMs, now);
          primitives.onAttractNote(e.point, e.noteMs, now);
          audio.onAttractNote(e.point, e.noteMs);
        }
      } else {
        attract.reset();
      }
      audio.update(state, now, speed);
      if (!primitivesOnly) scene.render(state, now, attractView);
      if (primitives.root.visible) primitives.render(state, now, attractView);
      checkPerf(now);
    }
    overlay.update(state, ctx, now, app.ticker.FPS, `look ${look}  scale ${renderScale}${perfNote}  octaves ${scene.octaves}  audio ${audio.contextState}`);
  });

  keepScreenAwake();

  // Debug handle for poking at the running game from the console.
  (window as unknown as { __dream: unknown }).__dream = { get state() { return state; }, dispatch, ctx: () => ctx };
}
