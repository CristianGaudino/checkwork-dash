import type { Lead, StockAlert } from "./collections";
import { FILTER_NAMES } from "@/lib/owner-api/counter-rules";
import { CHANNELS, CHANNEL_LABELS, PRICE_BANDS, PRICE_BAND_LABELS, missedMakeLabel } from "@/lib/visit-rules";

// The real-site Analytics figures (#12), from the site's own anonymous counts (src/lib/owner-api/counters.ts), the leads and the stock
// alerts. Pure, so every figure is tested. The demo shows generated figures instead (./analytics.ts).
const FILTER_LABELS: Record<(typeof FILTER_NAMES)[number], string> = { make: "Make", model: "Model", body: "Body type", fuel: "Fuel", price: "Price", year: "Year", km: "Mileage", gearbox: "Gearbox" };

type Row = { label: string; value: number };
const byValue = (a: Row, b: Row) => b.value - a.value;

export function visitorFigures(input: { counts: Record<string, number>; leads: Pick<Lead, "type" | "source" | "channel">[]; alerts: Pick<StockAlert, "kind" | "criteria" | "active">[] }) {
  const { counts } = input;
  const n = (event: string) => counts[event] ?? 0;
  const web = input.leads.filter((l) => l.source === "Website");

  // A website lead with no channel came before tracking, or from a browser that keeps nothing for the visit.
  const channels = CHANNELS.map((c) => ({ channel: c, visits: n(`visit:${c}`), leads: web.filter((l) => l.channel === CHANNEL_LABELS[c]).length }));
  const unknown = web.filter((l) => !l.channel || !channels.some((c) => CHANNEL_LABELS[c.channel] === l.channel)).length;
  const visits = channels.reduce((s, c) => s + c.visits, 0);

  const missedMakes = Object.entries(counts)
    .filter(([k]) => k.startsWith("missed:"))
    .map(([k, value]) => ({ label: missedMakeLabel(k.slice(7)), value }))
    .sort(byValue);

  const perCar = new Map<string, number>();
  for (const a of input.alerts) if (a.active && a.kind !== "new-arrival") perCar.set(a.criteria, (perCar.get(a.criteria) ?? 0) + 1);

  return {
    totals: { visits, leads: web.length, conversion: visits ? (web.length / visits) * 100 : 0 },
    channels, // every channel, for Where visits come from (src/lib/admin/visit-sources.ts)
    unknownLeads: unknown, // website leads with no channel
    noResults: { count: n("no-results"), makes: missedMakes },
    filters: FILTER_NAMES.map((f) => ({ label: FILTER_LABELS[f], value: n(`filter:${f}`) })).filter((r) => r.value).sort(byValue),
    bands: PRICE_BANDS.map((b) => ({ label: PRICE_BAND_LABELS[b], value: n(`band:${b}`) })).filter((r) => r.value), // in price order
    finance: { calculator: n("finance"), applications: web.filter((l) => l.type === "finance").length },
    alertsPerCar: [...perCar].map(([label, value]) => ({ label, value })).sort(byValue).slice(0, 8),
  };
}
