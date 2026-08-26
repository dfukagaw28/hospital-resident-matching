import { Pcg32Rng, permutations } from "./rng.js";

/** How the hospitals tied at the last rank are put in an order. */
export type TieBreak = "random" | "keep";

export interface CutOptions {
  /** Treat the removed hospitals as acceptable and tied at the last rank. */
  tieLast?: boolean;
  /** How to break that tie (see `TieBreak`). */
  tieBreak?: TieBreak;
  /** Seed of the shuffle; the generator of the instance is used without it. */
  seed?: number | bigint;
}

export class HospitalResident {
  numResidents!: number;
  numHospitals!: number;
  residentPrefs!: number[][];
  hospitalPrefs!: number[][];
  capacities!: number[];
  seed?: number | bigint;

  /**
   * Whether the hospitals out of a resident's preference list are acceptable
   * (and tied at the last rank) or not.
   */
  tieLast = false;

  /**
   * Tie-broken order of the hospitals out of the preference list, for each
   * resident (used only when `tieLast` is true).
   */
  residentPrefsRest: number[][] | null = null;

  /** Generator of the instance, kept so that later draws do not overlap. */
  rng?: Pcg32Rng;

  // Randomly initialize the instance
  initRandom(numResidents: number, numHospitals: number, seed?: number | bigint): void {
    // Parameters
    this.numResidents = numResidents;
    this.numHospitals = numHospitals;

    // Initialize random number generator
    if (seed === undefined) {
      seed = Math.floor(Math.random() * (1 << 30));
    }
    this.seed = seed;
    const rng = new Pcg32Rng(seed);

    // Generate preference list (resident -> hospital)
    this.residentPrefs = permutations(rng, numResidents, numHospitals);

    // Generate preference list (hospital -> resident)
    this.hospitalPrefs = permutations(rng, numHospitals, numResidents);

    // Keep the generator so that the random numbers consumed later
    // (e.g. by cutResidentPrefences) do not overlap with the ones
    // already used for the preference lists
    this.rng = rng;

    // Set capacities for each hospital
    this.setCapacities();
  }

  /**
   * Set the capacities for each hospital.
   *
   * Pass a single number to give every hospital the same capacity (a negative
   * value falls back to the default, evenly-divided capacity), or an array of
   * length `numHospitals` to give each hospital its own capacity.
   */
  setCapacities(capacities: number | number[] = -1): void {
    if (Array.isArray(capacities)) {
      if (capacities.length !== this.numHospitals) {
        throw new Error(
          `Expected ${this.numHospitals} capacities, got ${capacities.length}`
        );
      }
      this.capacities = [...capacities];
      return;
    }

    if (capacities < 0) {
      capacities = 1 + Math.floor((this.numResidents - 1) / this.numHospitals);
    }
    this.capacities = new Array<number>(this.numHospitals).fill(capacities);
  }

  /**
   * Extract the top `k` preferences for each resident.
   *
   * By default the hospitals removed from a list are unacceptable: a resident
   * rejected by all the k hospitals is left unmatched.
   *
   * With `tieLast: true` the removed hospitals are, instead, acceptable and
   * tied at the last rank.  A tie has to be broken to run the
   * (resident-oriented) Gale-Shapley algorithm; `tieBreak` chooses how:
   *   'random': shuffle the removed hospitals at random (default)
   *   'keep':   keep the order they have in the current list, i.e. the
   *             resident-oriented Gale-Shapley algorithm behaves exactly as if
   *             the preference lists were not cut at all
   * `seed` seeds the shuffle; without it the generator of the instance is used
   * (or a random one, for a loaded instance).
   */
  cutResidentPrefences(k: number, options: CutOptions = {}): void {
    const { tieLast = false, tieBreak = "random", seed } = options;

    const rests = this.residentPrefs.map((prefs) => prefs.slice(k));
    this.residentPrefs = this.residentPrefs.map((prefs) => prefs.slice(0, k));

    if (tieLast) {
      this.setPrefsRest(rests, tieBreak, seed);
    } else {
      this.tieLast = false;
      this.residentPrefsRest = null;
    }
  }

  /**
   * Treat every hospital out of a resident's preference list as acceptable and
   * tied at the last rank.
   *
   * This is the counterpart of `cutResidentPrefences(k, { tieLast: true })` for
   * an instance whose preference lists are already incomplete (e.g. loaded from
   * a file).  See `cutResidentPrefences` for `tieBreak` and `seed`; here 'keep'
   * means the ascending order of the hospital numbers.
   */
  setTieLast(tieLast = true, tieBreak: TieBreak = "random", seed?: number | bigint): void {
    if (!tieLast) {
      this.tieLast = false;
      this.residentPrefsRest = null;
      return;
    }

    const rests = this.residentPrefs.map((prefs) => {
      const listed = new Set(prefs);
      const rest: number[] = [];
      for (let h = 0; h < this.numHospitals; h++) {
        if (!listed.has(h)) rest.push(h);
      }
      return rest;
    });

    this.setPrefsRest(rests, tieBreak, seed);
  }

