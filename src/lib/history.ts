import "server-only";
import { defineCollection } from "@/lib/admin/docs";
import { dublinDay } from "@/lib/admin/format";
import { mockHistory, type VehicleHistory } from "@/lib/history-rules";
import { modeOf } from "@/lib/integrations";
import { parseIrishReg } from "@/lib/reg";
import { DAY } from "@/lib/time";
import { historyByReg } from "@/lib/vehicle-data/one-auto";

// The vehicle history check (#170), beside the registration lookup and through the same provider and service ("reglookup": One Auto,
// src/lib/vehicle-data/one-auto.ts). A paid use: a plate checked in the last HISTORY_CACHE_DAYS is answered from the cache, free, even past
// the limit; otherwise `meter` is asked first and counted after a check that came back. Simulated (the demo, dev, E2E): mockHistory, cached
// and metered the same way. Off (no key): nothing. The plate is never logged.
export const HISTORY_CACHE_DAYS = 30;
export const historyCache = defineCollection<{ id: string; history: VehicleHistory; at: number }>("history-cache", () => []);
// A car in stock's last check, by the car's id (synced stock is rewritten by the sync, so it is kept beside it). A lead's is on the lead,
// a sale's trade-in's on the sale, so each goes with its record.
export const carHistoryStore = defineCollection<{ id: string; history: VehicleHistory }>("car-history", () => []);

export type HistoryAnswer = { history: VehicleHistory; cached?: true } | { error: "bad-reg" | "off" | "limited" | "unknown" | "failed" };
type Meter = { allowed(): Promise<boolean>; paid(): Promise<void> };

export async function checkHistory(raw: string, meter: Meter, service: (reg: string) => Promise<VehicleHistory | null | "not-installed"> = historyByReg, now = Date.now()): Promise<HistoryAnswer> {
  const facts = parseIrishReg(raw);
  if (!facts) return { error: "bad-reg" };
  const mode = await modeOf("reglookup");
  if (mode === "off") return { error: "off" };
  const hit = await historyCache.get(facts.reg);
  if (hit && hit.at > now - HISTORY_CACHE_DAYS * DAY) return { history: hit.history, cached: true };
  if (!(await meter.allowed())) return { error: "limited" };
  let history: VehicleHistory | null | "not-installed";
  try {
    history = mode === "simulated" ? mockHistory(facts.reg, dublinDay(now)) : await service(facts.reg);
  } catch {
    return { error: "failed" }; // a failed check is neither paid nor cached
  }
  if (history === "not-installed") return { error: "failed" };
  if (!history) return { error: "unknown" };
  await meter.paid();
  await historyCache.put({ id: facts.reg, history, at: now });
  return { history };
}
