import { Mesh, MeshGeometry, Shader } from 'pixi.js';
import { NOISE, cssHex, rgb, shaderTime, wrap } from './shaders.ts';

const VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

/**
 * A portal: a dark, star-flecked void inside a hot rim, with twisting arms and light streaks around it
 * (the reference's purple vortex). The swirl twists more towards the centre, like the classic iris.
 */
const FRAGMENT = `
in vec2 vUV;
uniform float uTime;
uniform float uSeed;
uniform float uAngle;
uniform vec2 uDrift;
uniform float uGlow;
uniform float uOpen;
uniform float uAlpha;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uHot;
${NOISE}
void main() {
  vec2 p = vUV;
  float r = length(p);
  if (r > 1.0) discard;
  float t = uTime;

  float ang = uAngle + (1.0 - r) * 3.4;
  float c = cos(ang);
  float s = sin(ang);
  vec2 q = mat2(c, -s, s, c) * p;
  float n = vfbm(q * 2.6 + uSeed);
  float n2 = vfbm(q * 5.0 - uSeed + uDrift);

  // streaks depend on the direction only, so they have no seam
  vec2 dir = p / max(r, 1e-3);
  float rays = vnoise(dir * 3.0 + vec2(uSeed) + uDrift * 1.75);
  rays = pow(rays, 3.0) * 2.4;

  // the void opens with the lids: a sleeping eye shows mostly rim and arms
  float CORE = 0.1 + 0.32 * uOpen;
  float rim = exp(-pow((r - CORE) / 0.055, 2.0));
  float halo = exp(-pow((r - CORE) / 0.2, 2.0));
  float voidMask = 1.0 - smoothstep(CORE - 0.05, CORE + 0.02, r);
  float outside = smoothstep(CORE - 0.02, CORE + 0.12, r);
  float arms = smoothstep(0.38, 0.8, n) * smoothstep(1.0, 0.5, r) * outside;
  float streak = rays * outside * (1.0 - smoothstep(0.55, 1.0, r));

  // the void: deep colour churning slowly, with twinkling stars
  vec3 col = uDeep * 0.28 * (0.5 + 0.9 * n2) * voidMask;
  vec2 g = q * 20.0;
  vec2 cell = floor(g);
  float h = vhash(cell + uSeed);
  float star = step(0.9, h) * smoothstep(0.16, 0.0, length(fract(g) - 0.5)) * (0.5 + 0.5 * sin(t * 3.0 + h * 40.0));
  col += vec3(star) * voidMask;

  col += uMid * (arms * 0.85 + streak * 0.7 + halo * 0.45);
  col += mix(uMid, uHot, 0.55) * rim * 1.3;
  col += uHot * rim * rim * (0.35 + uGlow);
  col *= 0.7 + 0.7 * uGlow;

  float a = clamp(voidMask * 0.96 + arms + streak + halo * 0.8 + rim, 0.0, 1.0);
  a *= 1.0 - smoothstep(0.85, 1.0, r);
  gl_FragColor = vec4(col * uAlpha, a * uAlpha);
}
`;

/** One quad −1…1 shared by every portal; each mesh scales it to its radius. */
let quad: MeshGeometry | null = null;

interface PortalUniforms {
  uniforms: { uTime: number; uAngle: number; uDrift: Float32Array; uGlow: number; uOpen: number; uAlpha: number };
  update(): void;
}

/** The "vfx" look's iris: a portal shader on a quad, `radius` in world units, colours from the eye's palette. */
export class PortalIris {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly group: PortalUniforms;

  /** `spin`: swirl speed in rad/s (signed). */
  constructor(seed: number, palette: readonly string[], radius: number, private readonly spin: number) {
    quad ??= new MeshGeometry({
      positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      uvs: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const [deep, mid, hot] = palette.map((c) => rgb(cssHex(c)));
    const shader = Shader.from({
      gl: { vertex: VERTEX, fragment: FRAGMENT },
      resources: {
        portal: {
          uTime: { value: 0, type: 'f32' },
          uSeed: { value: (seed % 97) * 1.37, type: 'f32' },
          uAngle: { value: 0, type: 'f32' },
          uDrift: { value: new Float32Array(2), type: 'vec2<f32>' },
          uGlow: { value: 0, type: 'f32' },
          uOpen: { value: 1, type: 'f32' },
          uAlpha: { value: 1, type: 'f32' },
          uDeep: { value: new Float32Array(deep), type: 'vec3<f32>' },
          uMid: { value: new Float32Array(mid), type: 'vec3<f32>' },
          uHot: { value: new Float32Array(hot), type: 'vec3<f32>' },
        },
      },
    });
    this.group = shader.resources.portal as PortalUniforms;
    this.mesh = new Mesh({ geometry: quad, shader });
    this.mesh.scale.set(radius);
  }

  /** `open`: the eye's openness 0…1 (the void grows with it). */
  update(now: number, glow: number, open: number, alpha = 1): void {
    const u = this.group.uniforms;
    u.uTime = shaderTime(now);
    u.uAngle = wrap(now, this.spin, Math.PI * 2);
    // slow circular drift of the noise: periodic, so the offsets never grow
    const a = wrap(now, 0.1, Math.PI * 2);
    u.uDrift[0] = 2 * Math.cos(a);
    u.uDrift[1] = 2 * Math.sin(a);
    u.uGlow = Math.min(1, glow);
    u.uOpen = Math.min(1, Math.max(0, open));
    u.uAlpha = alpha;
    this.group.update();
  }
}
