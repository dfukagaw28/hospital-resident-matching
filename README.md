# simple-matching-ts

A TypeScript library implementing the stable matching algorithm.
It solves the Hospital/Resident problem (many-to-one matching), known from
resident matching programs, using the resident-oriented deferred acceptance
algorithm.

This is a TypeScript port of the Python version,
[dfukagaw28/simple_matching_python](https://github.com/dfukagaw28/simple_matching_python),
and it is a *seed-for-seed* port: an instance generated here from a given seed is
the very instance the Python version generates from it, biased instances
included (see [Compatibility with the Python version](#compatibility-with-the-python-version)).

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

## Random instance generation

`HospitalResident` generates a random Hospital/Resident matching instance
(index-based, using a seeded PCG32 RNG) and solves it with the same
deferred-acceptance algorithm as `stableMatch`.

```ts
import { HospitalResident } from "simple-matching-ts";

const hr = HospitalResident.generate(/* numResidents */ 300, /* numHospitals */ 20, /* seed */ 12345);
const [mResidents, mHospitals] = hr.solve();

mResidents[7]; // the hospital resident 7 is matched to, or -1 when unmatched
mHospitals[3]; // the residents hospital 3 holds, its favourite first
```

Every resident ranks every hospital and vice versa, each list an independent
random permutation. `seed` is optional; a random one is drawn without it and
kept in `hr.seed`.

### Capacities

By default every hospital gets the same capacity, `ceil(numResidents / numHospitals)`,
so that the hospitals hold a few more residents than there are.

```ts
hr.setCapacities(13);              // the same capacity for every hospital
hr.setCapacities([13, 12, 12]);    // one capacity per hospital
hr.setCapacities(-1, true);        // "tight": exactly numResidents seats in total
```

`tight` gives every hospital `floor(numResidents / numHospitals)` seats and hands
the seats left over, one each, to the hospitals that the most residents rank first
(then second, and so on), ties broken at random. The lists the popularity is
counted in are the submitted ones, so a hospital no resident lists gets a spare
seat by luck only.

### Reading and writing instances

```ts
hr.save("./instances/HR_r300_h020.txt"); // refuses to overwrite an existing file
const loaded = HospitalResident.load("./instances/HR_r300_h020.txt");

hr.toText();                 // the same text, without touching the disk
HospitalResident.fromText(text);

hr.show();                   // print the instance
hr.toDicts();                // the layout the Python `matching` package wants
```

Neither the `tieLast` flag nor the tie-broken order of the hospitals out of the
lists is saved; call `setTieLast()` again after loading.

## Incomplete preference lists

A preference list of a resident may be incomplete, either because it is cut by
`cutResidentPrefences(k)` or because the instance file gives a short list.
The hospitals out of the list are unacceptable by default; a resident rejected by
all the listed hospitals is left unmatched.

```ts
const hr = HospitalResident.generate(300, 20, 12345);
hr.cutResidentPrefences(5);
const [mResidents] = hr.solve();
```

Passing `tieLast: true` makes them acceptable and tied at the last rank instead:
a resident rejected by all the listed hospitals keeps applying to the remaining
ones. A tie has to be broken to run the (resident-oriented) Gale-Shapley
algorithm, which is done by `tieBreak`:

- `"random"` (default): the hospitals out of the list are shuffled at random
  (seeded by `seed`, if given)
- `"keep"`: they keep the order they have in the current preference list, i.e. the
  algorithm behaves exactly as if the list were not cut at all

```ts
const hr = HospitalResident.generate(300, 20, 12345);
hr.cutResidentPrefences(5, { tieLast: true });
// const hr = HospitalResident.load(path);   // already incomplete instance
// hr.setTieLast(true, "random");

const [mResidents] = hr.solve();
const n = hr.countUnlistedMatches(mResidents); // matched out of the list
```

With `tieLast: true` the number of unmatched residents is no longer random: it is
exactly `max(0, numResidents - sum(capacities))`. A resident ends up unmatched
only when every hospital has rejected them, and a hospital that has rejected
someone is full and stays full, so every hospital is full whenever a resident is
left unmatched. The quantity of interest is therefore the number of residents
matched out of their list, `countUnlistedMatches()`, rather than the number of
unmatched residents.

Note that the resident-oriented Gale-Shapley algorithm only requires *weak*
stability here, so any tie-breaking gives a stable matching. For a randomly
generated instance the two tie-breaking rules even give the same distribution of
matchings, since the tail of a random permutation is itself a random order.

## Biased preferences

`HospitalResident.generate()` draws every preference list independently, so that
no hospital is more wanted than another. `generateBiasedHR()` instead lets the
residents agree with each other on how good the hospitals are, and the hospitals
on how good the residents are.

```ts
import { generateBiasedHR } from "simple-matching-ts";

const hr = generateBiasedHR(300, 24, {
  alphaResident: 0.5,
  alphaHospital: 0.5,
  listLength: 8,
  seed: 12345,
});
const [mResidents, mHospitals] = hr.solve();
```

Every resident scores a hospital as an opinion that all the residents share plus
an opinion of their own, and ranks the hospitals by that score.
`alphaResident` is how much of the score the shared opinion makes: it is the
correlation of the scores of any two residents, from 0 (independent lists, as in
`generate()`) to 1 (identical lists). `alphaHospital` does the same for the lists
of the hospitals. The residents rank their best `listLength` hospitals only (all
of them if it is `null`), while the hospitals always rank every resident.
The hospitals a resident leaves out are unacceptable to them, unless
`tieLast: true` makes them acceptable and tied at the last rank.

The more the residents agree, the more of them miss out: with 300 residents,
24 hospitals of capacity 13 and lists of 8, the number of unmatched residents
grows from 0.1 at `alphaResident: 0` to 14 at 0.25, 37 at 0.5 and 78 at 0.75, on
average over the instances (a single instance varies widely around it).

## Normalizing an instance

`normalize()` renumbers the residents and the hospitals of an instance by
popularity, in place, which makes an instance easier to read.

```ts
import { HospitalResident, normalize } from "simple-matching-ts";

const hr = HospitalResident.generate(300, 24, 12345);
const [residentOrder, hospitalOrder] = normalize(hr);
```

The hospital that the most residents rank first becomes the hospital 0, and the
resident that the most hospitals rank first becomes the resident 0; ties are
broken by the number of the second choices, then of the third ones, and so on
(see the doc comments for the details). The instance is only renumbered, never
altered: solving it gives the same matching, up to the renumbering. The returned
orders hold the old numbers in their new order, so `residentOrder[i]` is the
resident that becomes the resident `i`.

## Command line

```bash
bun run cli generate 300 20                 # writes ./instances/HR_r300_h020_s...txt
bun run cli solve instances/HR_r300_h020_s05685763110016471008.txt
bun run cli simulate 100 10 20 -v -r 1000   # writes ./result_R100_H10_<timestamp>.csv
```

After `bun run build` the same commands are available as the `simple-matching`
binary (`node dist/cli.js ...`).

`simulate NUM_RESIDENTS NUM_HOSPITALS CAPACITY_MAX` sweeps the capacity of the
hospitals from `CAPACITY_MIN` (the smallest integer no less than
`NUM_RESIDENTS / NUM_HOSPITALS`) up to `CAPACITY_MAX`, and the length of the
residents' preference lists from 1 up to `NUM_HOSPITALS`.

- `-r, --repeat INTEGER`: instances per case (default: 10)
- `-s, --seed INTEGER`: seed of the run (a random one when negative)
- `-v`, `-vv`: verbosity
- `--tie-last`: treat the hospitals out of a preference list as acceptable and
  tied at the last rank (see [Incomplete preference lists](#incomplete-preference-lists))
- `--outdir PATH`: where to write (default: `./instances` for `generate`, `.` for `simulate`)

The value recorded for each case is the mean number of residents that are not
matched to a hospital of their (cut) preference list. Without `--tie-last` such a
resident is left unmatched; with `--tie-last` they may be matched to a hospital
out of their list instead.

## Web example

`examples/web` is a single-page front-end that generates instances and solves
them in the browser, built with Vite:

```bash
npm run build                # emits dist/, which the example imports
cd examples/web && npm install && npm run dev
```

The page loads `src/main.ts` as it is and lets Vite compile it, so it has to be
opened through `npm run dev`; a plain static server hands the browser a `.ts`
file it refuses to run. Use `npm run build && npm run preview` to serve it as a
bundle instead.

The library is plain ES modules with no runtime dependency, so a bundler pulls
it in as it is. The one thing to watch for is that `save()` and `load()` take
file paths, so `node:fs` and `node:path` are imported at the top of
`hospitalResident.ts`; a browser build has to alias them away (the example
points them at a stub that throws) and use `toText()` / `fromText()` instead.
See [examples/web/README.md](examples/web/README.md).

## Compatibility with the Python version

Given the same seed, this package and the Python version produce the same
instances, the same matchings and the same `simulate` CSV. That holds for the
biased generator too, which the Python version draws with NumPy: `src/numpy/`
reproduces `numpy.random.default_rng` bit for bit — `SeedSequence`, the `PCG64`
bit generator, `standard_normal` (the ziggurat algorithm, whose tables are copied
from NumPy) and `integers` (Lemire's algorithm).

Those pieces are exported as well, should you want a NumPy-compatible stream of
your own:

```ts
import { numpyDefaultRng, Pcg32Rng, permutation } from "simple-matching-ts";

const rng = numpyDefaultRng(12345);
rng.normal(0, 1, 5);      // === np.random.default_rng(12345).normal(0, 1, 5)
rng.integers(0, 1 << 30); // === np.random.default_rng(12345).integers(0, 1 << 30)
```

The one place the two can part ways is a tie between two equal scores in the
biased generator, which NumPy breaks by an unstable sort and this package by the
item number; the scores are continuous, so a tie has probability zero.

---

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
