import type { Resident, Hospital, MatchResult } from "./types";

export function stableMatch(
  residents: Resident[],
  hospitals: Hospital[]
): MatchResult {
  // 最初は「全員どこにもマッチしない」でもいい
  const residentMatch: Record<string, string | undefined> = {};
  const hospitalMatch: Record<string, string[]> = {};

  for (const r of residents) {
    residentMatch[r.id] = undefined;
  }
  for (const h of hospitals) {
    hospitalMatch[h.id] = [];
  }

  return {
    residents: residentMatch,
    hospitals: hospitalMatch,
  };
}
