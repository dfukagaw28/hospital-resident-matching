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
}
