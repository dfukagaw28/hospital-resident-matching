/**
 * A port of the pieces of `numpy.random` that the biased instance generator
 * needs, faithful down to the last bit: `numpyDefaultRng(seed)` draws exactly
 * what `numpy.random.default_rng(seed)` draws, so that a biased instance
 * generated here is the very instance the Python version generates.
 *
 * That covers `SeedSequence`, the `PCG64` bit generator, `standard_normal`
 * (the ziggurat algorithm) and `integers` (Lemire's algorithm).
 */

import {
  FI_DOUBLE,
  KI_DOUBLE,
  WI_DOUBLE,
  ZIGGURAT_NOR_INV_R,
  ZIGGURAT_NOR_R,
} from "./zigguratConstants.js";

const MASK_32 = 0xffffffff;
const MASK_64 = (1n << 64n) - 1n;
const MASK_128 = (1n << 128n) - 1n;

// ---------------------------------------------------------------------------
// SeedSequence
// ---------------------------------------------------------------------------

const INIT_A = 0x43b0d7e5;
const MULT_A = 0x931e8875;
const INIT_B = 0x8b51f9dd;
const MULT_B = 0x58f38ded;
const MIX_MULT_L = 0xca01f9dd;
const MIX_MULT_R = 0x4973f715;
const XSHIFT = 16;

/** Multiply two uint32s, keeping the low 32 bits. */
function mul32(a: number, b: number): number {
  return Math.imul(a, b) >>> 0;
}

/** Spread the entropy of a word over its bits, advancing the hash constant. */
function hashmix(value: number, hashConst: number): [number, number] {
  let v = (value ^ hashConst) >>> 0;
  const nextConst = mul32(hashConst, MULT_A);
  v = mul32(v, nextConst);
  v = (v ^ (v >>> XSHIFT)) >>> 0;
  return [v, nextConst];
}

/** Combine two words so that neither of them can be recovered alone. */
function mix(x: number, y: number): number {
  let result = (mul32(MIX_MULT_L, x) - mul32(MIX_MULT_R, y)) >>> 0;
  result = (result ^ (result >>> XSHIFT)) >>> 0;
  return result;
}

/** Split a non-negative integer into uint32 words, the least significant first. */
function intToUint32Array(n: bigint): number[] {
  if (n < 0n) throw new Error("expected a non-negative seed");
  if (n === 0n) return [0];

  const words: number[] = [];
  let rest = n;
  while (rest > 0n) {
    words.push(Number(rest & 0xffffffffn));
    rest >>= 32n;
  }
  return words;
}

/**
 * NumPy's `SeedSequence`, which turns a seed of any size into the words that
 * a bit generator is initialized from.
 */
export class SeedSequence {
  readonly poolSize: number;
  private readonly pool: number[];

  constructor(entropy: number | bigint, poolSize = 4) {
    this.poolSize = poolSize;
    this.pool = new Array<number>(poolSize).fill(0);
    this.mixEntropy(intToUint32Array(BigInt(entropy)));
  }

  private mixEntropy(entropy: number[]): void {
    let hashConst = INIT_A;

    for (let i = 0; i < this.poolSize; i++) {
      [this.pool[i], hashConst] = hashmix(i < entropy.length ? entropy[i]! : 0, hashConst);
    }

    // Mix all the bits together so that the later ones affect the earlier ones
    for (let iSrc = 0; iSrc < this.poolSize; iSrc++) {
      for (let iDst = 0; iDst < this.poolSize; iDst++) {
        if (iSrc === iDst) continue;
        let hashed: number;
        [hashed, hashConst] = hashmix(this.pool[iSrc]!, hashConst);
        this.pool[iDst] = mix(this.pool[iDst]!, hashed);
      }
    }

    // Mix in the entropy that did not fit into the pool
    for (let iSrc = this.poolSize; iSrc < entropy.length; iSrc++) {
      for (let iDst = 0; iDst < this.poolSize; iDst++) {
        let hashed: number;
        [hashed, hashConst] = hashmix(entropy[iSrc]!, hashConst);
        this.pool[iDst] = mix(this.pool[iDst]!, hashed);
      }
    }
  }

