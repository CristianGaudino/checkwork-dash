import "server-only";
import demoCars from "@/lib/stock/demo-cars.json";
import { defineCollection } from "@/lib/admin/docs";
import { REG_CACHE_DAYS } from "@/lib/leads/constants";
import { modeOf } from "@/lib/integrations";
import { parseIrishReg, type RegFacts } from "@/lib/reg";
import { carByReg } from "@/lib/vehicle-data/one-auto";
import { DAY } from "@/lib/time";
import type { Car, Fuel } from "@/lib/stock/types";

// A registration lookup: what the plate says on its own (year, county), and with a lookup service the car itself. Staff only, in the
// dashboard (Add a car, #103; a lead): the website has no lookup (#182).
export type CarFound = { make: string; model: string; fuel?: Fuel; engineLitres?: number; colour?: string; bodyType?: string };
// `limited`: the dealer's monthly limit for lookups is reached (#181), so only the plate's own facts came back.
export type RegLookup = RegFacts & { car?: CarFound; limited?: true };

// One Auto (on Cartell in Ireland, src/lib/vehicle-data/one-auto.ts) is the service, as for the history check (#2, #170). Each real
// lookup costs money: a plate looked up in the last 30 days is answered from the cache, free; anything else goes through the dealer's
// monthly limit (`meter`). Past it, or when the service fails, the answer is the plate's own facts and staff type the rest.
// Simulated (the demo): a sample car from the demo stock, the same for the same plate every time. Off: only the plate's facts.
type Cached = { id: string; car: CarFound | null; at: number };
export const regCache = defineCollection<Cached>("reg-cache", () => []);

// `meter`: the dealer's monthly limit and count (src/lib/billing/usage.ts): asked before a lookup that costs money (or would, on the
// demo), counted after it. A cached answer is free, so it is given even past the limit and never counted. Past the limit the answer is
// the plate's own facts, marked `limited`.
type Meter = { allowed(): Promise<boolean>; paid(): Promise<void> };
export async function lookupReg(raw: string, service: (reg: string) => Promise<CarFound | null> = carByReg, meter?: Meter): Promise<RegLookup | null> {
  const facts = parseIrishReg(raw);
  if (!facts) return null;
  const mode = await modeOf("reglookup");
  if (mode === "off") return facts;

  const now = Date.now();
  const simulated = mode === "simulated";
  // The demo has no cache (its answer is made up, the same each time), but it counts against the monthly limit like a real lookup.
  const hit = simulated ? undefined : await regCache.get(facts.reg);
  if (hit && hit.at > now - REG_CACHE_DAYS * DAY) return hit.car ? { ...facts, car: hit.car } : facts;
  if (meter && !(await meter.allowed())) return { ...facts, limited: true };
  if (simulated) {
    await meter?.paid();
    return { ...facts, car: sampleCar(facts.reg) };
  }
  let car: CarFound | null;
  try {
    car = await service(facts.reg);
  } catch {
    return facts; // a failed lookup is not cached, and never stops the form
  }
  await meter?.paid();
  await regCache.put({ id: facts.reg, car, at: now });
  return car ? { ...facts, car } : facts;
}

// One of the demo cars, picked by the plate, so a plate always gives the same car.
function sampleCar(reg: string): CarFound {
  const cars = demoCars as Car[];
  let h = 0;
  for (const ch of reg) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = cars[h % cars.length];
  return { make: c.make, model: c.model, fuel: c.fuel, engineLitres: c.engineLitres, colour: c.colour, bodyType: c.bodyType };
}
