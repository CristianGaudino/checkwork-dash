import "server-only";
import { FUELS, type Fuel } from "@/lib/stock/types";
import { mileageOff, type VehicleHistory } from "@/lib/history-rules";
import { dublinDay } from "@/lib/admin/format";
import type { CarFound } from "@/lib/reg-lookup";

// One Auto API (oneautoapi.com): our one vehicle data provider, for the registration lookup and the history check (#170). For Ireland its
// data is Cartell's. The account is ours, billed to dealers through usage: its key is the Worker secret ONE_AUTO_API_KEY (the "reglookup"
// service in src/lib/integrations.ts), never a dealer's.
//
// NOT INSTALLED YET. `call` is a stub that answers "not-installed" until the owner has the keys and One Auto's docs (docs/dealer-admin.md,
// Connecting a service). The base address, the auth header, the paths and the field names in the two mappings are our reading of One
// Auto's public pages: confirm each against their docs, then set INSTALLED. Until then a live dealer's lookup gives the plate's own facts
// and a history check says it could not be done; the demo is simulated and never gets here.
const INSTALLED = false;
const BASE = "https://api.oneautoapi.com";
const AUTH_HEADER = "x-api-key";
const PATHS = { car: "/cartell/vehicledetails/v2", history: "/cartell/vehiclehistory/v2" } as const; // to confirm

async function call(what: keyof typeof PATHS, reg: string): Promise<unknown> {
  if (!INSTALLED) return "not-installed";
  const r = await fetch(`${BASE}${PATHS[what]}?vehicle_registration_mark=${encodeURIComponent(reg)}`, { headers: { [AUTH_HEADER]: process.env.ONE_AUTO_API_KEY ?? "" }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`One Auto ${what} answered ${r.status}`); // never the plate: an error can reach the logs
  return ((await r.json()) as { result?: unknown }).result ?? null;
}

// The answers as we expect them (to confirm): only the fields we keep. An owner's name or address in an answer is never read.
type CarAnswer = { make?: string; model?: string; fuel_type?: string; engine_capacity_cc?: number; colour?: string; body_type?: string };
type HistoryAnswer = {
  finance?: { outstanding?: boolean; finance_house?: string };
  write_off?: { category?: string } | null;
  mileage_records?: { date: string; mileage_km: number }[];
  imported?: boolean;
  import_country?: string;
  number_of_owners?: number;
  nct_expiry_date?: string;
  first_registration_date?: string;
};

export function mapCar(a: CarAnswer): CarFound | null {
  if (!a.make || !a.model) return null;
  const fuel = a.fuel_type?.toLowerCase().replace(/\s+/g, "-");
  return {
    make: a.make,
    model: a.model,
    ...((FUELS as readonly string[]).includes(fuel ?? "") && { fuel: fuel as Fuel }),
    ...(a.engine_capacity_cc && { engineLitres: Math.round(a.engine_capacity_cc / 100) / 10 }),
    ...(a.colour && { colour: a.colour }),
    ...(a.body_type && { bodyType: a.body_type }),
  };
}

export function mapHistory(a: HistoryAnswer, reg: string, today: string): VehicleHistory {
  const mileage = (a.mileage_records ?? []).map((m) => ({ on: m.date.slice(0, 10), km: m.mileage_km })).sort((x, y) => x.on.localeCompare(y.on));
  return {
    reg,
    checkedOn: today,
    financeOwed: Boolean(a.finance?.outstanding),
    ...(a.finance?.outstanding && a.finance.finance_house && { financeHouse: a.finance.finance_house }),
    ...(a.write_off?.category && { writeOff: a.write_off.category }),
    mileage,
    mileageOff: mileageOff(mileage),
    imported: Boolean(a.imported),
    ...(a.imported && a.import_country && { importedFrom: a.import_country }),
    owners: a.number_of_owners ?? 0,
    ...(a.nct_expiry_date && { nctExpiry: a.nct_expiry_date.slice(0, 10) }),
    firstRegistered: (a.first_registration_date ?? "").slice(0, 10),
  };
}

// The registration lookup's service (src/lib/reg-lookup.ts): null when One Auto does not know the plate. Throws when it cannot answer
// (not installed, down), which the lookup treats as no answer, uncached.
export async function carByReg(reg: string): Promise<CarFound | null> {
  const a = await call("car", reg);
  if (a === "not-installed") throw new Error("One Auto adapter not installed");
  return a ? mapCar(a as CarAnswer) : null;
}

// The history check's service (src/lib/history.ts): null when One Auto does not know the plate.
export async function historyByReg(reg: string): Promise<VehicleHistory | null | "not-installed"> {
  const a = await call("history", reg);
  if (a === "not-installed") return a;
  return a ? mapHistory(a as HistoryAnswer, reg, dublinDay()) : null;
}
