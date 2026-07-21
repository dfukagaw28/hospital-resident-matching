import { test, expect } from "bun:test";
import { stableMatch, Resident, Hospital, MatchResult } from "../src/index.js";
import { Pcg32Rng, permutation } from "../src/rng";

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

test("複数の研修医が定員内に収まる病院にマッチする", () => {
  const residents: Resident[] = [
    { id: "r1", preferences: ["h1"] },
    { id: "r2", preferences: ["h1"] },
  ];

  const hospitals: Hospital[] = [
    { id: "h1", capacity: 2, preferences: ["r1", "r2"] },
  ];

  const result = stableMatch(residents, hospitals);

  expect(result.residents["r1"]).toBe("h1");
  expect(result.residents["r2"]).toBe("h1");
  expect(result.hospitals["h1"]).toEqual(["r1", "r2"]);
});

test("定員オーバー時、病院の希望順位が低い研修医が蹴り出される", () => {
  // h1 の希望順位: r1 > r2 > r3。定員は2人分しかない。
  const residents: Resident[] = [
    { id: "r1", preferences: ["h1"] },
    { id: "r2", preferences: ["h1"] },
    { id: "r3", preferences: ["h1"] },
  ];

  const hospitals: Hospital[] = [
    { id: "h1", capacity: 2, preferences: ["r1", "r2", "r3"] },
  ];

  const result = stableMatch(residents, hospitals);

  expect(result.residents["r1"]).toBe("h1");
  expect(result.residents["r2"]).toBe("h1");
  // r3 は h1 しか希望していないので、蹴り出された後は誰にもマッチしない
  expect(result.residents["r3"]).toBeUndefined();
  expect(result.hospitals["h1"]).toEqual(["r1", "r2"]);
});

test("第一希望に断られた研修医が第二希望にマッチする", () => {
  // h1 の定員は1人。h1 は r2 > r1 の順で好む。
  const residents: Resident[] = [
    { id: "r1", preferences: ["h1", "h2"] },
    { id: "r2", preferences: ["h1"] },
  ];

  const hospitals: Hospital[] = [
    { id: "h1", capacity: 1, preferences: ["r2", "r1"] },
    { id: "h2", capacity: 1, preferences: ["r1"] },
  ];

  const result = stableMatch(residents, hospitals);

  expect(result.residents["r1"]).toBe("h2");
  expect(result.residents["r2"]).toBe("h1");
  expect(result.hospitals["h1"]).toEqual(["r2"]);
  expect(result.hospitals["h2"]).toEqual(["r1"]);
});

test("希望リストが空の研修医は誰にもマッチしない", () => {
  const residents: Resident[] = [{ id: "r1", preferences: [] }];
  const hospitals: Hospital[] = [
    { id: "h1", capacity: 1, preferences: ["r1"] },
  ];

  const result = stableMatch(residents, hospitals);

  expect(result.residents["r1"]).toBeUndefined();
  expect(result.hospitals["h1"]).toEqual([]);
});

test("希望リストが空の病院は誰も受け入れない", () => {
  const residents: Resident[] = [{ id: "r1", preferences: ["h1"] }];
  const hospitals: Hospital[] = [
    { id: "h1", capacity: 1, preferences: [] },
  ];

  const result = stableMatch(residents, hospitals);

  expect(result.residents["r1"]).toBeUndefined();
  expect(result.hospitals["h1"]).toEqual([]);
});

test("研修医の希望リストに存在しない病院IDが含まれていても、次の希望に進める", () => {
  const residents: Resident[] = [
    { id: "r1", preferences: ["hX", "h1"] },
  ];
  const hospitals: Hospital[] = [
    { id: "h1", capacity: 1, preferences: ["r1"] },
  ];

  const result = stableMatch(residents, hospitals);

  expect(result.residents["r1"]).toBe("h1");
  expect(result.hospitals["h1"]).toEqual(["r1"]);
});

/**
 * ブロッキングペア(お互いに現在のマッチより相手を好む、未マッチのペア)が
 * 存在しないかどうかで、マッチングの安定性を検証する。
 */
function isStable(
  residents: Resident[],
  hospitals: Hospital[],
  result: MatchResult
): boolean {
  const hospitalById = new Map(hospitals.map((h) => [h.id, h]));
  const hospitalRankOf = new Map<string, Map<string, number>>();
  for (const h of hospitals) {
    const ranks = new Map<string, number>();
    h.preferences.forEach((rId, idx) => ranks.set(rId, idx));
    hospitalRankOf.set(h.id, ranks);
  }

  for (const r of residents) {
    const currentHospital = result.residents[r.id];
    const currentRank = currentHospital
      ? r.preferences.indexOf(currentHospital)
      : Infinity; // 未マッチなら、希望リストのどの病院でもマッチより好ましい

    for (let i = 0; i < currentRank && i < r.preferences.length; i++) {
      const hId = r.preferences[i];
      const h = hospitalById.get(hId);
      if (!h) continue; // 存在しない病院

      const ranks = hospitalRankOf.get(hId)!;
      const rRank = ranks.get(r.id);
      if (rRank === undefined) continue; // 病院側が研修医を希望していない

      const matched = result.hospitals[hId];
      if (matched.length < h.capacity) {
        return false; // 定員に空きがあり、かつ相互に希望 → ブロッキングペア
      }

      const worstMatchedRank = Math.max(
        ...matched.map((mId) => ranks.get(mId) ?? Infinity)
      );
      if (rRank < worstMatchedRank) {
        return false; // 現在の最下位マッチより研修医を好む → ブロッキングペア
      }
    }
  }

  return true;
}

function randomInstance(
  seed: number,
  numResidents: number,
  numHospitals: number
): { residents: Resident[]; hospitals: Hospital[] } {
  const rng = new Pcg32Rng(seed);

  const residents: Resident[] = Array.from({ length: numResidents }, (_, i) => ({
    id: `r${i}`,
    preferences: permutation(rng, numHospitals).map((h) => `h${h}`),
  }));

  const capacity = 1 + Math.floor((numResidents - 1) / numHospitals);
  const hospitals: Hospital[] = Array.from({ length: numHospitals }, (_, h) => ({
    id: `h${h}`,
    capacity,
    preferences: permutation(rng, numResidents).map((r) => `r${r}`),
  }));

  return { residents, hospitals };
}

test("stableMatch() はランダムなインスタンスに対して安定なマッチングを返す", () => {
  for (let seed = 0; seed < 50; seed++) {
    const { residents, hospitals } = randomInstance(seed, 20, 5);
    const result = stableMatch(residents, hospitals);

    expect(isStable(residents, hospitals, result)).toBe(true);
  }
});
