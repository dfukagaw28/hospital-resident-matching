export interface Rng {
  /** [0, 1) の一様乱数 */
  nextFloat(): number;
}


export class MathRng implements Rng {
  nextFloat(): number {
    return Math.random();
  }
}


const MASK_64 = (1n << 64n) - 1n;
const MULTIPLIER = 6364136223846793005n;
const DEFAULT_INC = 1442695040888963407n; // must be odd

export class Pcg32Rng implements Rng {
  private state: bigint;
  private inc: bigint;

  constructor(seed: number | bigint) {
    const s = BigInt(seed);
    this.state = 0n;
    this.inc = (DEFAULT_INC << 1n) | 1n; // ensure odd
    this.step();
    this.state = (this.state + s) & MASK_64;
    this.step();
  }

  /** 32bit の乱数 */
  nextUint32(): number {
    const oldstate = this.state;
    this.state = (oldstate * MULTIPLIER + this.inc) & MASK_64;

    const xorshifted = Number(((oldstate >> 18n) ^ oldstate) >> 27n) >>> 0;
    const rot = Number(oldstate >> 59n) & 31;
    // rotate right
    return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
  }

  private step(): void {
    this.state = (this.state * MULTIPLIER + this.inc) & MASK_64;
  }

  nextFloat(): number {
    // [0,1)
    return this.nextUint32() / 0x100000000;
  }

  /** 32bit の乱数を count 個 (nextUint32() を count 回呼ぶのと等価) */
  nextUint32Bulk(count: number): number[] {
    return Array.from({ length: count }, () => this.nextUint32());
  }
}


// [0, max) の整数乱数
export function nextInt(rng: Rng, max: number): number {
  if (max <= 0) throw new Error("max must be positive");
  return Math.floor(rng.nextFloat() * max);
}

// 0..n-1 のランダム順列
export function permutation(rng: Rng, n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 0..n-1 のランダム順列を count 個生成する
 * (permutation() を count 回呼ぶのと等価)
 */
export function permutations(rng: Rng, count: number, n: number): number[][] {
  return Array.from({ length: count }, () => permutation(rng, n));
}