  /** Generate `nWords` uint32 words of state. */
  generateState(nWords: number): number[] {
    const state = new Array<number>(nWords);
    let hashConst = INIT_B;

    for (let iDst = 0; iDst < nWords; iDst++) {
      let dataVal = (this.pool[iDst % this.poolSize]! ^ hashConst) >>> 0;
      hashConst = mul32(hashConst, MULT_B);
      dataVal = mul32(dataVal, hashConst);
      state[iDst] = (dataVal ^ (dataVal >>> XSHIFT)) >>> 0;
    }

    return state;
  }

  /** Generate `nWords` uint64 words of state (the uint32 ones, paired up). */
  generateState64(nWords: number): bigint[] {
    const words = this.generateState(nWords * 2);
    const state = new Array<bigint>(nWords);
    for (let i = 0; i < nWords; i++) {
      // NumPy views the uint32 words as uint64 ones, hence little-endian
      state[i] = BigInt(words[2 * i]!) | (BigInt(words[2 * i + 1]!) << 32n);
    }
    return state;
  }
}

// ---------------------------------------------------------------------------
// PCG64
// ---------------------------------------------------------------------------

const PCG64_MULTIPLIER = (2549297995355413924n << 64n) + 4865540595714422341n;

/** Rotate a uint64 right by `rot` bits. */
function rotr64(value: bigint, rot: number): bigint {
  const r = BigInt(rot & 63);
  return ((value >> r) | (value << (64n - r))) & MASK_64;
}

/**
 * NumPy's `PCG64` bit generator (the XSL-RR variant, 128 bits of state).
 */
export class Pcg64 {
  private state: bigint;
  private readonly inc: bigint;
  private hasUint32 = false;
  private bufferedUint32 = 0;

  constructor(seed: number | bigint | SeedSequence) {
    const seq = seed instanceof SeedSequence ? seed : new SeedSequence(seed);
    const words = seq.generateState64(4);

    const initState = (words[0]! << 64n) | words[1]!;
    const initSeq = (words[2]! << 64n) | words[3]!;

    this.state = 0n;
    this.inc = ((initSeq << 1n) | 1n) & MASK_128;
    this.step();
    this.state = (this.state + initState) & MASK_128;
    this.step();
  }

  private step(): void {
    this.state = (this.state * PCG64_MULTIPLIER + this.inc) & MASK_128;
  }

  /** The next 64 bits of the stream. */
  nextUint64(): bigint {
    this.step();
    return rotr64(((this.state >> 64n) ^ this.state) & MASK_64, Number(this.state >> 122n));
  }

  /**
   * The next 32 bits of the stream.
   *
   * A 64-bit draw serves two calls, the low half first, exactly as NumPy
   * buffers it.
   */
  nextUint32(): number {
    if (this.hasUint32) {
      this.hasUint32 = false;
      return this.bufferedUint32;
    }
    const next = this.nextUint64();
    this.hasUint32 = true;
    this.bufferedUint32 = Number((next >> 32n) & 0xffffffffn);
    return Number(next & 0xffffffffn);
  }

