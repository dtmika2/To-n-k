import type { Page, CDPSession } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export async function waitForBoot(page: Page): Promise<string> {
  await page.waitForFunction(() => (window as unknown as { __fglBoot?: string }).__fglBoot !== undefined, null, {
    timeout: 30_000,
  });
  return page.evaluate(() => (window as unknown as { __fglBoot: string }).__fglBoot);
}

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('screenshots', { recursive: true });
  await page.screenshot({ path: `screenshots/${name}.png` });
}

/** Evaluate against the app's test hook object. */
export async function fgl<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((src) => {
    const g = (window as unknown as { __fgl: Record<string, unknown> }).__fgl;
    return new Function('g', `return (${src})`)(g);
  }, fn) as Promise<T>;
}

/** Map logical (1280 × 800) coordinates to CSS client coordinates. */
export async function toClient(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([lx, ly]) => {
      const s = (window as unknown as { __fgl: { stage: { scale: number; offsetX: number; offsetY: number } } }).__fgl
        .stage;
      return { x: lx * s.scale + s.offsetX, y: ly * s.scale + s.offsetY };
    },
    [x, y],
  );
}

export interface TouchPoint {
  x: number;
  y: number;
  id: number;
}

/** Multi-touch driver using CDP so several fingers can be down at once. */
export class Touch {
  private constructor(private cdp: CDPSession) {}

  static async create(page: Page): Promise<Touch> {
    return new Touch(await page.context().newCDPSession(page));
  }

  async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: TouchPoint[]): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })),
    });
  }

  async tap(x: number, y: number): Promise<void> {
    await this.send('touchStart', [{ x, y, id: 0 }]);
    await this.send('touchEnd', []);
  }
}
