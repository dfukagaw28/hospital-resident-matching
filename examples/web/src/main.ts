/**
 * A small web front-end for `simple-matching-ts`.
 *
 * The library is plain ES modules with no runtime dependency, so a bundler
 * (here Vite) can pull it straight into the browser: this file only reads the
 * form, calls the library, and paints the tables.
 */

import {
  HospitalResident,
  generateBiasedHR,
  normalize,
  type TieBreak,
} from "simple-matching-ts";

/* ------------------------------------------------------------------ */
/* The form                                                            */
/* ------------------------------------------------------------------ */

type Mode = "uniform" | "biased";
type CapacityMode = "auto" | "tight" | "uniform";

interface Settings {
  mode: Mode;
  numResidents: number;
  numHospitals: number;
  seed: number | undefined;
  alphaResident: number;
  alphaHospital: number;
  capacityMode: CapacityMode;
  capacityValue: number;
  listLength: number; // 0 keeps every hospital in the list
  tieLast: boolean;
  tieBreak: TieBreak;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} is missing from the page`);
  return node as T;
}

const form = el<HTMLFormElement>("controls");
const errorBox = el<HTMLParagraphElement>("error");
const instanceText = el<HTMLTextAreaElement>("instanceText");

function readSettings(): Settings {
  const number = (id: string): number => Number(el<HTMLInputElement>(id).value);
  const rawSeed = el<HTMLInputElement>("seed").value.trim();

  return {
    mode: el<HTMLSelectElement>("mode").value as Mode,
    numResidents: number("numResidents"),
    numHospitals: number("numHospitals"),
    seed: rawSeed === "" ? undefined : Number(rawSeed),
    alphaResident: number("alphaResident"),
    alphaHospital: number("alphaHospital"),
    capacityMode: el<HTMLSelectElement>("capacityMode").value as CapacityMode,
    capacityValue: number("capacityValue"),
    listLength: number("listLength"),
    tieLast: el<HTMLInputElement>("tieLast").checked,
    tieBreak: el<HTMLSelectElement>("tieBreak").value as TieBreak,
  };
}

/* ------------------------------------------------------------------ */
/* The library                                                         */
/* ------------------------------------------------------------------ */

/** Give the hospitals the capacities the form asks for. */
function applyCapacities(instance: HospitalResident, settings: Settings): void {
  switch (settings.capacityMode) {
    case "tight":
      // Exactly `numResidents` seats in total, the spare ones going to the
      // hospitals the most residents rank first.  The lists are read as they
      // are, so this has to run *after* they are cut.
      instance.setCapacities(-1, true);
      break;
    case "uniform":
      instance.setCapacities(settings.capacityValue);
      break;
    case "auto":
      instance.setCapacities();
      break;
  }
}

function buildInstance(settings: Settings): HospitalResident {
  const { numResidents, numHospitals, listLength, tieLast } = settings;
  const cut = listLength > 0 && listLength < numHospitals ? listLength : 0;

  if (settings.mode === "biased") {
    const instance = generateBiasedHR(numResidents, numHospitals, {
      alphaResident: settings.alphaResident,
      alphaHospital: settings.alphaHospital,
      listLength: cut === 0 ? null : cut,
      tieLast,
      seed: settings.seed,
    });
    applyCapacities(instance, settings);
    return instance;
  }

  const instance = HospitalResident.generate(numResidents, numHospitals, settings.seed);
  if (cut > 0) {
    instance.cutResidentPrefences(cut, { tieLast, tieBreak: settings.tieBreak });
  }
  applyCapacities(instance, settings);
  return instance;
}

/* ------------------------------------------------------------------ */
/* The results                                                         */
/* ------------------------------------------------------------------ */

let instance: HospitalResident | null = null;

interface Solution {
  /** Hospital each resident is matched to, or -1 when they are unmatched. */
  mResidents: number[];
  /** Residents each hospital takes, in the order the hospital prefers. */
  mHospitals: number[][];
}

function render(hr: HospitalResident, solution: Solution): void {
  const { mResidents, mHospitals } = solution;
  const submitted = hr.residentPrefs;
  const completed = hr.residentPrefsCompleted();

  renderStats(hr, solution);

  // Residents
  const residentRows = mResidents.map((h, r) => {
    const prefs = submitted[r]!;
    const listed = h >= 0 && prefs.includes(h);
    const rank = h < 0 ? null : completed[r]!.indexOf(h) + 1;

    return `<tr>
      <th scope="row">${r}</th>
      <td class="prefs">${prefs
        .map((p) => `<span class="chip${p === h ? " chip-match" : ""}">${p}</span>`)
        .join("")}${hr.tieLast ? '<span class="chip chip-rest">…</span>' : ""}</td>
      <td>${h < 0 ? '<span class="unmatched">未配属</span>' : `<b>${h}</b>`}${
        h >= 0 && !listed ? ' <span class="hint">(リスト外)</span>' : ""
      }</td>
      <td>${rank === null ? "-" : rank}</td>
    </tr>`;
  });
  el<HTMLTableSectionElement>("residentTable").querySelector("tbody")!.innerHTML =
    residentRows.join("");

  // Hospitals
  const hospitalRows = mHospitals.map((residents, h) => {
    const capacity = hr.capacities[h]!;
    const full = residents.length >= capacity;
    return `<tr>
      <th scope="row">${h}</th>
      <td>${capacity}</td>
      <td class="${full ? "full" : ""}">${residents.length}${full ? " (満員)" : ""}</td>
      <td class="prefs">${residents.map((r) => `<span class="chip">${r}</span>`).join("")}</td>
    </tr>`;
  });
  el<HTMLTableSectionElement>("hospitalTable").querySelector("tbody")!.innerHTML =
    hospitalRows.join("");

  instanceText.value = hr.toText();
}

function renderStats(hr: HospitalResident, { mResidents }: Solution): void {
  const completed = hr.residentPrefsCompleted();
  const matched = mResidents.filter((h) => h >= 0);
  const ranks = mResidents
    .map((h, r) => (h < 0 ? 0 : completed[r]!.indexOf(h) + 1))
    .filter((rank) => rank > 0);
  const averageRank =
    ranks.length === 0 ? 0 : ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
  const firstChoice = mResidents.filter((h, r) => h >= 0 && hr.residentPrefs[r]![0] === h).length;
  const seats = hr.capacities.reduce((sum, capacity) => sum + capacity, 0);

  const stats: [string, string][] = [
    ["配属済み", `${matched.length} / ${hr.numResidents}`],
    ["第1希望", `${firstChoice} 人`],
    ["平均順位", ranks.length === 0 ? "-" : averageRank.toFixed(2)],
    ["リスト外への配属", `${hr.countUnlistedMatches(mResidents)} 人`],
    ["総定員", `${seats} 席`],
    ["シード", hr.seed === undefined ? "(不明)" : String(hr.seed)],
  ];

  el<HTMLDListElement>("stats").innerHTML = stats
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}

function solveAndRender(hr: HospitalResident): void {
  const [mResidents, mHospitals] = hr.solve();
  instance = hr;
  render(hr, { mResidents, mHospitals });
}

function run(action: () => void): void {
  try {
    action();
    errorBox.hidden = true;
  } catch (cause) {
    errorBox.textContent = cause instanceof Error ? cause.message : String(cause);
    errorBox.hidden = false;
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

form.addEventListener("submit", (event) => {
  event.preventDefault();
  run(() => solveAndRender(buildInstance(readSettings())));
});

el<HTMLButtonElement>("normalize").addEventListener("click", () => {
  run(() => {
    if (instance === null) throw new Error("先にインスタンスを生成してください");
    // Renumber the residents and the hospitals by popularity, so that two
    // instances that differ only in their numbering come out identical.
    normalize(instance);
    solveAndRender(instance);
  });
});

el<HTMLButtonElement>("loadText").addEventListener("click", () => {
  run(() => {
    const settings = readSettings();
    const hr = HospitalResident.fromText(instanceText.value);
    // The file format carries neither the capacities nor the `tieLast` flag,
    // so both are taken from the form again.
    if (settings.tieLast) hr.setTieLast(true, settings.tieBreak);
    applyCapacities(hr, settings);
    solveAndRender(hr);
  });
});

el<HTMLButtonElement>("download").addEventListener("click", () => {
  run(() => {
    if (instance === null) throw new Error("先にインスタンスを生成してください");
    const url = URL.createObjectURL(new Blob([instance.toText()], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `hr-${instance.numResidents}x${instance.numHospitals}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  });
});

// Show only the fields that the current settings use
function syncFormVisibility(): void {
  const settings = readSettings();
  const toggle = (selector: string, shown: boolean) => {
    for (const node of document.querySelectorAll<HTMLElement>(selector)) node.hidden = !shown;
  };

  toggle(".biased-only", settings.mode === "biased");
  toggle(".capacity-value-only", settings.capacityMode === "uniform");
  toggle(".tie-break-only", settings.tieLast && settings.mode === "uniform");

  el<HTMLOutputElement>("alphaResidentOut").value = settings.alphaResident.toFixed(2);
  el<HTMLOutputElement>("alphaHospitalOut").value = settings.alphaHospital.toFixed(2);
}

form.addEventListener("input", syncFormVisibility);
syncFormVisibility();

// Solve one instance right away, so the page is not empty
run(() => solveAndRender(buildInstance(readSettings())));
