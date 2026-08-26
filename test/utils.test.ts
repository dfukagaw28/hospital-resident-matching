import { test, expect } from "bun:test";
import { HospitalResident } from "../src/hospitalResident";
import { classes, compareKeys, normalize, popularityKeys } from "../src/utils";

test("compareKeys orders numbers and tuples as Python does", () => {
  expect(compareKeys(1, 2)).toBeLessThan(0);
  expect(compareKeys([1, 2], [1, 3])).toBeLessThan(0);
  expect(compareKeys([1, 2], [1, 2])).toBe(0);

  // A tuple that is a prefix of another comes first
  expect(compareKeys([1], [1, 0])).toBeLessThan(0);

  // Nested tuples are compared element by element too
  expect(compareKeys([[0, 1], 5], [[0, 1], 4])).toBeGreaterThan(0);
});

test("popularityKeys counts the first choices, then the second ones", () => {
  // Hospital 0 is ranked first twice, hospital 1 once; hospital 2 never
  const keys = popularityKeys([[0, 1], [0, 2], [1, 0]], 3);

  expect(keys).toEqual([
    [-2, -1],
    [-1, -1],
    [0, -1],
  ]);
  expect(classes(keys)).toEqual([0, 1, 2]);
});

test("classes give the items with an equal key an equal number", () => {
  expect(classes([[5], [1], [5], [3]])).toEqual([2, 0, 2, 1]);
});

test("normalize renumbers an instance by popularity", () => {
  const hr = HospitalResident.generate(12, 4, 12345678);
  const [residentOrder, hospitalOrder] = normalize(hr);

  expect(residentOrder).toEqual([2, 1, 3, 10, 0, 6, 11, 9, 5, 7, 4, 8]);
  expect(hospitalOrder).toEqual([2, 1, 0, 3]);

  expect(hr.residentPrefs).toEqual([
    [3, 1, 0, 2], [2, 1, 3, 0], [1, 0, 3, 2], [1, 0, 2, 3],
    [0, 3, 1, 2], [2, 3, 0, 1], [3, 2, 1, 0], [0, 2, 1, 3],
    [1, 0, 3, 2], [0, 3, 2, 1], [0, 2, 1, 3], [0, 1, 2, 3],
  ]);
  expect(hr.hospitalPrefs[0]).toEqual([2, 3, 7, 0, 5, 4, 10, 6, 1, 9, 8, 11]);
  expect(hr.solve()[0]).toEqual([3, 2, 1, 1, 0, 2, 3, 0, 1, 3, 0, 2]);
});

test("normalize only renumbers: the matching is the same one", () => {
  for (const [n, m, seed] of [[12, 4, 12345678], [60, 8, 42], [37, 7, 0]] as const) {
    const original = HospitalResident.generate(n, m, seed);
    const [mBefore] = original.solve();

    const renumbered = HospitalResident.generate(n, m, seed);
    const [residentOrder, hospitalOrder] = normalize(renumbered);
    const [mAfter] = renumbered.solve();

    const newResident = invert(residentOrder);
    const newHospital = invert(hospitalOrder);

    for (let r = 0; r < n; r++) {
      const before = mBefore[r]!;
      expect(mAfter[newResident[r]!]).toBe(before < 0 ? -1 : newHospital[before]!);
    }
  }
});

test("normalize takes the hospitals tied at the last rank along", () => {
  const hr = HospitalResident.generate(24, 5, 3);
  hr.cutResidentPrefences(2, { tieLast: true, seed: 11 });

  const [mBefore] = hr.solve();
  const unlistedBefore = hr.countUnlistedMatches(mBefore);

  const [residentOrder, hospitalOrder] = normalize(hr);
  expect(hr.residentPrefsRest).toHaveLength(24);
  for (const rest of hr.residentPrefsRest!) expect(rest).toHaveLength(3);

  const [mAfter] = hr.solve();
  expect(hr.countUnlistedMatches(mAfter)).toBe(unlistedBefore);

  const newResident = invert(residentOrder);
  const newHospital = invert(hospitalOrder);
  for (let r = 0; r < 24; r++) {
    const before = mBefore[r]!;
    expect(mAfter[newResident[r]!]).toBe(before < 0 ? -1 : newHospital[before]!);
  }
});

function invert(order: number[]): number[] {
  const result = new Array<number>(order.length);
  order.forEach((item, position) => {
    result[item] = position;
  });
  return result;
}
