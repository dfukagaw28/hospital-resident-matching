import * as fs from "node:fs";
import * as path from "node:path";
import { Pcg32Rng, permutation } from "./rng";

export class HospitalResident {
  numResidents!: number;
  numHospitals!: number;
  residentPrefs!: number[][];
  hospitalPrefs!: number[][];
  capacities!: number[];
  seed!: number;

  constructor() {
  }

  // Randomly initialize the instance
  init_random(
    numResidents: number,
    numHospitals: number,
    seed: number
  ): void {
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
    this.residentPrefs = [];
    for (let _ = 0; _ < this.numResidents; _++) {
    this.residentPrefs.push(permutation(rng, this.numHospitals));
    }

    // Generate preference list (hospital -> resident)
    this.hospitalPrefs = [];
    for (let _ = 0; _ < this.numHospitals; _++) {
    this.hospitalPrefs.push(permutation(rng, this.numResidents));
    }

    // Set capacities for each hospital
    this.setCapacities();    
  }

  // Set the capacities for each hospital
  setCapacities(capacities: number = -1): void {
    if (capacities < 0) {
      capacities = 1 + Math.floor((this.numResidents - 1) / this.numHospitals);
    }
    this.capacities = Array(this.numHospitals).fill(capacities);
  }

  // Generate a random instance
  static generate(
    numResidents: number,
    numHospitals: number,
    seed: number
  ): HospitalResident {
    const hr = new HospitalResident();
    hr.init_random(numResidents, numHospitals, seed)
    return hr;
  }

  // Solve the HR instance
  solve(): [number[], number[][]] {
    // Ranks of residents, for each hospital
    const hospitalRanks: number[][] = Array.from(
      { length: this.numHospitals },
      () => Array(this.numResidents).fill(-1)
    );
    for (let h = 0; h < this.numHospitals; h++) {
      for (let k = 0; k < this.hospitalPrefs[h].length; k++) {
        const r = this.hospitalPrefs[h][k];
        hospitalRanks[h][r] = k;
      }
    }

    // Head indices for each resident
    const residentHead: number[] = Array(this.numResidents).fill(0);

    // Solution (matching)
    const mResidents: number[] = Array(this.numResidents).fill(-1);
    const mHospitals: number[][] = Array.from({ length: this.numHospitals }, () => []);

    // free_residents = deque(range(num_residents))
    const freeResidents: number[] = Array.from({ length: this.numResidents }, (_, i) => i);
    let qHead = 0;  // O(1) alternative to deque.popleft()

    while (qHead < freeResidents.length) {
      // Pick a free resident r
      const r = freeResidents[qHead++];

      // Pick a hospital that is the best available for the resident r
      if (residentHead[r] >= this.residentPrefs[r].length) continue;
      const h = this.residentPrefs[r][residentHead[r]];
      residentHead[r] += 1;

      // Match the resident r to the hospital h
      mResidents[r] = h;

      // Temporarily add the resident to the list of the hospital (sorted by hospital preference)
      insertByHospitalPreference(mHospitals[h], hospitalRanks[h], r);

      // If the applicants exceeds the capacity, remove the worst
      if (mHospitals[h].length > this.capacities[h]) {
        const rWorst = mHospitals[h].pop()!;  // assuming the insertion keeps the worst-ranked element at the end
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
function insertByHospitalPreference(
  list: number[],
  rank: number[],
  resident: number
): void {
  const rRank = rank[resident];

  // Simple linear insertion (can be replaced with binary search if needed)
  let i = 0;
  while (i < list.length && rank[list[i]] <= rRank) i++;
  list.splice(i, 0, resident);
}
