/**
 * LayerFactory: every visual layer is created through `create(layerId)`.
 * - visual mode "sprites" and the manifest has a loadable file for the id → Sprite
 * - otherwise → the procedural draw function (silent fallback, logged once per id)
 * Animation never lives in a layer; callers move/scale/rotate whatever comes back.
 */
import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { VisualMode } from '../config';
import { C } from './palette';
import { mistPuff, radialLight } from './textures';
import {
  arrowContext,
  badgeContext,
  discContext,
  highlightContext,
  irisContext,
  irisShadeContext,
  lidBottomContext,
  lidTopContext,
  lockRingContext,
  pupilContext,
  rimContext,
  ringContext,
} from './procedural/wheel';

export const LAYER_IDS = [
  'ring',
  'disc',
  'iris',
  'irisShade',
  'pupil',
  'highlight',
  'lidTop',
  'lidBottom',
  'rim',
  'glow',
  'arrowCw',
  'arrowCwPressed',
  'arrowCcw',
  'arrowCcwPressed',
  'badge',
  'wall',
  'mistTile',
  // the door (see render/procedural/plate.ts)
  'plateShadow',
  'oak',
  'frame',
  'straps',
  'brackets',
  'ornaments',
  'bezel',
  'seam',
  'core',
  'lockRing',
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** Layers that stay procedural even in sprite mode (DESIGN: glow, dust and sparks). */
const ALWAYS_PROCEDURAL = new Set<LayerId>(['glow']);

export interface ManifestEntry {
  file: string;
  /** Size in logical px (the sprite file is authored at 2×). */
  width: number;
  height: number;
  /** Pivot in logical px from the sprite's top-left. */
  pivotX: number;
  pivotY: number;
}
export type Manifest = Partial<Record<LayerId, ManifestEntry>>;

type Builder = () => Container;

const builders = new Map<LayerId, Builder>([
  ['ring', () => new Graphics(ringContext())],
  ['disc', () => new Graphics(discContext())],
  ['iris', () => new Graphics(irisContext())],
  ['irisShade', () => new Graphics(irisShadeContext())],
  ['pupil', () => new Graphics(pupilContext())],
  ['highlight', () => new Graphics(highlightContext())],
  ['lidTop', () => new Graphics(lidTopContext())],
  ['lidBottom', () => new Graphics(lidBottomContext())],
  ['rim', () => new Graphics(rimContext())],
  ['lockRing', () => new Graphics(lockRingContext())],
  ['arrowCw', () => new Graphics(arrowContext('cw', false))],
  ['arrowCwPressed', () => new Graphics(arrowContext('cw', true))],
  ['arrowCcw', () => new Graphics(arrowContext('ccw', false))],
  ['arrowCcwPressed', () => new Graphics(arrowContext('ccw', true))],
  ['badge', () => new Graphics(badgeContext())],
  [
    'glow',
    () => {
      const s = new Sprite(radialLight());
      s.anchor.set(0.5);
      s.width = s.height = 130;
      s.tint = C.teal;
      s.blendMode = 'add';
      return s;
    },
  ],
]);

builders.set('mistTile', () => {
  const s = new Sprite(mistPuff(0));
  s.anchor.set(0.5);
  return s;
});

/** Other modules (plate, background, core) register their procedural builders here. */
export function registerProcedural(id: LayerId, build: Builder): void {
  builders.set(id, build);
}

export class LayerFactory {
  private textures = new Map<LayerId, Texture>();
  private warned = new Set<string>();
  /** Bumped whenever the mode or loaded textures change; wheels rebuild when it moves. */
  revision = 0;

  constructor(
    public mode: VisualMode,
    private manifest: Manifest = {},
    private baseUrl = 'assets/',
  ) {}

  static async loadManifest(url: string): Promise<Manifest> {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return {};
      const json = (await res.json()) as Manifest;
      return json && typeof json === 'object' ? json : {};
    } catch {
      return {};
    }
  }

  /** Load every sprite listed in the manifest. Missing files are skipped (procedural fallback). */
  async loadSprites(): Promise<void> {
    const entries = Object.entries(this.manifest) as [LayerId, ManifestEntry][];
    await Promise.all(
      entries.map(async ([id, e]) => {
        if (this.textures.has(id) || ALWAYS_PROCEDURAL.has(id)) return;
        try {
          const tex = await Assets.load<Texture>(this.baseUrl + e.file);
          if (tex && tex.width > 0) this.textures.set(id, tex);
        } catch {
          this.warnOnce(id, `[layers] sprite for "${id}" (${e.file}) failed to load, using procedural`);
        }
      }),
    );
    this.revision++;
  }

  async setMode(mode: VisualMode): Promise<void> {
    this.mode = mode;
    if (mode === 'sprites') await this.loadSprites();
    else this.revision++;
  }

  /** The loaded sprite texture for a layer (sprite mode only), or null. */
  texture(id: LayerId): Texture | null {
    return this.hasSprite(id) ? (this.textures.get(id) ?? null) : null;
  }

  hasSprite(id: LayerId): boolean {
    return this.mode === 'sprites' && this.textures.has(id) && !ALWAYS_PROCEDURAL.has(id);
  }

  /** Test helper: forget one sprite so that layer falls back to procedural. */
  dropSprite(id: LayerId): void {
    this.textures.delete(id);
    this.revision++;
  }

  create(id: LayerId): Container {
    if (this.mode === 'sprites' && !ALWAYS_PROCEDURAL.has(id)) {
      const tex = this.textures.get(id);
      const entry = this.manifest[id];
      if (tex && entry) {
        const s = new Sprite(tex);
        s.label = `${id}:sprite`;
        s.width = entry.width;
        s.height = entry.height;
        s.anchor.set(entry.pivotX / entry.width, entry.pivotY / entry.height);
        return s;
      }
      this.warnOnce(id, `[layers] no sprite for "${id}", using procedural`);
    }
    const build = builders.get(id);
    if (!build) throw new Error(`no procedural builder for layer "${id}"`);
    const c = build();
    c.label = `${id}:procedural`;
    return c;
  }

  private warnOnce(key: string, msg: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.info(msg);
  }
}
