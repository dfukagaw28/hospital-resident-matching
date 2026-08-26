import { test, expect } from "bun:test";
import { generateBiasedHR, generateCorrelatedPreferences } from "../src/biased";
import { numpyDefaultRng } from "../src/numpy/random";

// The expected values come from the Python version, which draws the same
// instance from the same seed (see src/numpy/random.ts).

test("generateBiasedHR reproduces the instance the Python version generates", () => {
  const hr = generateBiasedHR(20, 4, {
    alphaResident: 0.5,
    alphaHospital: 0.5,
    listLength: 3,
    seed: 12345,
  });

  expect(hr.residentPrefs).toEqual([
    [1, 3, 0], [2, 3, 1], [1, 3, 2], [3, 1, 2], [1, 2, 0],
    [1, 3, 0], [1, 3, 0], [3, 1, 2], [1, 3, 0], [1, 2, 3],
    [3, 1, 2], [1, 3, 2], [1, 2, 0], [1, 2, 0], [1, 3, 2],
    [1, 2, 3], [1, 0, 3], [1, 3, 0], [1, 0, 3], [1, 3, 0],
  ]);
  expect(hr.hospitalPrefs[0]).toEqual([
    7, 3, 9, 6, 19, 12, 18, 4, 8, 11, 10, 5, 13, 15, 0, 14, 16, 2, 1, 17,
  ]);
  expect(hr.capacities).toEqual([5, 5, 5, 5]);
  expect(hr.solve()[0]).toEqual([
    0, 2, 2, 3, 2, 3, 0, 3, 1, 1, 3, 3, 2, 2, 1, 1, 0, 0, 0, 1,
  ]);
});

test("the hospitals rank every resident, the residents only listLength hospitals", () => {
  const hr = generateBiasedHR(50, 6, { listLength: 4, seed: 7 });

  for (const prefs of hr.residentPrefs) expect(prefs).toHaveLength(4);
  for (const prefs of hr.hospitalPrefs) {
    expect(new Set(prefs).size).toBe(50);
  }

  // A null length asks for the full lists
  const full = generateBiasedHR(50, 6, { listLength: null, seed: 7 });
  for (const prefs of full.residentPrefs) expect(new Set(prefs).size).toBe(6);
});

test("alpha 1 makes every chooser rank the items the same way", () => {
  const prefs = generateCorrelatedPreferences(30, 8, 1, undefined, numpyDefaultRng(3));

  for (const pref of prefs) expect(pref).toEqual(prefs[0]!);
});

test("alpha 0 leaves the lists as unrelated as chance allows", () => {
  const prefs = generateCorrelatedPreferences(200, 8, 0, undefined, numpyDefaultRng(3));

  // Each item is ranked first by roughly an eighth of the choosers
  const firstChoices = new Array<number>(8).fill(0);
  for (const pref of prefs) firstChoices[pref[0]!] += 1;
  for (const count of firstChoices) expect(count).toBeGreaterThan(200 / 8 / 3);

  expect(() => generateCorrelatedPreferences(2, 2, 1.5)).toThrow();
});

test("the more the residents agree, the more of them miss out", () => {
  const unmatched = (alphaResident: number) => {
    const hr = generateBiasedHR(300, 24, { alphaResident, listLength: 8, seed: 20260826 });
    hr.setCapacities(13);
    const [mResidents] = hr.solve();
    return mResidents.filter((h) => h === -1).length;
  };

  expect(unmatched(0)).toBeLessThan(unmatched(0.5));
  expect(unmatched(0.5)).toBeLessThan(unmatched(0.9));
});

test("tieLast gives the instance a random order for the hospitals left out", () => {
  const hr = generateBiasedHR(40, 5, { listLength: 2, tieLast: true, seed: 12345 });

  expect(hr.tieLast).toBe(true);
  for (let r = 0; r < hr.numResidents; r++) {
    const listed = hr.residentPrefs[r]!;
    const rest = hr.residentPrefsRest![r]!;
    expect(rest).toHaveLength(3);
    expect(new Set([...listed, ...rest])).toEqual(new Set([0, 1, 2, 3, 4]));
  }

  // Every resident is matched, since the seats outnumber them
  const [mResidents] = hr.solve();
  expect(mResidents.every((h) => h >= 0)).toBe(true);
});
