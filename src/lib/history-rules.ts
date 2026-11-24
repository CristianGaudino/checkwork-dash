import { fmtDate, fmtNum, plural } from "@/lib/admin/format";
import { parseIrishReg } from "@/lib/reg";

// A vehicle history check (#170): what the vehicle data provider (One Auto, on Cartell in Ireland) says about a car from its plate. Facts
// about the car only, never an owner's name or anything else personal. Pure, so the mock, the summary, the pages and the tests agree.
export type MileageRecord = { on: string; km: number }; // on: YYYY-MM-DD
export type VehicleHistory = {
  reg: string;
  checkedOn: string; // YYYY-MM-DD, the Irish day the provider was asked (a cached answer keeps it)
  financeOwed: boolean;
  financeHouse?: string;
  writeOff?: string; // the category ("A", "B", "S", "N"); absent: never written off
  mileage: MileageRecord[]; // oldest first
  mileageOff: boolean; // the readings do not add up
  imported: boolean;
  importedFrom?: string;
  owners?: number; // absent: the provider did not say
  nctExpiry?: string; // YYYY-MM-DD
  firstRegistered?: string; // YYYY-MM-DD; absent: the provider did not say
};

// A reading lower than the one before it: the mileage does not add up.
export const mileageOff = (m: MileageRecord[]) => m.some((r, i) => i > 0 && r.km < m[i - 1].km);

// What needs a second look, in plain words; empty for a clean car.
export const historyWarnings = (h: VehicleHistory): string[] =>
  [
    h.financeOwed && (h.financeHouse ? `Finance owed to ${h.financeHouse}` : "Finance owed"),
    h.writeOff && `Written off, category ${h.writeOff}`,
    h.mileageOff && "Mileage does not add up",
    h.imported && (h.importedFrom ? `Imported from ${h.importedFrom}` : "Imported"),
  ].filter((w): w is string => Boolean(w));
export const CLEAN = "No finance owed, never written off, and the mileage adds up.";

// The rest, as short facts under the warnings.
export function historyFacts(h: VehicleHistory): string[] {
  const last = h.mileage.at(-1);
  return [
    ...(h.owners !== undefined ? [plural(h.owners, "owner")] : []),
    ...(h.firstRegistered ? [`First registered ${fmtDate(h.firstRegistered)}`] : []),
    h.nctExpiry ? `NCT until ${fmtDate(h.nctExpiry)}` : "No NCT on record",
    ...(last ? [`${fmtNum(last.km)} km on ${fmtDate(last.on)}`] : []),
  ];
}

// The demo's plates, each showing one state (docs/dealer-admin.md, History check). Any other Irish plate is a clean car.
export const DEMO_HISTORY: Record<string, "finance" | "writeOff" | "mileage" | "import"> = {
  "151-D-1000": "finance", // a trade-in lead
  "162-C-1037": "mileage", // a sell lead
  "151-D-23817": "writeOff", // the first recorded sale's trade-in
  "171-D-1384": "import", // a car in stock
};

// The simulated check (the demo, next dev, tests, E2E): made up from the plate, the same plate giving the same answer on a given day (its
// readings stop at `today`). An NCT reading every two years from the fourth, a set pace per plate.
export function mockHistory(raw: string, today: string): VehicleHistory | null {
  const f = parseIrishReg(raw, new Date(`${today}T12:00:00Z`));
  if (!f) return null;
  let h = 0;
  for (const ch of f.reg) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const monthDay = `-${f.half === 2 ? "07" : "01"}-${String(1 + (h % 28)).padStart(2, "0")}`;
  const mileage: MileageRecord[] = [];
  for (let y = f.year + 4; `${y}${monthDay}` <= today; y += 2) mileage.push({ on: `${y}${monthDay}`, km: (y - f.year) * (12_000 + (h % 6_000)) });
  const state = DEMO_HISTORY[f.reg];
  if (state === "mileage" && mileage.length > 1) mileage[mileage.length - 1].km = mileage[mileage.length - 2].km - 40_000; // clocked
  const lastNct = mileage.at(-1)?.on;
  return {
    reg: f.reg,
    checkedOn: today,
    financeOwed: state === "finance",
    ...(state === "finance" && { financeHouse: "Harbour Finance" }),
    ...(state === "writeOff" && { writeOff: "B" }),
    mileage,
    mileageOff: mileageOff(mileage),
    imported: state === "import",
    ...(state === "import" && { importedFrom: "the UK" }),
    owners: mileage.length ? 1 + (h % 3) : 1,
    nctExpiry: lastNct ? `${Number(lastNct.slice(0, 4)) + 2}${monthDay}` : `${f.year + 4}${monthDay}`,
    firstRegistered: `${f.year}${monthDay}`,
  };
}
