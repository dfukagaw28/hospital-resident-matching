#!/usr/bin/env node
/**
 * Command line interface, a port of `src/hospital_resident_cli.py`.
 *
 * The seeds are drawn by the NumPy-compatible generator, so `simulate` run
 * with the same seed here and in the Python version runs the very same
 * instances.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { formatTimestamp, HospitalResident } from "./hospitalResident.js";
import { numpyDefaultRng } from "./numpy/random.js";

const USAGE = `Usage: hr-match COMMAND [OPTIONS] ARGS...

Commands:
  generate NUM_RESIDENTS NUM_HOSPITALS
      Generate an instance and save it.
      -s, --seed INTEGER    Seed of the instance (a random one when negative)
      --outdir PATH         Directory to save into (default: ./instances)

  solve PATH
      Load an instance and solve it.

  simulate NUM_RESIDENTS NUM_HOSPITALS CAPACITY_MAX
      Run a simulation over the capacities and the preference list lengths.
      -r, --repeat INTEGER  Instances per case (default: 10)
      -s, --seed INTEGER    Seed of the run (a random one when negative)
      -v, -vv               Verbosity
      --tie-last            Treat the hospitals out of a preference list as
                            acceptable and tied at the last rank
      --outdir PATH         Directory to write the CSV into (default: .)
`;

interface ParsedArgs {
  positional: string[];
  options: Map<string, string>;
  verbose: number;
  flags: Set<string>;
}

/** Parse the arguments of a command, in the style the Python CLI accepts. */
function parseArgs(argv: string[], valued: Record<string, string>, flags: Set<string>): ParsedArgs {
  const parsed: ParsedArgs = {
    positional: [],
    options: new Map(),
    verbose: 0,
    flags: new Set(),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (/^-v+$/.test(arg)) {
      parsed.verbose += arg.length - 1;
      continue;
    }
    if (flags.has(arg)) {
      parsed.flags.add(arg);
      continue;
    }

    const [name, inlineValue] = arg.startsWith("--") && arg.includes("=")
      ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
      : [arg, undefined];

    const canonical = valued[name];
    if (canonical !== undefined) {
      const value = inlineValue ?? argv[++i];
      if (value === undefined) throw new Error(`Option ${name} needs a value`);
      parsed.options.set(canonical, value);
      continue;
    }

    if (arg.startsWith("-")) throw new Error(`No such option: ${arg}`);
    parsed.positional.push(arg);
  }

  return parsed;
}

