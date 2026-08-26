import { test, expect } from "bun:test";
import { HospitalResident } from "../src/hospitalResident";

// 0..n-1 の順列かどうかをチェック
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

// Convert a whitespace-separated multi-line string into a 2D number array
function parse2DNumberArray(text: string): number[][] {
    return text
        .trim()
        .split("\n")
        .map(line => line.trim().split(/\s+/).map(Number));
}

test("HospitalResident generates deterministic preferences and correct capacities", () => {
  const hr = HospitalResident.generate(12, 4, 12345678);

  expect(hr.numResidents).toBe(12);
  expect(hr.numHospitals).toBe(4);

  // resident preferences
  expect(hr.residentPrefs.length).toBe(12);
  for (const prefs of hr.residentPrefs) {
    expect(isPermutation(prefs, hr.numHospitals)).toBe(true);
  }
  const residentPrefsExpected = parse2DNumberArray(`
    2 3 1 0
    0 1 3 2
    3 1 2 0
    1 2 3 0
    2 0 1 3
    1 2 3 0
    0 3 2 1
    2 3 0 1
    2 1 0 3
    2 0 1 3
    1 2 0 3
    3 0 1 2
    `);
  expect(hr.residentPrefs).toEqual(residentPrefsExpected);

  // hospital preferences
  expect(hr.hospitalPrefs.length).toBe(4);
  for (const prefs of hr.hospitalPrefs) {
    expect(isPermutation(prefs, hr.numResidents)).toBe(true);
  }
  const hospitalPrefsExpected = parse2DNumberArray(`
    2 6 0 5 10 9 7 8 11 4 3 1
    2 11 10 9 7 1 0 5 3 4 8 6
    3 10 9 2 6 0 4 11 1 7 5 8
    1 0 5 9 7 2 11 8 6 4 10 3
    `);
  expect(hr.hospitalPrefs).toEqual(hospitalPrefsExpected);

  // capacities
  expect(hr.capacities).toEqual([3, 3, 3, 3]);
});

test("Should correctly solve the hospital-resident matching", () => {
  const hr = HospitalResident.generate(12, 4, 12345678);
  const [mResidents, mHospitals] = hr.solve();

  expect(mResidents).toEqual([2, 0, 3, 1, 2, 1, 0, 3, 0, 2, 1, 3]);
  expect(mHospitals).toEqual([
    [6, 8, 1],
    [10, 5, 3],
    [9, 0, 4],
    [7, 2, 11],
  ]);
});

// The expected values below come from the Python version
// (dfukagaw28/simple_matching_python), which this package matches seed for seed.

test("setCapacities accepts a uniform capacity and a per-hospital one", () => {
  const hr = HospitalResident.generate(50, 7, 7);

  hr.setCapacities(3);
  expect(hr.capacities).toEqual([3, 3, 3, 3, 3, 3, 3]);

  hr.setCapacities([1, 2, 3, 4, 5, 6, 7]);
  expect(hr.capacities).toEqual([1, 2, 3, 4, 5, 6, 7]);

  expect(() => hr.setCapacities([1, 2, 3])).toThrow();
  expect(() => hr.setCapacities(3, true)).toThrow();
});

test("tight capacities seat exactly the residents, the popular hospitals first", () => {
  const spread = HospitalResident.generate(31, 6, 5);
  spread.setCapacities(-1, true);
  expect(spread.capacities).toEqual([6, 5, 5, 5, 5, 5]);

  const larger = HospitalResident.generate(100, 7, 42);
  larger.setCapacities(-1, true);
  expect(larger.capacities).toEqual([15, 14, 14, 15, 14, 14, 14]);

  // An even split leaves no spare seat to hand out
  const even = HospitalResident.generate(12, 4, 12345678);
  even.setCapacities(-1, true);
  expect(even.capacities).toEqual([3, 3, 3, 3]);

  for (const hr of [spread, larger, even]) {
    expect(hr.capacities.reduce((sum, c) => sum + c, 0)).toBe(hr.numResidents);
  }
});

test("cutResidentPrefences keeps the top k hospitals and drops the rest", () => {
  const hr = HospitalResident.generate(12, 4, 12345678);
  const full = hr.residentPrefs.map((prefs) => [...prefs]);

  hr.cutResidentPrefences(2);

  expect(hr.tieLast).toBe(false);
  expect(hr.residentPrefsRest).toBeNull();
  expect(hr.residentPrefs).toEqual(full.map((prefs) => prefs.slice(0, 2)));
  expect(hr.residentPrefsCompleted()).toBe(hr.residentPrefs);

  // A resident every listed hospital rejects is left unmatched
  const [mResidents] = hr.solve();
  for (const [r, h] of mResidents.entries()) {
    if (h >= 0) expect(hr.residentPrefs[r]).toContain(h);
  }
});

