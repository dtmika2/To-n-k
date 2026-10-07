export type Rng = () => number;

/** Small seeded PRNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randBetween(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function randRange(rng: Rng, range: readonly [number, number]): number {
  return randBetween(rng, range[0], range[1]);
}

/** Pick an index in [0, n) that differs from `last` when possible. */
export function pickNoRepeat(rng: Rng, n: number, last: number): number {
  if (n <= 1) return 0;
  let i = Math.floor(rng() * (n - 1));
  if (i >= last && last >= 0) i++;
  return Math.min(i, n - 1);
}
