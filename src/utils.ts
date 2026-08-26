/** Utilities on top of the HR instances, kept out of the instance itself. */

import type { HospitalResident } from "./hospitalResident.js";

/**
 * A sorting key: a number, or a tuple of keys compared element by element
 * (the shorter one first when one is a prefix of the other), as Python
 * compares its tuples.
 */
export type SortKey = number | readonly SortKey[];

/** Compare two keys, as Python compares its numbers and tuples. */
export function compareKeys(a: SortKey, b: SortKey): number {
  if (typeof a === "number" && typeof b === "number") {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  const xs = a as readonly SortKey[];
  const ys = b as readonly SortKey[];
  const shared = Math.min(xs.length, ys.length);
  for (let i = 0; i < shared; i++) {
    const order = compareKeys(xs[i]!, ys[i]!);
    if (order !== 0) return order;
  }
  return xs.length - ys.length;
}

/**
 * Key that orders the items by how popular they are in the lists.
 *
 * An item is the more popular the more often it is ranked first, then the
 * more often it is ranked second, and so on.  The keys are negated counts,
 * so that sorting the items by their key puts the most popular one first.
 */
export function popularityKeys(prefs: number[][], numItems: number): SortKey[] {
  let depth = 0;
  for (const pref of prefs) depth = Math.max(depth, pref.length);

  const counts = Array.from({ length: numItems }, () => new Array<number>(depth).fill(0));
  for (const pref of prefs) {
    for (let position = 0; position < pref.length; position++) {
      counts[pref[position]!]![position] += 1;
    }
  }

  // `count === 0 ? 0 : -count` rather than `-count`, to avoid a negative zero
  return counts.map((itemCounts) => itemCounts.map((count) => (count === 0 ? 0 : -count)));
}

/**
 * Number the items so that the items with an equal key share a number.
 *
 * The numbers follow the order of the keys, i.e. the items holding the
 * smallest key are the class 0.
 */
export function classes(keys: readonly SortKey[]): number[] {
  const order = keys.map((_, i) => i);
  order.sort((i, j) => compareKeys(keys[i]!, keys[j]!) || i - j);

  const result = new Array<number>(keys.length);
  let current = -1;
  for (let k = 0; k < order.length; k++) {
    if (k === 0 || compareKeys(keys[order[k - 1]!]!, keys[order[k]!]!) !== 0) current++;
    result[order[k]!] = current;
  }
  return result;
}

/**
 * Order the residents and the hospitals, the most popular ones first.
 *
 * Popularity (see `popularityKeys`) comes first.  The items that are equally
 * popular are told apart by the lists they hold themselves: an item comes
 * first if the items on its list are the more popular ones.  That refinement
 * is repeated as long as it tells more items apart, so that the order depends
 * on the instance only and not on the numbers the residents and the hospitals
 * happen to have.  Items that stay tied (which needs them to be
 * interchangeable) keep the order of their current numbers.
 */
export function canonicalOrders(
  residentPrefs: number[][],
  hospitalPrefs: number[][],
  numResidents: number,
  numHospitals: number
): [number[], number[]] {
  let residentKeys: SortKey[] = popularityKeys(hospitalPrefs, numResidents);
  let hospitalKeys: SortKey[] = popularityKeys(residentPrefs, numHospitals);

  for (;;) {
    const residentClasses = classes(residentKeys);
    const hospitalClasses = classes(hospitalKeys);

    const refinedResidents: SortKey[] = Array.from({ length: numResidents }, (_, r) => [
      residentKeys[r]!,
      residentPrefs[r]!.map((h) => hospitalClasses[h]!),
    ]);
    const refinedHospitals: SortKey[] = Array.from({ length: numHospitals }, (_, h) => [
      hospitalKeys[h]!,
      hospitalPrefs[h]!.map((r) => residentClasses[r]!),
    ]);

    const sameResidents = arrayEquals(classes(refinedResidents), residentClasses);
    const sameHospitals = arrayEquals(classes(refinedHospitals), hospitalClasses);
    if (sameResidents && sameHospitals) break;

    residentKeys = refinedResidents;
    hospitalKeys = refinedHospitals;
  }

  const byKey = (keys: SortKey[]) => (i: number, j: number) =>
    compareKeys(keys[i]!, keys[j]!) || i - j;

  return [
    Array.from({ length: numResidents }, (_, r) => r).sort(byKey(residentKeys)),
    Array.from({ length: numHospitals }, (_, h) => h).sort(byKey(hospitalKeys)),
  ];
}

function arrayEquals(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Renumber the residents and the hospitals of an instance by popularity.
 *
 * The hospital that the residents rank first most often becomes the hospital
 * 0, and the resident that the hospitals rank first most often becomes the
 * resident 0; ties are broken by the number of the second choices, then of
 * the third ones, and so on.  The residents (hospitals) that are still tied
 * are told apart by the lists they hold themselves, the one whose hospitals
 * (residents) are the more popular coming first (see `canonicalOrders`).  The
 * preference lists that the popularity is counted in are the completed ones,
 * i.e. the hospitals tied at the last rank are counted as well (see
 * `residentPrefsCompleted`).
 *
 * The instance is renumbered in place, into one that is isomorphic to it:
 * solving it gives the same matching, up to the renumbering.  The two orders
 * are returned, resident first, each holding the old numbers in their new
 * order (i.e. `residentOrder[i]` is the resident that becomes the resident
 * `i`).
 */
export function normalize(instance: HospitalResident): [number[], number[]] {
  const [residentOrder, hospitalOrder] = canonicalOrders(
    instance.residentPrefsCompleted(),
    instance.hospitalPrefs,
    instance.numResidents,
    instance.numHospitals
  );

  // Number that each resident and each hospital is renumbered to
  const newResident = inverse(residentOrder);
  const newHospital = inverse(hospitalOrder);

  instance.residentPrefs = residentOrder.map((r) =>
    instance.residentPrefs[r]!.map((h) => newHospital[h]!)
  );
  if (instance.tieLast) {
    instance.residentPrefsRest = residentOrder.map((r) =>
      instance.residentPrefsRest![r]!.map((h) => newHospital[h]!)
    );
  }
  instance.hospitalPrefs = hospitalOrder.map((h) =>
    instance.hospitalPrefs[h]!.map((r) => newResident[r]!)
  );
  instance.capacities = hospitalOrder.map((h) => instance.capacities[h]!);

  return [residentOrder, hospitalOrder];
}

/** The inverse of a permutation. */
function inverse(order: number[]): number[] {
  const result = new Array<number>(order.length);
  order.forEach((item, position) => {
    result[item] = position;
  });
  return result;
}
