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
