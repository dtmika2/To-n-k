import '../styles.css';
import { Application, Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { circle, easeOut } from '../render/draw.ts';
import { Eye } from '../render/eye.ts';
import { beamStrand, strandRuns, strokeStrand } from '../render/strand.ts';
import { softDotTexture } from '../render/textures.ts';
import { BeamBatch } from '../render/vfx/beam.ts';
import { RingBatch } from '../render/vfx/ring.ts';

/**
 * vfx.html: look-dev for the two looks side by side (classic left, vfx right): an eye, a strand and the
 * rings, with sliders. World units as in the game (1 = layout width); the page fits 1 × WORLD_H.
 */

const WORLD_H = 1.25;
const COLORS: Record<string, number> = { gold: 0xf3d99a, lavender: 0x8f84ff, violet: 0xa060ff, cold: 0x7d8aa6, hot: 0xfffbe8 };

const params = {
  open: 1,
  glow: 0.6,
  u: 0,
  hot: 0.6,
  color: 'gold',
  ringColor: 'lavender',
  fill: 1,
  dashes: 0,
  backdrop: true,
};

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ preference: 'webgl', background: '#07051a', resizeTo: window, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  document.getElementById('stage')!.appendChild(app.canvas);
  document.body.classList.add('show-cursor');

  const world = new Container();
  app.stage.addChild(world);
  const backdrop = new Sprite();
  backdrop.alpha = 0.55;
  try {
    backdrop.texture = await Assets.load<Texture>(import.meta.env.BASE_URL + 'assets/backdrop.png');
    backdrop.width = 1;
    backdrop.height = WORLD_H;
  } catch {
    /* plain background */
  }

  const dot = softDotTexture(64, 0.35);
  const classicEye = new Eye(0, { x: 0.27, y: 0.22 }, 0.14, 7, dot, 0.2);
  const vfxEye = new Eye(1, { x: 0.73, y: 0.22 }, 0.14, 7, dot, 0.2);
  const lines = new Graphics();
  lines.blendMode = 'add';
  const beams = new BeamBatch();
  const rings = new RingBatch();
  const ringLines = new Graphics();
  ringLines.blendMode = 'add';
  world.addChild(backdrop, lines, beams.mesh, classicEye.root, vfxEye.root, ringLines, rings.mesh);

  const layout = () => {
    const s = Math.min(window.innerWidth, window.innerHeight / WORLD_H);
    world.scale.set(s);
    world.position.set((window.innerWidth - s) / 2, (window.innerHeight - s * WORLD_H) / 2);
  };
  window.addEventListener('resize', layout);
  layout();
  buildPanel();

  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const color = COLORS[params.color];
    const ringColor = COLORS[params.ringColor];
    backdrop.visible = params.backdrop;

    const look = { open: params.open, closeTc: 0.16, glow: params.glow, glowColor: color, shudder: 0 };
    classicEye.update(now, dt, look, false);
    vfxEye.update(now, dt, look, true);

    const style = { color, alpha: 1, u: params.u, hot: params.hot };
    lines.clear();
    beams.begin();
    const [a1, b1] = [{ x: 0.08, y: 0.55 }, { x: 0.92, y: 0.5 }];
    const [a2, b2] = [{ x: 0.08, y: 0.68 }, { x: 0.92, y: 0.63 }];
    strokeStrand(lines, strandRuns(a1, b1, now, 3, params.u), style);
    beamStrand(beams, a2, b2, strandRuns(a2, b2, now, 3, params.u, false), 3, style);
    beams.end(now);

    // rings: an event ring expanding every 1.2 s around a button ring; classic left, vfx right
    ringLines.clear();
    rings.begin(now);
    const t = (now % 1200) / 1200;
    const rad = 0.06 + 0.12 * easeOut(t);
    for (const x of [0.27, 0.73]) {
      const vfx = x > 0.5;
      if (vfx) {
        rings.add(x, 1.0, rad, { color: ringColor, alpha: 0.8 * (1 - t), width: 0.002, fill: params.fill * (1 - t) });
        rings.add(x, 1.0, 0.06, { color: ringColor, alpha: 0.9, width: 0.0016, fill: params.fill, dashes: params.dashes, dashCount: 8 });
      } else {
        circle(ringLines, x, 1.0, rad).stroke({ width: 0.012, color, alpha: 0.8 * 0.18 * (1 - t) });
        circle(ringLines, x, 1.0, rad).stroke({ width: 0.004, color, alpha: 0.8 * (1 - t) });
        circle(ringLines, x, 1.0, 0.06).stroke({ width: 0.012, color, alpha: 0.14 * 0.9 });
        circle(ringLines, x, 1.0, 0.06).stroke({ width: 0.003, color, alpha: 0.9 });
      }
    }
    rings.end();
  });
}

function buildPanel(): void {
  const panel = document.createElement('div');
  panel.className = 'vfx-panel';
  const slider = (key: 'open' | 'glow' | 'u' | 'hot' | 'fill' | 'dashes', label: string, max = 1) => {
    const row = document.createElement('label');
    const input = document.createElement('input');
    Object.assign(input, { type: 'range', min: '0', max: String(max), step: '0.01', value: String(params[key]) });
    const out = document.createElement('span');
    out.textContent = params[key].toFixed(2);
    input.addEventListener('input', () => {
      params[key] = Number(input.value);
      out.textContent = params[key].toFixed(2);
    });
    row.append(label, input, out);
    panel.append(row);
  };
  const title = document.createElement('div');
  title.textContent = 'classic ← → vfx';
  panel.append(title);
  slider('open', 'eye open');
  slider('glow', 'glow');
  slider('u', 'fray (u)');
  slider('hot', 'hot core', 1.5);
  slider('fill', 'ring fill');
  slider('dashes', 'ring dashes');
  const colorSelect = (key: 'color' | 'ringColor', label: string) => {
    const sel = document.createElement('select');
    for (const name of Object.keys(COLORS)) sel.append(new Option(name, name, false, name === params[key]));
    sel.addEventListener('change', () => (params[key] = sel.value));
    const row = document.createElement('label');
    row.append(label, sel);
    return row;
  };
  const bd = document.createElement('input');
  bd.type = 'checkbox';
  bd.checked = params.backdrop;
  bd.addEventListener('change', () => (params.backdrop = bd.checked));
  const bdRow = document.createElement('label');
  bdRow.append('backdrop', bd);
  panel.append(colorSelect('color', 'colour'), colorSelect('ringColor', 'vfx rings'), bdRow);
  document.body.append(panel);
}

main().catch((e: unknown) => {
  console.error(e);
  document.body.innerHTML = `<pre style="color:#f88;padding:24px;font:16px monospace">${String((e as Error)?.stack ?? e)}</pre>`;
});
