import { Buffer, BufferUsage, Geometry, Mesh, Shader } from 'pixi.js';

/**
 * A growable interleaved vertex buffer + index buffer, refilled every frame and drawn as one mesh with
 * additive blending. Beams and rings each keep one: every line (or ring) on screen is one draw call.
 * Attributes: aPosition (vec2) first, then the given float attributes in order.
 */
export class DynamicBatch {
  readonly mesh: Mesh<Geometry, Shader>;
  private readonly stride: number;
  private verts: Float32Array;
  private idx: Uint32Array;
  private readonly vbuf: Buffer;
  private readonly ibuf: Buffer;
  private readonly geometry: Geometry;
  private nVerts = 0;
  private nIdx = 0;
  private readonly group: { uniforms: { uTime: number; uFlow: Float32Array }; update(): void };

  constructor(attributes: [name: string, floats: number][], vertex: string, fragment: string, capacity = 2048) {
    this.stride = attributes.reduce((a, [, n]) => a + n, 0);
    this.verts = new Float32Array(capacity * this.stride);
    this.idx = new Uint32Array(capacity * 2);
    this.vbuf = new Buffer({ data: this.verts, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    this.ibuf = new Buffer({ data: this.idx, usage: BufferUsage.INDEX | BufferUsage.COPY_DST });
    const attrs: Record<string, { buffer: Buffer; format: 'float32x2' | 'float32x3' | 'float32x4'; stride: number; offset: number }> = {};
    let offset = 0;
    for (const [name, n] of attributes) {
      attrs[name] = { buffer: this.vbuf, format: `float32x${n}` as 'float32x2', stride: this.stride * 4, offset: offset * 4 };
      offset += n;
    }
    this.geometry = new Geometry({ attributes: attrs, indexBuffer: this.ibuf });
    const shader = Shader.from({
      gl: { vertex, fragment },
      resources: { batch: { uTime: { value: 0, type: 'f32' }, uFlow: { value: new Float32Array(4), type: 'vec4<f32>' } } },
    });
    this.group = shader.resources.batch as DynamicBatch['group'];
    this.mesh = new Mesh({ geometry: this.geometry, shader });
    this.mesh.blendMode = 'add';
    this.mesh.visible = false;
  }

  begin(): void {
    this.nVerts = 0;
    this.nIdx = 0;
  }

  /** Room for `verts` more vertices and `indices` more indices; returns the first new vertex's index. */
  reserve(verts: number, indices: number): number {
    if ((this.nVerts + verts) * this.stride > this.verts.length) {
      const grown = new Float32Array(Math.max(this.verts.length * 2, (this.nVerts + verts) * this.stride));
      grown.set(this.verts);
      this.verts = grown;
      this.vbuf.data = grown;
    }
    if (this.nIdx + indices > this.idx.length) {
      const grown = new Uint32Array(Math.max(this.idx.length * 2, this.nIdx + indices));
      grown.set(this.idx);
      this.idx = grown;
      this.ibuf.data = grown;
    }
    return this.nVerts;
  }

  /** Append one vertex (aPosition + the other attributes, in declaration order). */
  vertex(...values: number[]): void {
    this.verts.set(values, this.nVerts * this.stride);
    this.nVerts++;
  }

  index(...values: number[]): void {
    this.idx.set(values, this.nIdx);
    this.nIdx += values.length;
  }

  /** `time`: shaderTime(now); `flow`: up to four wrapped scroll offsets (see shaders.ts `wrap`). */
  end(time: number, flow: readonly number[] = []): void {
    this.mesh.visible = this.nIdx > 0;
    if (!this.mesh.visible) return;
    this.vbuf.update(this.nVerts * this.stride * 4);
    this.ibuf.update(this.nIdx * 4);
    this.geometry.indexCount = this.nIdx;
    this.group.uniforms.uTime = time;
    this.group.uniforms.uFlow.set(flow);
    this.group.update();
  }
}

/** Vertex shader for a batch: passes every attribute after aPosition through as a varying. */
export function batchVertex(varyings: [attr: string, varying: string, glslType: string][]): string {
  return `
in vec2 aPosition;
${varyings.map(([a, v, t]) => `in ${t} ${a};\nout ${t} ${v};`).join('\n')}
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  ${varyings.map(([a, v]) => `${v} = ${a};`).join('\n  ')}
}
`;
}