test("cutResidentPrefences with tieLast ties the removed hospitals at the last rank", () => {
  const hr = HospitalResident.generate(12, 4, 12345678);
  hr.cutResidentPrefences(2, { tieLast: true });

  expect(hr.tieLast).toBe(true);
  expect(hr.residentPrefs).toEqual([
    [2, 3], [0, 1], [3, 1], [1, 2], [2, 0], [1, 2],
    [0, 3], [2, 3], [2, 1], [2, 0], [1, 2], [3, 0],
  ]);
  expect(hr.residentPrefsRest).toEqual([
    [1, 0], [3, 2], [2, 0], [0, 3], [1, 3], [3, 0],
    [2, 1], [0, 1], [3, 0], [1, 3], [0, 3], [2, 1],
  ]);

  const [mResidents] = hr.solve();
  expect(mResidents).toEqual([2, 0, 3, 1, 2, 1, 0, 3, 0, 2, 1, 3]);
  expect(hr.countUnlistedMatches(mResidents)).toBe(1);

  // Every hospital out of a list follows every hospital on it
  for (let r = 0; r < hr.numResidents; r++) {
    expect(hr.residentPrefsCompleted()[r]).toEqual([
      ...hr.residentPrefs[r]!,
      ...hr.residentPrefsRest![r]!,
    ]);
  }
});

test("tieBreak 'keep' leaves the removed hospitals in the order they had", () => {
  const full = HospitalResident.generate(12, 4, 12345678);
  const tails = full.residentPrefs.map((prefs) => prefs.slice(2));

  const hr = HospitalResident.generate(12, 4, 12345678);
  hr.cutResidentPrefences(2, { tieLast: true, tieBreak: "keep" });

  expect(hr.residentPrefsRest).toEqual(tails);

  // The algorithm then behaves as if the lists were never cut
  expect(hr.solve()).toEqual(full.solve());
});

test("tieLast leaves exactly the residents the seats cannot hold unmatched", () => {
  const hr = HospitalResident.generate(100, 7, 4242);
  hr.setCapacities(12); // 84 seats for 100 residents
  hr.cutResidentPrefences(2, { tieLast: true });

  const [mResidents] = hr.solve();
  expect(mResidents.filter((h) => h === -1).length).toBe(100 - 84);
});

test("setTieLast completes the lists of an instance that is already incomplete", () => {
  const hr = HospitalResident.generate(12, 4, 12345678);
  hr.cutResidentPrefences(2);
  hr.setTieLast(true, "keep");

  // 'keep' means the ascending order of the hospital numbers here
  for (let r = 0; r < hr.numResidents; r++) {
    const rest = hr.residentPrefsRest![r]!;
    expect([...rest].sort((a, b) => a - b)).toEqual(rest);
    expect(new Set([...hr.residentPrefs[r]!, ...rest])).toEqual(new Set([0, 1, 2, 3]));
  }

  hr.setTieLast(false);
  expect(hr.tieLast).toBe(false);
  expect(hr.residentPrefsRest).toBeNull();
});

test("a seeded tie break does not depend on the instance's own generator", () => {
  const first = HospitalResident.generate(12, 4, 12345678);
  first.cutResidentPrefences(2, { tieLast: true, seed: 777 });

  const second = HospitalResident.generate(12, 4, 12345678);
  second.setCapacities(1); // consumes nothing, but the instance is used further
  second.cutResidentPrefences(2, { tieLast: true, seed: 777 });

  expect(second.residentPrefsRest).toEqual(first.residentPrefsRest);
});

test("an instance survives a round trip through the file format", () => {
  const hr = HospitalResident.generate(8, 3, 99);

  const text = hr.toText("20260101000000");
  expect(text).toBe(
    "# 20260101000000\n# seed: 99\n" +
      "HR 8 3\n0 2 1\n0 2 1\n2 0 1\n0 2 1\n2 0 1\n1 0 2\n0 2 1\n2 0 1\n" +
      "3 4 7 1 6 5 0 2\n4 5 1 2 0 3 7 6\n7 2 3 6 0 1 5 4\n"
  );

  const loaded = HospitalResident.fromText(text);
  expect(loaded.numResidents).toBe(8);
  expect(loaded.numHospitals).toBe(3);
  expect(loaded.residentPrefs).toEqual(hr.residentPrefs);
  expect(loaded.hospitalPrefs).toEqual(hr.hospitalPrefs);
  expect(loaded.capacities).toEqual(hr.capacities);
  expect(loaded.solve()).toEqual(hr.solve());

  // Comments and blank lines are skipped
  expect(HospitalResident.fromText(`\n# a comment\n${text}`).solve()).toEqual(hr.solve());
  expect(() => HospitalResident.fromText("nonsense\n")).toThrow();
});

test("toDicts lays the instance out as the `matching` package wants it", () => {
  const hr = HospitalResident.generate(8, 3, 99);
  const [residents, hospitals, capacities] = hr.toDicts();

  expect(residents[0]).toEqual(hr.residentPrefs[0]!);
  expect(hospitals[2]).toEqual(hr.hospitalPrefs[2]!);
  expect(capacities).toEqual({ 0: 3, 1: 3, 2: 3 });
});
