import { test, expect } from "bun:test";
import { stableMatch, Resident, Hospital } from "../src/index.js";

test("1人と1病院が素直にマッチする", () => {
  const residents: Resident[] = [
    { id: "r1", preferences: ["h1"] },
  ];

  const hospitals: Hospital[] = [
    { id: "h1", capacity: 1, preferences: ["r1"] },
  ];

  const result = stableMatch(residents, hospitals);

  expect(result.residents["r1"]).toBe("h1");
  expect(result.hospitals["h1"]).toEqual(["r1"]);
});
