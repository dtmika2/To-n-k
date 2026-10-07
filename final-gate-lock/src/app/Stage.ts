import { Application, Container } from 'pixi.js';
import { LOGICAL } from '../layout';

export const LETTERBOX_COLOR = 0x050405;

/**
 * Owns the Pixi application and the logical 1280 × 800 root, scaled uniformly
 * to fit the screen and centred (letterboxed).
 */
export class Stage {
  readonly root = new Container({ label: 'root' });
  scale = 1;
  offsetX = 0;
  offsetY = 0;

  private constructor(readonly app: Application) {
    app.stage.addChild(this.root);
    this.layout();
    app.renderer.on('resize', () => this.layout());
  }

  static async create(parent: HTMLElement, opts: { resolution?: number } = {}): Promise<Stage> {
    const app = new Application();
    await app.init({
      resizeTo: window,
      background: LETTERBOX_COLOR,
      antialias: true,
      autoDensity: true,
      resolution: opts.resolution ?? Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    app.canvas.setAttribute('aria-hidden', 'true');
    parent.appendChild(app.canvas);
    return new Stage(app);
  }

  private layout() {
    // app.screen is in CSS px regardless of renderer resolution.
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.scale = Math.min(w / LOGICAL.width, h / LOGICAL.height);
    this.offsetX = (w - LOGICAL.width * this.scale) / 2;
    this.offsetY = (h - LOGICAL.height * this.scale) / 2;
    this.root.scale.set(this.scale);
    this.root.position.set(this.offsetX, this.offsetY);
  }

  /** Change the render resolution (adaptive quality). */
  setResolution(r: number): void {
    this.app.renderer.resize(window.innerWidth, window.innerHeight, r);
    this.layout();
  }

  /** Convert client (CSS px) coordinates to logical canvas coordinates. */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.offsetX) / this.scale,
      y: (clientY - rect.top - this.offsetY) / this.scale,
    };
  }
}
