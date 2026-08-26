/**
 * Generation of HR instances whose preferences are biased.
 *
 * The residents (hospitals) do not rank the hospitals (residents)
 * independently of each other: they share a common opinion on how good each of
 * them is, the weight of which is given by `alpha`.
 */

import { HospitalResident } from "./hospitalResident.js";
import { numpyDefaultRng, type NumpyGenerator } from "./numpy/random.js";
import { Pcg32Rng } from "./rng.js";

/**
 * Generate `numChoosers` preference lists over `numChoices` items.
 *
 * Every chooser scores an item as `sqrt(alpha)` times an opinion that all the
 * choosers share plus `sqrt(1 - alpha)` times an opinion of their own, both
 * drawn from the standard normal distribution, and ranks the items by that
 * score.  The square roots make `alpha` the correlation of the scores of any
 * two choosers (and leave the scores standard normal themselves), so
 * `alpha = 0` makes the lists independent of each other, `alpha = 1` makes them
 * all the same, and `alpha = 0.5` puts them halfway.
 *
 * Only the best `listLength` items are kept in a list, all of them if it is
 * undefined.  Beware that a *hospital* has to rank every resident: a resident
 * it leaves out is not treated as unacceptable by `HospitalResident.solve`.
 */
export function generateCorrelatedPreferences(
  numChoosers: number,
  numChoices: number,
  alpha = 0.5,
  listLength?: number,
  rng?: NumpyGenerator
): number[][] {
  if (!(alpha >= 0 && alpha <= 1)) {
    throw new Error(`Expected an alpha in [0, 1], got ${alpha}`);
  }

  const generator = rng ?? numpyDefaultRng(randomSeed());
  const keep = listLength ?? numChoices;

  // The opinion all the choosers share, and the one each of them holds alone
  const common = generator.normal(0, 1, numChoices);
  const idiosyncratic = generator.normal(0, 1, numChoosers * numChoices);

  const commonWeight = Math.sqrt(alpha);
  const ownWeight = Math.sqrt(1 - alpha);

  const prefs: number[][] = [];
  for (let chooser = 0; chooser < numChoosers; chooser++) {
    const offset = chooser * numChoices;
    const scores = new Array<number>(numChoices);
    for (let item = 0; item < numChoices; item++) {
      scores[item] = commonWeight * common[item]! + ownWeight * idiosyncratic[offset + item]!;
    }

    const order = Array.from({ length: numChoices }, (_, item) => item);
    order.sort((a, b) => scores[b]! - scores[a]! || a - b);
    prefs.push(order.slice(0, keep));
  }

  return prefs;
}

export interface BiasedOptions {
  /** How much the residents agree with each other on the hospitals. */
  alphaResident?: number;
  /** How much the hospitals agree with each other on the residents. */
  alphaHospital?: number;
  /** How many hospitals a resident ranks (all of them if it is null). */
  listLength?: number | null;
  /** Tie the hospitals out of a resident's list at the last rank. */
  tieLast?: boolean;
  /** Seed of the instance; a random one is drawn without it. */
  seed?: number | bigint;
  /** Generator to draw the instance from, instead of one made from `seed`. */
  rng?: NumpyGenerator;
}

/**
 * Generate a Hospital-Resident instance with biased preferences.
 *
 * `alphaResident` is how much the residents agree with each other on the
 * hospitals, and `alphaHospital` how much the hospitals agree with each other
 * on the residents, 0 being no agreement beyond chance and 1 being a complete
 * one (see `generateCorrelatedPreferences`).  The residents rank their best
 * `listLength` hospitals only (all of them if it is null), while the hospitals
 * always rank every resident.
 *
 * The hospitals a resident leaves out are unacceptable to them, unless
 * `tieLast` makes them acceptable and tied at the last rank, in a random order
 * (call `setTieLast` on the instance to choose the order yourself).
 *
 * The instance is generated from `seed`, a random one if none is given, unless
 * a generator is passed as `rng`; the instance is then generated from it and
 * holds no seed of its own.
 */
export function generateBiasedHR(
  numResidents: number,
  numHospitals: number,
  options: BiasedOptions = {}
): HospitalResident {
  const {
    alphaResident = 0.5,
    alphaHospital = 0.5,
    listLength = 8,
    tieLast = false,
  } = options;

  let { seed, rng } = options;
  if (rng === undefined) {
    if (seed === undefined) seed = randomSeed();
    rng = numpyDefaultRng(seed);
  } else {
    seed = undefined;
  }

  // Create a instance
  const hr = new HospitalResident();
  hr.numResidents = numResidents;
  hr.numHospitals = numHospitals;
  hr.seed = seed;

  // Generate resident preferences
  hr.residentPrefs = generateCorrelatedPreferences(
    numResidents,
    numHospitals,
    alphaResident,
    listLength ?? undefined,
    rng
  );

  // Generate hospital preferences, which have to rank every resident
  hr.hospitalPrefs = generateCorrelatedPreferences(
    numHospitals,
    numResidents,
    alphaHospital,
    undefined,
    rng
  );

  // Give the instance a generator of the kind it uses itself, so that the
  // hospitals out of a resident's list can be shuffled (see setTieLast)
  hr.rng = new Pcg32Rng(rng.integers(0, 1 << 30));

  // Tie the hospitals out of a resident's list at the last rank, if asked to
  if (tieLast) hr.setTieLast();

  // Set capacities for each hospital
  hr.setCapacities();

  return hr;
}

/** A seed drawn the way the Python version draws one, in [0, 2**30). */
function randomSeed(): number {
  return Math.floor(Math.random() * (1 << 30));
}
