import type { Container } from 'pixi.js';
import { ASPECT, type Vec } from '../pattern/types.ts';

/**
 * Maps the portrait world (x 0…1, y 0…ASPECT) onto the window, keeping the aspect ratio, with an
 * optional rotation (display.rotateDeg) that applies to both rendering and input.
 */
export class Viewport {
  scale = 1;
  rotateDeg = 0;
  private cx = 0;
  private cy = 0;

  update(width: number, height: number, rotateDeg: number): void {
    this.rotateDeg = ((rotateDeg % 360) + 360) % 360;
    const sideways = this.rotateDeg === 90 || this.rotateDeg === 270;
    const bw = sideways ? ASPECT : 1;
    const bh = sideways ? 1 : ASPECT;
    this.scale = Math.min(width / bw, height / bh);
    this.cx = width / 2;
    this.cy = height / 2;
  }

  apply(c: Container): void {
    c.pivot.set(0.5, ASPECT / 2);
    c.position.set(this.cx, this.cy);
    c.rotation = (this.rotateDeg * Math.PI) / 180;
    c.scale.set(this.scale);
  }

  /** CSS pixels (relative to the canvas) → world units. */
  screenToWorld(px: number, py: number): Vec {
    const a = (-this.rotateDeg * Math.PI) / 180;
    const dx = (px - this.cx) / this.scale;
    const dy = (py - this.cy) / this.scale;
    return {
      x: 0.5 + dx * Math.cos(a) - dy * Math.sin(a),
      y: ASPECT / 2 + dx * Math.sin(a) + dy * Math.cos(a),
    };
  }
}
