/**
 * Seedable pseudo-random number generator (xoshiro128**).
 * Deterministic when seeded; uses Math.random() as fallback.
 */
export class SeededRandom {
  private s: Uint32Array;

  constructor(seed?: number) {
    this.s = new Uint32Array(4);
    if (seed !== undefined) {
      // SplitMix32 to initialize state from single seed
      let z = seed | 0;
      for (let i = 0; i < 4; i++) {
        z = (z + 0x9e3779b9) | 0;
        let t = z ^ (z >>> 16);
        t = Math.imul(t, 0x21f0aaad);
        t = t ^ (t >>> 15);
        t = Math.imul(t, 0x735a2d97);
        t = t ^ (t >>> 15);
        this.s[i] = t >>> 0;
      }
    } else {
      // Non-deterministic initialization
      for (let i = 0; i < 4; i++) {
        this.s[i] = (Math.random() * 0xffffffff) >>> 0;
      }
    }
  }

  /** Returns a number in [0, 1). */
  next(): number {
    const s = this.s;
    const result = Math.imul(s[1] * 5, 7) >>> 0;
    const t = (s[1] << 9) >>> 0;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = ((s[3] << 11) | (s[3] >>> 21)) >>> 0;

    return (result >>> 0) / 0x100000000;
  }

  /** Returns a random integer in [0, max). */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}