  /** Store the tie-broken order of the hospitals out of the lists. */
  private setPrefsRest(
    rests: number[][],
    tieBreak: TieBreak,
    seed: number | bigint | undefined
  ): void {
    if (tieBreak !== "random" && tieBreak !== "keep") {
      throw new Error(`Unknown tieBreak: ${tieBreak}`);
    }

    this.residentPrefsRest = tieBreak === "random" ? this.shuffleLists(rests, seed) : rests;
    this.tieLast = true;
  }

  /** Shuffle each list at random (lists of the same length at once). */
  private shuffleLists(lists: number[][], seed: number | bigint | undefined): number[][] {
    const rng = this.getRng(seed);

    // Group the lists by their lengths, since `permutations` generates
    // permutations of a single length at a time
    const groups = new Map<number, number[]>();
    lists.forEach((items, i) => {
      const group = groups.get(items.length);
      if (group) group.push(i);
      else groups.set(items.length, [i]);
    });

    const shuffled = new Array<number[]>(lists.length);
    for (const n of [...groups.keys()].sort((a, b) => a - b)) {
      const indices = groups.get(n)!;
      const perms = permutations(rng, indices.length, n);
      indices.forEach((i, k) => {
        shuffled[i] = perms[k]!.map((j) => lists[i]![j]!);
      });
    }

    return shuffled;
  }

  /**
   * Get a random number generator.
   *
   * A seed, if given, makes a new generator.  Otherwise the generator of the
   * instance is reused (and made, at random, if it does not exist).
   */
  private getRng(seed?: number | bigint): Pcg32Rng {
    if (seed !== undefined) return new Pcg32Rng(seed);

    if (this.rng === undefined) {
      this.rng = new Pcg32Rng(Math.floor(Math.random() * (1 << 30)));
    }
    return this.rng;
  }

  /**
   * Preference list (resident -> hospital) that the algorithm follows.
   *
   * It is the preference list itself unless the hospitals out of the list are
   * tied at the last rank; in that case they follow the listed ones.
   */
  residentPrefsCompleted(): number[][] {
    if (!this.tieLast) return this.residentPrefs;

    return this.residentPrefs.map((prefs, r) => [...prefs, ...this.residentPrefsRest![r]!]);
  }

  /** Count the residents matched to a hospital out of their list. */
  countUnlistedMatches(mResidents: number[]): number {
    let count = 0;
    mResidents.forEach((h, r) => {
      if (h >= 0 && !this.residentPrefs[r]!.includes(h)) count++;
    });
    return count;
  }

  // Generate a random instance
  static generate(
    numResidents: number,
    numHospitals: number,
    seed?: number | bigint
  ): HospitalResident {
    const hr = new HospitalResident();
    hr.initRandom(numResidents, numHospitals, seed);
    return hr;
  }

  // Solve the HR instance
  solve(): [number[], number[][]] {
    // Parameters
    const numResidents = this.numResidents;
    const numHospitals = this.numHospitals;
    const residentPrefs = this.residentPrefsCompleted();
    const hospitalPrefs = this.hospitalPrefs;

    // Ranks of residents, for each hospital
    const hospitalRanks: number[][] = Array.from({ length: numHospitals }, () =>
      new Array<number>(numResidents).fill(-1)
    );
    for (let h = 0; h < numHospitals; h++) {
      for (let k = 0; k < hospitalPrefs[h]!.length; k++) {
        hospitalRanks[h]![hospitalPrefs[h]![k]!] = k;
      }
    }

    // Head indices for each resident
    const residentHead = new Array<number>(numResidents).fill(0);

    // Solution (matching)
    const mResidents = new Array<number>(numResidents).fill(-1);
    const mHospitals: number[][] = Array.from({ length: numHospitals }, () => []);

    // free_residents = deque(range(num_residents))
    const freeResidents = Array.from({ length: numResidents }, (_, i) => i);
    let qHead = 0; // O(1) alternative to deque.popleft()

    while (qHead < freeResidents.length) {
      // Pick a free resident r
      const r = freeResidents[qHead++]!;

      // Pick a hospital that is the best available for the resident r
      if (residentHead[r]! >= residentPrefs[r]!.length) continue;
      const h = residentPrefs[r]![residentHead[r]!]!;
      residentHead[r] += 1;

      // Match the resident r to the hospital h
      mResidents[r] = h;

      // Temporarily add the resident to the list of the hospital (sorted by hospital preference)
      insertByHospitalPreference(mHospitals[h]!, hospitalRanks[h]!, r);

      // If the applicants exceeds the capacity, remove the worst
      if (mHospitals[h]!.length > this.capacities[h]!) {
        const rWorst = mHospitals[h]!.pop()!; // the insertion keeps the worst-ranked element at the end
        mResidents[rWorst] = -1;
        freeResidents.push(rWorst);
      }
    }

    return [mResidents, mHospitals];
  }

}

/**
 * Inserts a resident into the list in order of the hospital's preference
 * (i.e., smaller rank values are preferred).
 * The list is maintained so that the last element is the worst-ranked resident.
 */
function insertByHospitalPreference(list: number[], rank: number[], resident: number): void {
  const rRank = rank[resident]!;

  // Simple linear insertion from the end (can be replaced with binary search)
  let i = list.length;
  while (i > 0 && rank[list[i - 1]!]! >= rRank) i--;
  list.splice(i, 0, resident);
}
