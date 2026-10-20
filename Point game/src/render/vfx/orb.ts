import { Mesh, MeshGeometry, Shader } from 'pixi.js';
import { NOISE, rgb, shaderTime, wrap } from './shaders.ts';

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
 * Energy orb (reference: the fire orb): a white-hot core inside swirling tongues of flame that reach
 * out unevenly by direction, plus a soft halo. Additive.
 */
const FRAGMENT = `
in vec2 vUV;
uniform float uTime;
uniform float uAngle;
uniform vec2 uDrift;
uniform float uIntensity;
uniform vec3 uColor;
uniform vec3 uHot;
${NOISE}
void main() {
  vec2 p = vUV;
  float r = length(p);
  if (r > 1.0) discard;

  float ang = uAngle + (1.0 - r) * 2.6;
  float c = cos(ang);
  float s = sin(ang);
  vec2 q = mat2(c, -s, s, c) * p;
  float n = vfbm(q * 3.0 + uDrift);

  // tongues: how far the flame reaches depends on the direction only, so there is no seam
  vec2 dir = p / max(r, 1e-3);
  float tongues = vnoise(dir * 2.5 + uDrift * 1.5);
  float reach = 0.3 + 0.55 * tongues * (0.5 + 0.5 * n);
  float flame = smoothstep(reach, reach * 0.25, r) * (0.55 + 0.7 * n);
  float core = exp(-pow(r / 0.1, 2.0));
  float halo = exp(-pow(r / 0.5, 2.0)) * 0.25;
  vec3 tint = clamp(mix(vec3(dot(uColor, vec3(0.299, 0.587, 0.114))), uColor, 1.7), 0.0, 1.0);
  float flicker = 0.9 + 0.1 * sin(uTime * 17.0) * sin(uTime * 7.3);

  vec3 col = tint * (flame * 0.75 + halo) + uHot * (core * 1.2 + flame * flame * flame * 0.35);
  gl_FragColor = vec4(col * uIntensity * flicker * smoothstep(1.0, 0.8, r), 0.0);
}
`;

interface OrbUniforms {
  uniforms: { uTime: number; uAngle: number; uDrift: Float32Array; uIntensity: number };
  update(): void;
}

/** One orb on a quad; `show()` places and lights it for this frame, `hide()` turns it off. */
export class EnergyOrb {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly group: OrbUniforms;

  constructor(color: number, hot: number) {
    const geometry = new MeshGeometry({
      positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      uvs: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = Shader.from({
      gl: { vertex: VERTEX, fragment: FRAGMENT },
      resources: {
        orb: {
          uTime: { value: 0, type: 'f32' },
          uAngle: { value: 0, type: 'f32' },
          uDrift: { value: new Float32Array(2), type: 'vec2<f32>' },
          uIntensity: { value: 0, type: 'f32' },
          uColor: { value: new Float32Array(rgb(color)), type: 'vec3<f32>' },
          uHot: { value: new Float32Array(rgb(hot)), type: 'vec3<f32>' },
        },
      },
    });
    this.group = shader.resources.orb as OrbUniforms;
    this.mesh = new Mesh({ geometry, shader });
    this.mesh.blendMode = 'add';
    this.mesh.visible = false;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  /** `radius`: reach of the flames (world units); `intensity` 0…1+. */
  show(now: number, x: number, y: number, radius: number, intensity: number): void {
    this.mesh.visible = intensity > 0.002;
    if (!this.mesh.visible) return;
    this.mesh.position.set(x, y);
    this.mesh.scale.set(radius);
    const u = this.group.uniforms;
    u.uTime = shaderTime(now);
    u.uAngle = wrap(now, 1.8, Math.PI * 2);
    const a = wrap(now, 0.6, Math.PI * 2);
    u.uDrift[0] = 2 * Math.cos(a);
    u.uDrift[1] = 2 * Math.sin(a);
    u.uIntensity = intensity;
    this.group.update();
  }
}
