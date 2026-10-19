import { Container, Mesh, MeshGeometry, RenderTexture, Shader, Sprite, type Renderer, type Texture } from 'pixi.js';
import { ASPECT, type Vec } from '../pattern/types.ts';

/**
 * Plan §7 layer 4: the light, drifting mist (fBm), which parts around the finger. Rendered at
 * `renderScale` into a texture that a sprite stretches over the portrait world. The cloud cover
 * (layer 3) is the puff layer in clouds.ts.
 */

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

const FRAGMENT = `
in vec2 vUV;
uniform sampler2D uMask;
uniform float uTime;
uniform float uAspect;
uniform float uMist;
uniform float uOctaves;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p, float octaves) {
  float v = 0.0;
  float a = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= octaves) break;
    v += a * noise(p);
    norm += a;
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return v / norm;
}

void main() {
  vec2 p = vec2(vUV.x, vUV.y * uAspect);
  float warpOct = min(uOctaves, 3.0);

  // mist: light, drifting, parted by the finger mask
  vec2 m = p * 3.6 + vec2(uTime * 0.035, -uTime * 0.02);
  float mn = fbm(m + 0.9 * vec2(fbm(m * 0.6 + uTime * 0.025, warpOct), 0.0), max(uOctaves - 1.0, 2.0));
  float parted = clamp(texture2D(uMask, vUV).r, 0.0, 1.0);
  float ma = smoothstep(0.38, 0.85, mn) * 0.5 * uMist * (1.0 - 0.92 * parted);
  vec3 mc = vec3(0.56, 0.56, 0.78);
  gl_FragColor = vec4(mc * ma, ma);
}
`;

interface TrailPoint {
  pos: Vec;
  t: number;
  strength: number;
  radius: number;
}

export interface AtmosphereParams {
  mist: number;
}

const TRAIL_MAX = 24;
const TRAIL_CLOSE_MS = 2600; // how slowly the mist closes in behind the finger

export class Atmosphere {
  readonly sprite: Sprite;
  private rt: RenderTexture;
  private maskRt: RenderTexture;
  private readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly maskScene = new Container();
  private readonly maskSprites: Sprite[] = [];
  private trail: TrailPoint[] = [];
  private readonly group: { uniforms: Record<string, unknown>; update(): void };
  octaves: number;

  constructor(
    private readonly renderer: Renderer,
    dot: Texture,
    octaves: number,
  ) {
    this.octaves = octaves;
    this.rt = RenderTexture.create({ width: 16, height: 16, resolution: 1 });
    this.maskRt = RenderTexture.create({ width: 8, height: 8, resolution: 1 });
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = Shader.from({
      gl: { vertex: VERTEX, fragment: FRAGMENT },
      resources: {
        uMask: this.maskRt.source,
        atmo: {
          uTime: { value: 0, type: 'f32' },
          uAspect: { value: ASPECT, type: 'f32' },
          uMist: { value: 1, type: 'f32' },
          uOctaves: { value: octaves, type: 'f32' },
        },
      },
    });
    this.group = shader.resources.atmo as Atmosphere['group'];
    this.mesh = new Mesh({ geometry, shader });

    for (let i = 0; i < TRAIL_MAX; i++) {
      const s = new Sprite(dot);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.maskScene.addChild(s);
      this.maskSprites.push(s);
    }

    this.sprite = new Sprite(this.rt);
    this.sprite.width = 1;
    this.sprite.height = ASPECT;
  }

  /** Portrait size in device pixels × renderScale. */
  resize(portraitPxWidth: number, renderScale: number): void {
    const w = Math.max(16, Math.round(portraitPxWidth * renderScale));
    const h = Math.max(16, Math.round(w * ASPECT));
    if (w === this.rt.width && h === this.rt.height) return;
    // Recreate rather than resize: a resized RenderTexture that was already rendered to keeps its old
    // framebuffer viewport, which squeezes the whole layer into its first size.
    const [oldRt, oldMask] = [this.rt, this.maskRt];
    this.rt = RenderTexture.create({ width: w, height: h, resolution: 1 });
    this.maskRt = RenderTexture.create({ width: Math.max(8, Math.round(w / 4)), height: Math.max(8, Math.round(h / 4)), resolution: 1 });
    this.mesh.shader!.resources.uMask = this.maskRt.source;
    this.mesh.scale.set(w, h);
    this.sprite.texture = this.rt;
    oldRt.destroy(true);
    oldMask.destroy(true);
    this.sprite.width = 1;
    this.sprite.height = ASPECT;
  }

  /** The finger (or a tap) pushes the mist aside here; it closes back in slowly. */
  part(pos: Vec, now: number, strength = 1, radius = 0.075): void {
    const last = this.trail[this.trail.length - 1];
    if (last && now - last.t < 40 && Math.hypot(last.pos.x - pos.x, last.pos.y - pos.y) < radius * 0.4) {
      last.t = now;
      last.pos = pos;
      return;
    }
    this.trail.push({ pos, t: now, strength, radius });
    if (this.trail.length > TRAIL_MAX) this.trail.shift();
  }

  update(now: number, p: AtmosphereParams): void {
    this.trail = this.trail.filter((t) => now - t.t < TRAIL_CLOSE_MS * 2);
    const mw = this.maskRt.width;
    const mh = this.maskRt.height;
    this.maskSprites.forEach((s, i) => {
      const t = this.trail[i];
      s.visible = !!t;
      if (!t) return;
      const age = (now - t.t) / TRAIL_CLOSE_MS;
      s.alpha = t.strength * Math.exp(-age * 1.6);
      s.position.set(t.pos.x * mw, (t.pos.y / ASPECT) * mh);
      const px = t.radius * (1 + 0.35 * Math.min(1, age)) * mw * 2;
      s.width = px;
      s.height = px;
    });
    this.renderer.render({ container: this.maskScene, target: this.maskRt, clear: true, clearColor: [0, 0, 0, 0] });

    const u = this.group.uniforms;
    u.uTime = (now / 1000) % 10000;
    u.uMist = p.mist;
    u.uOctaves = this.octaves;
    this.group.update();
    this.renderer.render({ container: this.mesh, target: this.rt, clear: true, clearColor: [0, 0, 0, 0] });
  }
}
