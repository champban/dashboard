/** Deterministic seeded PRNG (TDR T11). mulberry32 — fast, well distributed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exponentially distributed random draw with the given mean (for MTBF/MTTR). */
export function expDraw(rng: () => number, mean: number): number {
  // Guard u=0; -ln(u) * mean
  return -Math.log(1 - rng() || Number.MIN_VALUE) * mean;
}
