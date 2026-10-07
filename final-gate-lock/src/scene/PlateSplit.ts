/**
 * Splits the plate into two halves that slide apart. The plate (halves + wheels, which straddle the
 * seam) is rendered once into a texture; two sprites of that texture, each masked to its side,
 * then slide. The texture is destroyed on `end()` so repeated loops don't leak GPU memory.
 */
import { Container, Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js';
import { LOGICAL, PLATE } from '../layout';

export const SPLIT_DISTANCE = 430;

export class PlateSplit {
  readonly root = new Container({ label: 'plateSplit' });
  private texture: Texture | null = null;
  private halves: Container[] = [];
  /** Live snapshot textures (diagnostics: must return to 0 after every reset). */
  static live = 0;

  get active(): boolean {
    return this.texture !== null;
  }

  begin(renderer: Renderer, plate: Container, resolution: number): void {
    this.end();
    this.texture = renderer.generateTexture({
      target: plate,
      frame: new Rectangle(0, 0, LOGICAL.width, LOGICAL.height),
      resolution,
      antialias: true,
    });
    PlateSplit.live++;
    for (const side of ['left', 'right'] as const) {
      const c = new Container({ label: `split:${side}` });
      const s = new Sprite(this.texture);
      const pad = 60;
      const x0 = side === 'left' ? -pad : PLATE.seamX;
      const w = side === 'left' ? PLATE.seamX + pad : LOGICAL.width - PLATE.seamX + pad;
      const mask = new Graphics().rect(x0, -pad, w, LOGICAL.height + pad * 2).fill(0xffffff);
      s.mask = mask;
      c.addChild(s, mask);
      this.halves.push(c);
      this.root.addChild(c);
    }
    plate.visible = false;
    this.set(0);
  }

  /** k ∈ [0, 1]: how far apart the halves are. Returns the inner edge x of each half. */
  set(k: number): [number, number] {
    const d = SPLIT_DISTANCE * k;
    if (this.halves.length === 2) {
      this.halves[0].x = -d;
      this.halves[1].x = d;
    }
    return [PLATE.seamX - d, PLATE.seamX + d];
  }

  end(plate?: Container): void {
    for (const h of this.halves) h.destroy({ children: true });
    this.halves = [];
    if (this.texture) {
      this.texture.destroy(true);
      this.texture = null;
      PlateSplit.live--;
    }
    if (plate) plate.visible = true;
  }
}
