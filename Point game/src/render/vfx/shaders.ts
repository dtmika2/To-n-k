/**
 * Shared GLSL for the "vfx" look (League-style effects): additive light, noise that scrolls or twists,
 * hot white cores and bright rims, all computed per pixel on small quads and strips.
 */

/** Value noise and a fixed 4-octave fBm (the same hash as the mist shader in atmosphere.ts). */
export const NOISE = `
float vhash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + vec2(1.0, 0.0)), u.x), mix(vhash(i + vec2(0.0, 1.0)), vhash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float vfbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return v / 0.9375;
}

// Noise that repeats every 'period' (an integer) in x, so a scroll offset can wrap without a jump.
float tnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float i0 = mod(i.x, period);
  float i1 = mod(i.x + 1.0, period);
  return mix(mix(vhash(vec2(i0, i.y)), vhash(vec2(i1, i.y)), u.x), mix(vhash(vec2(i0, i.y + 1.0)), vhash(vec2(i1, i.y + 1.0)), u.x), u.y);
}

float tfbm(vec2 p, float period) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * tnoise(p, period);
    p = p * 2.0 + vec2(0.0, 9.7);
    period *= 2.0;
    a *= 0.5;
  }
  return v / 0.9375;
}
`;

/**
 * Shaders never see raw time: the noise hash loses precision with large inputs, and the kiosk runs for
 * days. Scroll offsets are wrapped here (in double precision) to the noise's period instead.
 */
export const wrap = (now: number, speed: number, period: number) => (((now / 1000) * speed) % period + period) % period;

/** Seconds for sin()-only use (twinkles, wobbles): wrapped rarely, so a jump happens every ~3 h at most. */
export const shaderTime = (now: number) => (now / 1000) % 10000;

/** 0xRRGGBB → [r, g, b] in 0…1. */
export function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** '#rrggbb' → 0xRRGGBB. */
export const cssHex = (css: string) => parseInt(css.slice(1), 16);
