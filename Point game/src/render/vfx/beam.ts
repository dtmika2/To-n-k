import { NOISE, rgb, wrap } from './shaders.ts';
import { DynamicBatch, batchVertex } from './batch.ts';

/** A point of a strand: position plus its fraction `s` (0…1) along the whole strand. */
export interface BeamPoint {
  x: number;
  y: number;
  s: number;
}

export interface BeamStyle {
  color: number;
  alpha: number;
  /** Fray 0…1: the beam thins, breaks up and flickers (the unsettled line). */
  u: number;
  /** White-hot core strength. */
  hot: number;
  seed: number;
  /** Half-width of the strip in world units (the visible beam is about half of it). */
  halfWidth?: number;
}

/**
 * Energy beam (references: the violet skillshots). Across the strip a hot white core sits in a coloured
 * body and a soft glow; along it, stretched noise scrolls from start to end, so the light visibly flows.
 * vUV.x is the distance along the strand in world units (vParams.w its length), vUV.y −1…1 across it; uFlow holds the wrapped
 * scroll offsets (flow, pulses, flicker).
 */
const FRAGMENT = `
in vec2 vUV;
in vec4 vColor;
in vec4 vParams;
uniform vec4 uFlow;
${NOISE}
void main() {
  float d = abs(vUV.y);
  float u = vParams.x;
  float hot = vParams.y;
  float seed = vParams.z;
  float len = vParams.w;
  float x = vUV.x * 38.0;
  float flow = x - uFlow.x;

  float n = tfbm(vec2(flow, vUV.y * 1.7 + seed * 3.1), 64.0);
  float pulse = tnoise(vec2(x * 0.5 - uFlow.y, seed * 7.0), 32.0);
  float fray = mix(1.0, smoothstep(0.3, 0.78, tnoise(vec2(x * 0.9 + uFlow.z, seed), 64.0)), min(1.0, u * 1.4));
  float w = mix(0.55, 1.0, n) * (1.0 - 0.4 * u);

  // the game's colours are pale; push the saturation so the body reads as coloured light
  vec3 c = vColor.rgb;
  c = clamp(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.8), 0.0, 1.0);

  float body = exp(-pow(d / (0.2 * w), 2.0));
  float glow = exp(-pow(d / 0.42, 2.0)) * (0.15 + 0.35 * n);
  float core = exp(-pow(d / 0.05, 2.0));
  float wisps = smoothstep(0.55, 0.9, tfbm(vec2(flow * 0.5 + 7.0, vUV.y * 2.2), 32.0)) * exp(-pow(d / 0.6, 2.0)) * 0.8;
  // round the ends off: the haze fades over the last ~0.03 world units, the line itself over ~0.006
  float toEnd = min(vUV.x, len - vUV.x);
  float hazeEnd = smoothstep(0.0, 0.03, toEnd);
  float lineEnd = smoothstep(0.0, 0.006, toEnd);
  float edge = smoothstep(1.0, 0.75, d);

  vec3 col = c * (body * (0.7 + 0.8 * pulse) * lineEnd + (glow + wisps) * hazeEnd) + vec3(1.0, 0.97, 0.9) * core * (0.25 + 0.75 * hot) * lineEnd;
  gl_FragColor = vec4(col * fray * edge * vColor.a, 0.0);
}
`;

/** All strands of a frame as triangle strips in one dynamic mesh. */
export class BeamBatch {
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
  );

  get mesh() {
    return this.batch.mesh;
  }

  begin(): void {
    this.batch.begin();
  }

  /** One unbroken run of a strand `len` long (world units); `pts[i].s` places it along the strand. */
  add(pts: readonly BeamPoint[], len: number, o: BeamStyle): void {
    const n = pts.length;
    if (n < 2) return;
    const hw = o.halfWidth ?? 0.03;
    const [r, g, b] = rgb(o.color);
    const first = this.batch.reserve(n * 2, (n - 1) * 6);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)];
      const c = pts[Math.min(n - 1, i + 1)];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * hw;
      const ny = (dx / l) * hw;
      const along = p.s * len;
      this.batch.vertex(p.x + nx, p.y + ny, along, 1, r, g, b, o.alpha, o.u, o.hot, o.seed, len);
      this.batch.vertex(p.x - nx, p.y - ny, along, -1, r, g, b, o.alpha, o.u, o.hot, o.seed, len);
      if (i < n - 1) {
        const v = first + i * 2;
        this.batch.index(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  }

  end(now: number): void {
    this.batch.end(0, [wrap(now, 4.5, 64), wrap(now, 2.2, 32), wrap(now, 9, 64), 0]);
  }
}