  /** A double in [0, 1), out of the top 53 bits of a draw. */
  nextDouble(): number {
    return Number(this.nextUint64() >> 11n) * (1.0 / 9007199254740992.0);
  }
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/** Lemire's bounded random, over 32 bits: an integer in [0, range]. */
function boundedLemireUint32(bitGenerator: Pcg64, range: bigint): bigint {
  // The product needs 64 bits, which is more than a number holds exactly
  const excl = range + 1n;
  let m = BigInt(bitGenerator.nextUint32()) * excl;
  let leftover = m & 0xffffffffn;

  if (leftover < excl) {
    const threshold = (BigInt(MASK_32) - range) % excl;
    while (leftover < threshold) {
      m = BigInt(bitGenerator.nextUint32()) * excl;
      leftover = m & 0xffffffffn;
    }
  }

  return m >> 32n;
}

/** Lemire's bounded random, over 64 bits: an integer in [0, range]. */
function boundedLemireUint64(bitGenerator: Pcg64, range: bigint): bigint {
  const excl = range + 1n;
  let m = bitGenerator.nextUint64() * excl;
  let leftover = m & MASK_64;

  if (leftover < excl) {
    const threshold = (MASK_64 - range) % excl;
    while (leftover < threshold) {
      m = bitGenerator.nextUint64() * excl;
      leftover = m & MASK_64;
    }
  }

  return m >> 64n;
}

/**
 * NumPy's `Generator`, holding the methods that this package needs.
 */
export class NumpyGenerator {
  readonly bitGenerator: Pcg64;

  constructor(seed: number | bigint | Pcg64) {
    this.bitGenerator = seed instanceof Pcg64 ? seed : new Pcg64(seed);
  }

  /**
   * A draw from the standard normal distribution, by the ziggurat algorithm
   * of `numpy.random.Generator.standard_normal`.
   */
  standardNormal(): number {
    const bitGenerator = this.bitGenerator;

    for (;;) {
      const r = bitGenerator.nextUint64();
      const idx = Number(r & 0xffn);
      const shifted = r >> 8n;
      const sign = shifted & 1n;
      const rabs = (shifted >> 1n) & 0x000fffffffffffffn;

      let x = Number(rabs) * WI_DOUBLE[idx]!;
      if (sign) x = -x;

      // The draw falls under the layer, which is the common case
      if (rabs < KI_DOUBLE[idx]!) return x;

      if (idx === 0) {
        // The tail, sampled by the Marsaglia rejection method
        for (;;) {
          // 1 - U rather than U, so that the logarithm never sees a zero
          const xx = -ZIGGURAT_NOR_INV_R * Math.log1p(-bitGenerator.nextDouble());
          const yy = -Math.log1p(-bitGenerator.nextDouble());
          if (yy + yy > xx * xx) {
            return (rabs >> 8n) & 1n
              ? -(ZIGGURAT_NOR_R + xx)
              : ZIGGURAT_NOR_R + xx;
          }
        }
      }

      // The wedge at the edge of the layer
      const edge =
        (FI_DOUBLE[idx - 1]! - FI_DOUBLE[idx]!) * bitGenerator.nextDouble() + FI_DOUBLE[idx]!;
      if (edge < Math.exp(-0.5 * x * x)) return x;
    }
  }

  /** `count` draws from the standard normal distribution. */
  standardNormalArray(count: number): number[] {
    const out = new Array<number>(count);
    for (let i = 0; i < count; i++) out[i] = this.standardNormal();
    return out;
  }

  /** `count` draws from the normal distribution of mean `loc` and s.d. `scale`. */
  normal(loc: number, scale: number, count: number): number[] {
    const out = new Array<number>(count);
    for (let i = 0; i < count; i++) out[i] = loc + scale * this.standardNormal();
    return out;
  }

  /** An integer in [low, high), as `numpy.random.Generator.integers`. */
  integers(low: number | bigint, high: number | bigint): bigint {
    const lowValue = BigInt(low);
    const range = BigInt(high) - lowValue - 1n;

    if (range < 0n) throw new Error("low must be less than high");
    if (range === 0n) return lowValue;
    if (range === MASK_64) return lowValue + this.bitGenerator.nextUint64();

    if (range <= BigInt(MASK_32)) {
      // NumPy falls back to the 32-bit generator when the range fits in it
      return lowValue + boundedLemireUint32(this.bitGenerator, range);
    }

    return lowValue + boundedLemireUint64(this.bitGenerator, range);
  }
}

/** A generator seeded as `numpy.random.default_rng(seed)` seeds one. */
export function numpyDefaultRng(seed: number | bigint): NumpyGenerator {
  return new NumpyGenerator(new Pcg64(new SeedSequence(seed)));
}
