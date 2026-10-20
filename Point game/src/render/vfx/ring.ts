import { rgb, shaderTime, wrap } from './shaders.ts';
import { DynamicBatch, batchVertex } from './batch.ts';

export interface RingStyle {
  color: number;
  alpha: number;
  /** Line half-width (world units). */
  width: number;
  /** Relative radius wobble (as wobblyCircle's `amp`), with its seed. */
  wobble?: number;
  seed?: number;
  /** Soft fill inside the ring, brightening towards the edge (0…1). */
  fill?: number;
  /** Rotating dashes just inside the edge: strength 0…1, count, turns per second. */
  dashes?: number;
  dashCount?: number;
  dashSpeed?: number;
}

/**
 * Ring of light (reference: the range indicator with its rotating inner arcs): a thin bright edge with a
 * hot centre line, a halo, an optional soft fill and dashes. Same harmonics as draw.ts wobblyCircle.
 */
const FRAGMENT = `
in vec2 vLocal;
in vec4 vColor;
in vec4 vRing;
in vec4 vStyle;
uniform float uTime;
void main() {
  float d = length(vLocal);
  float a = atan(vLocal.y, vLocal.x);
  float seed = vRing.w;
  float wob = 0.5 * sin(3.0 * a + uTime * 0.9 + seed * 1.7) + 0.3 * sin(5.0 * a - uTime * 1.3 + seed * 2.9) + 0.2 * sin(2.0 * a + uTime * 0.5 + seed * 0.6);
  float r = vRing.x * (1.0 + vRing.z * wob);
  float w = vRing.y;
  float e = (d - r) / w;

  float edge = exp(-e * e);
  float halo = exp(-e * e / 16.0) * 0.35;
  float k = clamp(d / r, 0.0, 1.0);
  float inner = d < r ? (k * k * k * 0.55 + 0.08) * vStyle.x : 0.0;
  float shimmer = 0.8 + 0.2 * sin(a * 7.0 + uTime * 2.3 + seed) * sin(a * 3.0 - uTime * 1.1);

  // dash phase and count: count is an integer, so the atan seam doesn't show
  float seg = fract(a / 6.2831853 * vStyle.w + vStyle.z);
  float dash = smoothstep(0.0, 0.06, seg) * smoothstep(0.6, 0.48, seg);
  float er = (d - r * 0.84) / (w * 1.8);
  float dashes = dash * exp(-er * er) * vStyle.y;

  vec3 c = clamp(mix(vec3(dot(vColor.rgb, vec3(0.299, 0.587, 0.114))), vColor.rgb, 1.6), 0.0, 1.0);
  vec3 col = c * (edge * shimmer + halo + inner + dashes) + vec3(1.0, 0.98, 0.92) * edge * edge * 0.45;
  gl_FragColor = vec4(col * vColor.a, 0.0);
}
`;

/** All rings of a frame, one quad each, in one dynamic mesh. */
export class RingBatch {
  private readonly batch = new DynamicBatch(
    [
      ['aPosition', 2],
      ['aLocal', 2],
      ['aColor', 4],
      ['aRing', 4],
      ['aStyle', 4],
    ],
    batchVertex([
      ['aLocal', 'vLocal', 'vec2'],
      ['aColor', 'vColor', 'vec4'],
      ['aRing', 'vRing', 'vec4'],
      ['aStyle', 'vStyle', 'vec4'],
    ]),
    FRAGMENT,
    256,
  );
  private now = 0;

  get mesh() {
    return this.batch.mesh;
  }

  begin(now: number): void {
    this.now = now;
    this.batch.begin();
  }

  add(x: number, y: number, radius: number, o: RingStyle): void {
    if (o.alpha <= 0.002 || radius <= 0) return;
    const wobble = o.wobble ?? 0;
    const ext = radius * (1 + wobble) + o.width * 8;
    const [r, g, b] = rgb(o.color);
    const phase = wrap(this.now, o.dashSpeed ?? 0.08, 1);
    const ring = [radius, o.width, wobble, o.seed ?? 0] as const;
    const style = [o.fill ?? 0, o.dashes ?? 0, phase, o.dashCount ?? 12] as const;
    const v = this.batch.reserve(4, 6);
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      this.batch.vertex(x + sx * ext, y + sy * ext, sx * ext, sy * ext, r, g, b, o.alpha, ...ring, ...style);
    }
    this.batch.index(v, v + 1, v + 2, v, v + 2, v + 3);
  }

  end(): void {
    this.batch.end(shaderTime(this.now));
  }
}