/** An integer argument, rejected if it is not one. */
function toInt(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer, got ${value}`);
  return parsed;
}

/** A seed, drawn at random when the given one is negative (as `-s -1` is). */
function resolveSeed(given: string | undefined): bigint {
  const seed = given === undefined ? -1n : BigInt(given);
  if (seed >= 0n) return seed;
  return numpyDefaultRng(drawEntropy()).integers(0, 1n << 63n);
}

/** Entropy for a generator that is not meant to be reproducible. */
function drawEntropy(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function commandGenerate(argv: string[]): void {
  const args = parseArgs(argv, { "-s": "seed", "--seed": "seed", "--outdir": "outdir" }, new Set());
  if (args.positional.length !== 2) throw new Error("generate takes NUM_RESIDENTS NUM_HOSPITALS");

  const numResidents = toInt(args.positional[0]!, "NUM_RESIDENTS");
  const numHospitals = toInt(args.positional[1]!, "NUM_HOSPITALS");
  const seed = resolveSeed(args.options.get("seed"));
  const outdir = args.options.get("outdir") ?? "./instances";

  // Generate an instance
  const hr = HospitalResident.generate(numResidents, numHospitals, seed);

  // Save the instance into a file
  const filename =
    `HR_r${String(numResidents).padStart(3, "0")}` +
    `_h${String(numHospitals).padStart(3, "0")}` +
    `_s${seed.toString().padStart(20, "0")}.txt`;
  const path = join(outdir, filename);
  hr.save(path);
  console.log(`Saved to ${path}`);
}

function commandSolve(argv: string[]): void {
  const args = parseArgs(argv, {}, new Set());
  if (args.positional.length !== 1) throw new Error("solve takes PATH");

  const hr = HospitalResident.load(args.positional[0]!);
  const [mResidents] = hr.solve();
  console.log(`[${mResidents.join(", ")}]`);
}

function commandSimulate(argv: string[]): void {
  const args = parseArgs(
    argv,
    { "-r": "repeat", "--repeat": "repeat", "-s": "seed", "--seed": "seed", "--outdir": "outdir" },
    new Set(["--tie-last"])
  );
  if (args.positional.length !== 3) {
    throw new Error("simulate takes NUM_RESIDENTS NUM_HOSPITALS CAPACITY_MAX");
  }

  const numResidents = toInt(args.positional[0]!, "NUM_RESIDENTS");
  const numHospitals = toInt(args.positional[1]!, "NUM_HOSPITALS");
  const capacityMax = toInt(args.positional[2]!, "CAPACITY_MAX");
  const repeat = args.options.has("repeat") ? toInt(args.options.get("repeat")!, "--repeat") : 10;
  const verbose = args.verbose;
  const tieLast = args.flags.has("--tie-last");
  const outdir = args.options.get("outdir") ?? ".";

  // Seed generator
  const masterSeed = resolveSeed(args.options.get("seed"));
  const rng = numpyDefaultRng(masterSeed);

  const capacityMin = 1 + Math.floor((numResidents - 1) / numHospitals);

  // One row per capacity, one column per length of the residents' lists
  const rows = new Map<number, (number | null)[]>();
  for (let capacity = capacityMin; capacity <= capacityMax; capacity++) {
    rows.set(capacity, new Array<number | null>(numHospitals).fill(null));
  }

  let capacityIsEnough = 0;
  for (let capacity = capacityMin; capacity <= capacityMax; capacity++) {
    const row = rows.get(capacity)!;

    for (let residentPrefMax = 1; residentPrefMax <= numHospitals; residentPrefMax++) {
      // Generate random seeds
      const seeds = Array.from({ length: repeat }, () => rng.integers(0, 1n << 63n));

      // Result array
      const unmatches: number[] = [];

      // Run
      for (const seed of seeds) {
        // Generate an instance
        const hr = HospitalResident.generate(numResidents, numHospitals, seed);

        // Set capacities
        hr.setCapacities(capacity);

        // Extract the top `residentPrefMax` preferences
        hr.cutResidentPrefences(residentPrefMax, { tieLast });

        // Solve
        const [mResidents] = hr.solve();

        // Count the number of residents that are not matched to a hospital of
        // their list (unmatched, or matched to one of the hospitals tied at
        // the last rank)
        const unmatched = mResidents.filter((h) => h === -1).length;
        const unmatch = unmatched + hr.countUnlistedMatches(mResidents);

        if (verbose >= 2) {
          console.log(
            `R:${numResidents} H:${numHospitals} C:${capacity} M:${residentPrefMax}` +
              ` S:${seed}  ->  U:${unmatch}`
          );
        }

        unmatches.push(unmatch);
      }

      const mean = unmatches.reduce((sum, value) => sum + value, 0) / unmatches.length;

      if (verbose >= 1) {
        console.log(
          `R:${numResidents} H:${numHospitals} C:${capacity} M:${residentPrefMax}` +
            `  ->  U:${mean.toFixed(4)}`
        );
      }

      row[residentPrefMax - 1] = mean;

      if (residentPrefMax >= 3) {
        const filled = row.filter((value): value is number => value !== null);
        const recent = filled.slice(-3);
        if (Math.max(...recent) === 0) {
          if (verbose >= 1) {
            console.log(
              "In recent 3 cases, all residents has matched.  The process will be skipped."
            );
          }
          capacityIsEnough = residentPrefMax === 3 ? capacityIsEnough + 1 : 0;
          break;
        }
      }
    }

    if (capacityIsEnough >= 3) break;
  }

  const timestamp = formatTimestamp(new Date());
  const stamp = `${timestamp.slice(0, 8)}_${timestamp.slice(8)}`;
  const filename = `result_R${numResidents}_H${numHospitals}_${stamp}.csv`;

  const lines = [
    ["capacity", ...Array.from({ length: numHospitals }, (_, i) => String(i + 1))].join(","),
  ];
  for (const [capacity, row] of rows) {
    lines.push(
      [String(capacity), ...row.map((value) => (value === null ? "" : formatFloat(value)))].join(",")
    );
  }

  mkdirSync(outdir, { recursive: true });
  const path = join(outdir, filename);
  writeFileSync(path, lines.join("\n") + "\n");
  if (verbose >= 1) console.log(`Saved to ${path}`);
}

/** A float written as Python writes one, so that the CSVs look the same. */
function formatFloat(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e16) return `${value}.0`;

  // JavaScript writes `1e-7` where Python writes `1e-07`
  return String(value).replace(/e([+-])(\d)$/, "e$10$2");
}

function main(argv: string[]): void {
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "generate":
        commandGenerate(rest);
        break;
      case "solve":
        commandSolve(rest);
        break;
      case "simulate":
        commandSimulate(rest);
        break;
      case undefined:
      case "-h":
      case "--help":
        console.log(USAGE);
        break;
      default:
        throw new Error(`No such command: ${command}`);
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}\n`);
    console.error(USAGE);
    process.exitCode = 2;
  }
}

main(process.argv.slice(2));
