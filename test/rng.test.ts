import { test, expect } from "bun:test";
import {
  MathRng,
  Pcg32Rng,
  nextInt,
  permutation,
  permutations,
  type Rng,
} from "../src/rng";

// [0, n-1] の順列かどうかチェックする小さいヘルパー
function isPermutation(arr: number[], n: number): boolean {
  if (arr.length !== n) return false;
  const seen = new Array<boolean>(n).fill(false);
  for (const v of arr) {
    if (v < 0 || v >= n) return false;
    if (seen[v]) return false;
    seen[v] = true;
  }
  return true;
}

test("MathRng.nextFloat returns a number within [0,1)", () => {
  const rng = new MathRng();

  for (let i = 0; i < 1000; i++) {
    const x = rng.nextFloat();
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
  }
});

test("Pcg32Rng() deterministically generates the same random number sequence", () => {
  const seed = 123456;
  const rng1 = new Pcg32Rng(seed);
  const rng2 = new Pcg32Rng(seed);

  const seq1: number[] = [];
  const seq2: number[] = [];

  for (let i = 0; i < 20; i++) {
    seq1.push(rng1.nextFloat());
    seq2.push(rng2.nextFloat());
  }

  expect(seq1).toEqual(seq2);
  expect(seq1[0]).toBeCloseTo(0.6176521475426853);
  expect(seq1[19]).toBeCloseTo(0.1871251417323947);
});

test("Different seeds will likely result in different sequences", () => {
  const rng1 = new Pcg32Rng(1);
  const rng2 = new Pcg32Rng(2);

  const seq1: number[] = [];
  const seq2: number[] = [];

  for (let i = 0; i < 20; i++) {
    seq1.push(rng1.nextFloat());
    seq2.push(rng2.nextFloat());
  }

  // True 「絶対違う」とまでは保証しないけど、ほぼ確実に違うはずなので
  expect(seq1).not.toEqual(seq2);
});

test("nextInt() returns an integer from [0, max)", () => {
  const rng: Rng = new Pcg32Rng(42);
  const max = 10;

  for (let i = 0; i < 1000; i++) {
    const x = nextInt(rng, max);
    expect(Number.isInteger(x)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(max);
  }
});

test("permutation() returns a permutation of [0, 1, ..., n-1] (Pcg32Rng version)", () => {
  const rng = new Pcg32Rng(123);
  const n = 20;

  const perm = permutation(rng, n);

  expect(isPermutation(perm, n)).toBe(true);
});

test("permutation() returns a permutation of [0, 1, ..., n-1] (MathRng version)", () => {
  const rng = new MathRng();
  const n = 20;

  const perm = permutation(rng, n);

  expect(isPermutation(perm, n)).toBe(true);
});

test("permutations draws the same sequence as repeated permutation calls", () => {
  const bulk = permutations(new Pcg32Rng(2468), 5, 7);

  const oneByOne = new Pcg32Rng(2468);
  expect(bulk).toEqual(Array.from({ length: 5 }, () => permutation(oneByOne, 7)));

  // A permutation of nothing consumes nothing
  const rng = new Pcg32Rng(1);
  expect(permutations(rng, 3, 1)).toEqual([[0], [0], [0]]);
  expect(rng.nextUint32()).toBe(new Pcg32Rng(1).nextUint32());
});

test("nextUint32Bulk draws the same sequence as repeated nextUint32 calls", () => {
  const bulk = new Pcg32Rng(99).nextUint32Bulk(4);

  const oneByOne = new Pcg32Rng(99);
  expect(bulk).toEqual(Array.from({ length: 4 }, () => oneByOne.nextUint32()));
  expect(new Pcg32Rng(99).nextUint32Bulk(0)).toEqual([]);
});
