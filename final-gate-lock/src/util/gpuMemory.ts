/** Rough GPU memory estimate: every texture the renderer manages + the back buffer. */
import type { Renderer, TextureSource } from 'pixi.js';

export function textureMemoryMB(renderer: Renderer): { textures: number; count: number; backBuffer: number; totalMB: number } {
  const list = (renderer.texture as unknown as { managedTextures?: readonly TextureSource[] }).managedTextures ?? [];
  let bytes = 0;
  let count = 0;
  for (const t of list) {
    if (!t) continue; // destroyed textures leave holes in the managed list
    count++;
    const px = t.pixelWidth * t.pixelHeight * 4;
    bytes += t.autoGenerateMipmaps ? px * 1.34 : px;
  }
  // colour + depth/stencil of the default framebuffer (double-buffered)
  const back = renderer.width * renderer.height * 4 * 3;
  return { textures: bytes / 2 ** 20, count, backBuffer: back / 2 ** 20, totalMB: (bytes + back) / 2 ** 20 };
}
