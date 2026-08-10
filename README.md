# simple-matching-ts

A TypeScript library implementing the stable matching algorithm.
It solves the Hospital/Resident problem (many-to-one matching), known from
resident matching programs, using the resident-oriented deferred acceptance
algorithm.

This is a TypeScript port of the Python version,
[dfukagaw28/simple_matching_python](https://github.com/dfukagaw28/simple_matching_python).

## Install

```bash
bun install
```

## Build

```bash
bun run build
```

Compiles `src/` into `dist/` using `tsc`.

## Test

```bash
bun test
```

## Usage

```ts
import { stableMatch, type Resident, type Hospital } from "simple-matching-ts";

const residents: Resident[] = [
  { id: "r1", preferences: ["h1", "h2"] }, // prefers h1 most
  { id: "r2", preferences: ["h1"] },
];

const hospitals: Hospital[] = [
  { id: "h1", capacity: 1, preferences: ["r2", "r1"] }, // prefers r2 most
  { id: "h2", capacity: 1, preferences: ["r1"] },
];

const result = stableMatch(residents, hospitals);

result.residents; // { r1: "h2", r2: "h1" }
result.hospitals; // { h1: ["r2"], h2: ["r1"] }
```

## API

### `stableMatch(residents: Resident[], hospitals: Hospital[]): MatchResult`

Computes a stable matching from each resident's and hospital's ranked preference lists.

- `Resident.preferences` / `Hospital.preferences` are arrays of IDs ordered by preference
  (the first entry is the most preferred).
- A resident and a hospital are never matched unless each appears in the other's preference list.
- If accepting a resident would exceed a hospital's `capacity`, the resident with the
  lowest rank at that hospital is rejected and moves on to their next preference.
- An unmatched resident has `result.residents[id]` set to `undefined`.

### Types

```ts
type ResidentId = string;
type HospitalId = string;

interface Resident {
  id: ResidentId;
  preferences: HospitalId[];
}

interface Hospital {
  id: HospitalId;
  capacity: number;
  preferences: ResidentId[];
}

interface MatchResult {
  residents: Record<ResidentId, HospitalId | undefined>;
  hospitals: Record<HospitalId, ResidentId[]>;
}
```

## Other

The `HospitalResident` class in `src/hospitalResident.ts` and the random number
utilities in `src/rng.ts` are internal helpers used to generate random matching
instances for tests and benchmarks. They are not part of the package's public API.

---

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
