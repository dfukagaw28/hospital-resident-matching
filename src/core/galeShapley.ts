import type { Resident, Hospital, MatchResult } from "./types.js";

export function stableMatch(
  residents: Resident[],
  hospitals: Hospital[]
): MatchResult {
  const residentMatch: Record<string, string | undefined> = {};
  const hospitalMatch: Record<string, string[]> = {};

  for (const r of residents) {
    residentMatch[r.id] = undefined;
  }
  for (const h of hospitals) {
    hospitalMatch[h.id] = [];
  }

  // Rank of each resident within each hospital's preference list
  const hospitalRanks = new Map<string, Map<string, number>>();
  for (const h of hospitals) {
    const ranks = new Map<string, number>();
    h.preferences.forEach((rId, idx) => ranks.set(rId, idx));
    hospitalRanks.set(h.id, ranks);
  }

  const residentById = new Map(residents.map((r) => [r.id, r]));
  const hospitalById = new Map(hospitals.map((h) => [h.id, h]));

  // Head index (next preference to try) for each resident
  const residentHead: Record<string, number> = {};
  for (const r of residents) {
    residentHead[r.id] = 0;
  }

  // free_residents queue (qHead is an O(1) alternative to deque.popleft())
  const freeResidents: string[] = residents.map((r) => r.id);
  let qHead = 0;

  while (qHead < freeResidents.length) {
    // Pick a free resident r
    const rId = freeResidents[qHead++];
    const resident = residentById.get(rId)!;

    // Pick the best hospital the resident hasn't tried yet
    if (residentHead[rId] >= resident.preferences.length) continue;
    const hId = resident.preferences[residentHead[rId]];
    residentHead[rId] += 1;

    const ranks = hospitalRanks.get(hId);
    if (!ranks || !ranks.has(rId)) {
      // The hospital doesn't exist, or doesn't consider this resident
      // acceptable; the resident moves on to their next preference.
      freeResidents.push(rId);
      continue;
    }

    // Match the resident to the hospital
    residentMatch[rId] = hId;
    insertByHospitalPreference(hospitalMatch[hId], ranks, rId);

    // If the applicants exceed the capacity, remove the worst
    const hospital = hospitalById.get(hId)!;
    if (hospitalMatch[hId].length > hospital.capacity) {
      const rWorst = hospitalMatch[hId].pop()!;
      residentMatch[rWorst] = undefined;
      freeResidents.push(rWorst);
    }
  }

  return {
    residents: residentMatch,
    hospitals: hospitalMatch,
  };
}

/**
 * Inserts a resident into the list in order of the hospital's preference
 * (i.e., smaller rank values are preferred).
 * The list is maintained so that the last element is the worst-ranked resident.
 */
function insertByHospitalPreference(
  list: string[],
  rank: Map<string, number>,
  resident: string
): void {
  const rRank = rank.get(resident)!;
  let i = 0;
  while (i < list.length && rank.get(list[i])! <= rRank) i++;
  list.splice(i, 0, resident);
}
