import type { AppConfig } from '../config';
import type { Flags } from '../flags';
import { ARROW } from '../layout';
import { LayerFactory } from '../render/layers';
import { Game } from './Game';
import { AudioManager } from '../audio/AudioManager';
import { OperatorMenu } from '../operator/OperatorMenu';
import { applySettings, loadSettings, saveSettings, type OperatorSettings } from '../operator/settings';
import { Stage } from './Stage';
import { textureMemoryMB } from '../util/gpuMemory';
import { PlateSplit } from '../scene/PlateSplit';
import type { Container } from 'pixi.js';

function countObjects(c: Container): number {
  let n = 1;
  for (const ch of c.children) n += countObjects(ch);
  return n;
}

/** Boot the real app: stage, layer factory, game, and test hooks on `window.__fgl`. */
export async function startApp(baseConfig: AppConfig, flags: Flags): Promise<Game> {
  const settings: OperatorSettings = loadSettings();
  const config = applySettings(baseConfig, settings);
  const persist = () => saveSettings(settings);
  // Numerals are drawn as text: make sure the bundled face is ready before building wheels.
  try {
    await document.fonts.load('700 30px Cinzel');
  } catch {
    /* falls back to Georgia/serif */
  }
  const stage = await Stage.create(document.getElementById('stage')!);
  const manifest = await LayerFactory.loadManifest(flags.manifestUrl ?? config.visual.manifest);
  const factory = new LayerFactory(flags.visualMode ?? config.visual.mode, manifest);
  if (factory.mode === 'sprites') await factory.loadSprites();
  const audio = new AudioManager(config.audio.masterVolume, flags.placeholderSfx);
  void audio.load();
  const game = new Game(stage, config, flags, factory, audio);
  if (settings.fps) game.stats.setVisible(true);

  const menu = new OperatorMenu(config.operator.pin, {
    resetToShrouded: () => game.operatorReset(),
    forceOpen: () => game.operatorForceOpen(),
    setSolutionVisible: (on) => game.setSolutionVisible(on),
    setCorrectMinusOne: () => game.setCorrectMinusOne(),
    soundTest: () => {
      audio.unlock();
      void audio.soundTest();
    },
    beep: () => {
      audio.unlock();
      audio.play('operator_beep', { volume: 0.6 });
    },
    getVolume: () => audio.masterVolume,
    setVolume: (v) => {
      audio.setMasterVolume(v);
      settings.masterVolume = audio.masterVolume;
      persist();
    },
    getVisualMode: () => factory.mode,
    setVisualMode: async (m) => {
      await factory.setMode(m);
      settings.visualMode = m;
      persist();
    },
    getFps: () => game.stats.visible,
    setFps: (on) => {
      game.stats.setVisible(on);
      settings.fps = on;
      persist();
    },
    getTimings: () => game.config.timings,
    setTimings: (t) => {
      game.setTimings(t);
      settings.timings = { ...(settings.timings ?? {}), ...t };
      persist();
    },
    setTimeout: (fn, ms) => game.clock.setTimeout(fn, ms),
    clearTimeout: (h) => game.clock.clearTimeout(h),
    status: () => {
      const s = game.snapshot();
      const ctx = audio.ctx?.state ?? 'none';
      return `state ${s.state} · loops ${s.loops} · correct ${game.model.correctCount()}/10 · audio ${ctx} · ${factory.mode}`;
    },
  });
  game.onOperator = () => menu.openPin();
  installWatchdogs(stage, game);

  Object.assign(window, {
    __fgl: {
      game,
      audio,
      menu,
      factory,
      config,
      flags,
      stage,
      stats: game.stats,
      clock: game.clock,
      snap: () => game.snapshot(),
      /** Diagnostics for leak checks. */
      diag: () => ({
        objects: countObjects(stage.app.stage),
        tweens: game.tweens.count,
        timers: game.clock.pendingCount,
        splitTextures: PlateSplit.live,
        motes: game.unlock.moteCount,
        stateLog: game.stateLog.length,
        gpu: textureMemoryMB(stage.app.renderer),
        resolution: stage.app.renderer.resolution,
        updateCostMs: game.updateCost,
        wakeLocks: game.wake.acquired,
        wakeActive: game.wake.active,
      }),
      /** Logical centre of an arrow / wheel, for tests. */
      arrow: (id: number, dir: 'cw' | 'ccw') => {
        const w = game.wheels.find((x) => x.id === id)!;
        return { x: w.x + (dir === 'cw' ? ARROW.offsetX : -ARROW.offsetX), y: w.y + ARROW.offsetY };
      },
      wheelPos: (id: number) => {
        const w = game.wheels.find((x) => x.id === id)!;
        return { x: w.x, y: w.y };
      },
      toClient: (x: number, y: number) => ({ x: x * stage.scale + stage.offsetX, y: y * stage.scale + stage.offsetY }),
    },
  });
  return game;
}

/**
 * Kiosk self-healing: the lock runs unattended for whole days.
 * - WebGL context lost → reload (Pixi can't always restore procedural textures).
 * - The ticker stalls for 15 s while the page is visible → reload.
 * - Unhandled errors are logged (never shown to players).
 */
function installWatchdogs(stage: Stage, game: Game) {
  const reload = (why: string) => {
    console.error('[watchdog] reloading:', why);
    setTimeout(() => location.reload(), 1000);
  };
  stage.app.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    reload('webgl context lost');
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && performance.now() - game.lastFrameAt > 15_000) reload('ticker stalled');
  }, 5000);
  window.addEventListener('error', (e) => console.error('[error]', e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('[unhandledrejection]', e.reason));
}
