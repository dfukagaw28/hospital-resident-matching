import { test, expect } from "bun:test";
import { NumpyGenerator, Pcg64, SeedSequence, numpyDefaultRng } from "../src/numpy/random";

// The expected values come from NumPy itself, e.g.
//   np.random.default_rng(12345).normal(0, 1, 5)
// The whole point of this module is to reproduce them bit for bit.

test("Pcg64 reproduces the raw stream of numpy's default_rng", () => {
  const bitGenerator = new Pcg64(12345);
  const raw = Array.from({ length: 4 }, () => bitGenerator.nextUint64());

  expect(raw).toEqual([
    4193609425186963869n,
    5843160025838961886n,
    14708796524633321433n,
    12474696839993944336n,
  ]);
});

test("standardNormal reproduces numpy's normal draws exactly", () => {
  const rng = numpyDefaultRng(12345);

  expect(rng.normal(0, 1, 5)).toEqual([
    -1.4238250364546312, 1.2637284581291104, -0.8706617379590857, -0.2591732349343976,
    -0.07534330701052097,
  ]);
});

test("integers reproduces numpy's draws, in both the 32-bit and 64-bit paths", () => {
  const small = numpyDefaultRng(12345);
  expect([small.integers(0, 1 << 30), small.integers(0, 1 << 30), small.integers(0, 1 << 30)]).toEqual(
    [750776423n, 244100195n, 846803255n]
  );

  const large = numpyDefaultRng(12345);
  const bound = 1n << 63n;
  expect([large.integers(0, bound), large.integers(0, bound), large.integers(0, bound)]).toEqual([
    2096804712593481934n,
    2921580012919480943n,
    7354398262316660716n,
  ]);
});

test("a seed of more than 64 bits is mixed as numpy mixes it", () => {
  // np.random.default_rng(2**64 + 12345).bit_generator.random_raw(2)
  const bitGenerator = new Pcg64(2n ** 64n + 12345n);

  expect([bitGenerator.nextUint64(), bitGenerator.nextUint64()]).toEqual([
    18074240003388273633n,
    4293371258585790894n,
  ]);
});

test("SeedSequence spreads the entropy over the whole pool", () => {
  const words = new SeedSequence(0).generateState(8);

  expect(words).toHaveLength(8);
  expect(new Set(words).size).toBe(8);
  for (const word of words) expect(word).toBeGreaterThanOrEqual(0);
});

test("integers rejects an empty range", () => {
  const rng = new NumpyGenerator(1);
  expect(() => rng.integers(5, 5)).toThrow();
});
