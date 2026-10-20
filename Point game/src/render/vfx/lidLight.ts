import { NOISE, rgb, wrap } from './shaders.ts';
import { DynamicBatch, batchVertex } from './batch.ts';

export interface LidLightStyle {
  color: number;
  alpha: number;
  /** 0…1: the eye's glow (brightens the core). */
  glow: number;
  seed: number;
}

/**
 * Lids made of light (vfx look): a thin white-hot core inside a coloured body and glow, with light
 * travelling along the line and brief bright pulses. vUV.x is the distance along the line (world
 * units), vUV.y −1…1 across it; vParams.x a per-point fade (the line's ends, a lash's tip).
 */
const FRAGMENT = `
in vec2 vUV;
in vec4 vColor;
in vec4 vParams;
uniform vec4 uFlow;
${NOISE}
void main() {
  float d = abs(vUV.y);
  float fade = vParams.x;
  float glow = vParams.y;
  float seed = vParams.z;
  float x = vUV.x * 60.0;

  vec3 c = clamp(mix(vec3(dot(vColor.rgb, vec3(0.299, 0.587, 0.114))), vColor.rgb, 1.8), 0.0, 1.0);
  float flow = tnoise(vec2(x - uFlow.x, seed), 64.0);
  float pulse = pow(tnoise(vec2(x * 0.5 - uFlow.y, seed + 3.0), 32.0), 4.0) * 2.2;

  float core = exp(-pow(d / 0.16, 2.0));
  float body = exp(-pow(d / 0.42, 2.0));
  float halo = exp(-pow(d / 0.85, 2.0)) * 0.3;
  vec3 col = c * (body * (0.5 + 0.55 * flow + 0.4 * pulse) + halo) + vec3(1.0, 0.98, 0.94) * core * (0.22 + 0.3 * glow + 0.45 * pulse);
  gl_FragColor = vec4(col * fade * vColor.a * smoothstep(1.0, 0.8, d), 0.0);
}
`;

/** Every eye's lids and lashes of a frame as tapered strips in one dynamic mesh (world coordinates). */
export class LidLightBatch {
  private readonly batch = new DynamicBatch(
    [
      ['aPosition', 2],
      ['aUV', 2],
      ['aColor', 4],
      ['aParams', 4],
    ],
    batchVertex([
      ['aUV', 'vUV', 'vec2'],
      ['aColor', 'vColor', 'vec4'],
      ['aParams', 'vParams', 'vec4'],
    ]),
    FRAGMENT,
    4096,
  );

  get mesh() {
    return this.batch.mesh;
  }

  begin(): void {
    this.batch.begin();
  }

  /**
   * One line: `pts` as x,y pairs (world), `halfWidth(i)` the strip's half-width at point i (the visible
   * core is about a third of it), `fade(i)` 0…1.
   */
  add(pts: readonly number[], halfWidth: (i: number) => number, fade: (i: number) => number, o: LidLightStyle): void {
    const n = pts.length / 2;
    if (n < 2) return;
    const [r, g, b] = rgb(o.color);
    const first = this.batch.reserve(n * 2, (n - 1) * 6);
    let along = 0;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2];
      const y = pts[i * 2 + 1];
      if (i > 0) along += Math.hypot(x - pts[i * 2 - 2], y - pts[i * 2 - 1]);
      const a = Math.max(0, i - 1);
      const c = Math.min(n - 1, i + 1);
      const dx = pts[c * 2] - pts[a * 2];
      const dy = pts[c * 2 + 1] - pts[a * 2 + 1];
      const l = Math.hypot(dx, dy) || 1;
      const w = halfWidth(i);
      const nx = (-dy / l) * w;
      const ny = (dx / l) * w;
      const f = fade(i);
      this.batch.vertex(x + nx, y + ny, along, 1, r, g, b, o.alpha, f, o.glow, o.seed, 0);
      this.batch.vertex(x - nx, y - ny, along, -1, r, g, b, o.alpha, f, o.glow, o.seed, 0);
      if (i < n - 1) {
        const v = first + i * 2;
        this.batch.index(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }

  end(now: number): void {
    this.batch.end(0, [wrap(now, 3, 64), wrap(now, 1.6, 32), 0, 0]);
  }
}
