import { z } from "zod";
import { CONDITIONS, FUELS, GEARBOXES, type Car } from "@/lib/stock/types";
import { PRICE_BANDS, bandOf, type PriceBand } from "@/lib/visit-rules";

// The visit note (#34): what a person did on the dealer's website during the visit they sent an enquiry from, sent with the enquiry only when
// they turned the switch on. The contract is shared with the website (checkwork-demo#249, docs/site-api.md): fixed values only, no free
// text, no URLs, nothing about the device. Plain functions, so the panel, the AI brief and the tests share them.

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);
const count = z.number().int().min(0).max(99);
// v1, exactly. A later version adds a field and bumps `v`: until this file knows it, it is dropped like any other bad journey.
export const journeySchema = z.strictObject({
  v: z.literal(1),
  minutes: z.number().int().min(0).max(240),
  cars: z.array(z.strictObject({ id: z.string().regex(/^\d{1,12}$/), views: z.number().int().min(1).max(99) })).max(12),
  searches: z
    .array(
      z.strictObject({
        make: slug.optional(),
        model: slug.optional(),
        body: slug.optional(),
        fuel: z.enum(FUELS).optional(),
        gearbox: z.enum(GEARBOXES).optional(),
        priceBand: z.enum(PRICE_BANDS).optional(),
        condition: z.enum(CONDITIONS).optional(),
      }),
    )
    .max(8),
  tools: z.strictObject({
    finance: z.strictObject({ monthlyEur: z.number().int().min(0).max(5000).optional() }).optional(),
    tradeIn: z.boolean().optional(),
    saved: count.optional(),
    compared: count.optional(),
  }),
});
export type Journey = z.infer<typeof journeySchema>;
export type JourneySearch = Journey["searches"][number];
export const JOURNEY_MAX_BYTES = 4096;

// The journey as sent, or undefined when it is missing, over 4 KB, malformed or of a version this app does not know. Never a throw: a lead is
// never refused over its history (docs/site-api.md).
export function parseJourney(raw: unknown): Journey | undefined {
  if (raw === undefined) return undefined;
  if (new TextEncoder().encode(JSON.stringify(raw)).length > JOURNEY_MAX_BYTES) return undefined;
  const parsed = journeySchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

// Words for the fixed values: the dealer's own label from their stock when a car has it, else the slug made readable.
const readable = (s: string) => (s.length <= 3 ? s.toUpperCase() : s.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" "));
export const makeLabel = (s: string, stock: Car[]) => stock.find((c) => c.makeSlug === s)?.make ?? readable(s);
export const modelLabel = (s: string, stock: Car[]) => stock.find((c) => c.modelSlug === s)?.model ?? readable(s);
export const bodyLabel = (s: string, stock: Car[]) => stock.find((c) => c.bodySlug === s)?.bodyType ?? readable(s);
const BAND_SHORT: Record<PriceBand, string> = { "under-10k": "under €10k", "10k-20k": "€10k to €20k", "20k-30k": "€20k to €30k", "30k-50k": "€30k to €50k", "over-50k": "over €50k" };
const FUEL_WORDS: Record<(typeof FUELS)[number], string> = { petrol: "petrol", diesel: "diesel", hybrid: "hybrid", "plug-in-hybrid": "plug-in hybrid", electric: "electric", other: "other fuel" };
export const carBand = (c: Pick<Car, "priceEur">): PriceBand | undefined => (c.priceEur > 0 ? (bandOf({ priceMax: c.priceEur }) ?? undefined) : undefined);

// One search as chips' words: "Toyota RAV4", "SUV", "Automatic", "€20k to €30k".
export function searchWords(s: JourneySearch, stock: Car[]): string[] {
  const car = [s.make && makeLabel(s.make, stock), s.model && modelLabel(s.model, stock)].filter(Boolean).join(" ");
  const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
  return [s.condition === "new" ? "New" : s.condition === "commercial" ? "Commercial" : "", car, s.body && bodyLabel(s.body, stock), s.fuel && cap(FUEL_WORDS[s.fuel]), s.gearbox && cap(s.gearbox), s.priceBand && cap(BAND_SHORT[s.priceBand])].filter((w): w is string => Boolean(w));
}

// What else they used, in a line each.
export function toolLines(t: Journey["tools"]): string[] {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  return [
    t.finance && (t.finance.monthlyEur ? `Tried the finance calculator: €${t.finance.monthlyEur.toLocaleString("en-IE")} a month` : "Tried the finance calculator"),
    t.tradeIn && "Started a trade-in",
    t.saved ? `Saved ${n(t.saved, "car")}` : "",
    t.compared ? `Compared ${n(t.compared, "car")}` : "",
  ].filter((l): l is string => Boolean(l));
}

export const minutesText = (m: number) => (m < 1 ? "Under a minute" : m === 1 ? "1 minute" : m >= 240 ? "4 hours or more" : `${m} minutes`);

// What the visit points to: the make, body, price band, gearbox and fuel most of what they opened and searched share. Each car opened counts
// once (a car opened ten times is still one car), each search once. A value is kept when it is more than half of what was seen for it.
export type Profile = { make?: string; body?: string; band?: PriceBand; gearbox?: string; fuels: string[] };
export function visitProfile(viewed: Car[], searches: JourneySearch[]): Profile {
  const signals = [
    ...viewed.map((c) => ({ make: c.makeSlug, body: c.bodySlug, band: carBand(c), gearbox: c.gearbox, fuel: c.fuel })),
    ...searches.map((s) => ({ make: s.make, body: s.body, band: s.priceBand, gearbox: s.gearbox, fuel: s.fuel })),
  ];
  const ranked = (k: keyof (typeof signals)[number]) => {
    const t = new Map<string, number>();
    for (const s of signals) if (s[k]) t.set(s[k], (t.get(s[k]) ?? 0) + 1);
    const all = [...t].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { all, total: all.reduce((n, [, c]) => n + c, 0) };
  };
  const most = (k: keyof (typeof signals)[number]) => {
    const { all, total } = ranked(k);
    return all[0] && all[0][1] * 2 > total ? all[0][0] : undefined;
  };
  // Fuel: one, or two when the two cover everything ("diesel or hybrid").
  const f = ranked("fuel");
  const fuels = f.all[0] && f.all[0][1] * 2 > f.total ? [f.all[0][0]] : f.all.length === 2 ? f.all.map(([k]) => k) : [];
  return { make: most("make"), body: most("body"), band: most("band") as PriceBand | undefined, gearbox: most("gearbox"), fuels };
}

// The pattern in plain words, "Mostly Toyota SUVs, €20k to €30k, automatic, diesel", or null when there is too little to call it a pattern
// (under two cars and searches in all) or nothing shared.
export function visitPattern(viewed: Car[], searches: JourneySearch[], stock: Car[]): string | null {
  if (viewed.length + searches.length < 2) return null;
  const p = visitProfile(viewed, searches);
  const body = p.body && bodyLabel(p.body, stock);
  const kind = [p.make && makeLabel(p.make, stock), body && (body.endsWith("s") ? body : `${body}s`)].filter(Boolean).join(" ");
  const parts = [kind, p.band && BAND_SHORT[p.band], p.gearbox, p.fuels.map((x) => FUEL_WORDS[x as keyof typeof FUEL_WORDS] ?? x).join(" or ")].filter(Boolean);
  return parts.length ? `Mostly ${parts.join(", ")}` : null;
}

// The cars to have ready: up to `n` for sale, closest to what they want. The same body type and price band first, then the same make, then
// the nearest price. A car must share the body or the band at least. `skip`: ids not to offer (the car they asked about).
export type Want = { body?: string; band?: PriceBand; make?: string; priceEur?: number };
export function closestCars(stock: Car[], want: Want, isForSale: (c: Car) => boolean, skip: string[] = [], n = 3): Car[] {
  const score = (c: Car) => (want.body && c.bodySlug === want.body ? 2 : 0) + (want.band && carBand(c) === want.band ? 2 : 0) + (want.make && c.makeSlug === want.make ? 1 : 0);
  const gap = (c: Car) => (want.priceEur ? Math.abs(c.priceEur - want.priceEur) : 0);
  return stock
    .filter((c) => isForSale(c) && !skip.includes(c.id) && score(c) >= 2)
    .sort((a, b) => score(b) - score(a) || gap(a) - gap(b) || a.id.localeCompare(b.id))
    .slice(0, n);
}

// What the brief should look for: the car they asked about when it is in stock, else the pattern of the visit.
export function wantOf(asked: Car | undefined, viewed: Car[], searches: JourneySearch[]): Want {
  if (asked) return { body: asked.bodySlug, band: carBand(asked), make: asked.makeSlug, priceEur: asked.priceEur || undefined };
  const p = visitProfile(viewed, searches);
  const prices = viewed.map((c) => c.priceEur).filter((x) => x > 0).sort((a, b) => a - b);
  return { body: p.body, band: p.band, make: p.make, priceEur: prices[Math.floor(prices.length / 2)] };
}

// A car of the visit is the one they asked about when the lead's car page (`…-<id>`) is that car's.
export const isAsked = (carSlug: string | undefined, id: string) => Boolean(carSlug?.endsWith(`-${id}`));

// The cars of the visit against the dealer's stock: the car when it is still there, whether it is the one they asked about, and a name when
// one is known (a car gone from the stock keeps the lead's own title if it is the one they asked about).
export type VisitCar = { id: string; views: number; car?: Car; asked: boolean; name?: string };
export function visitCars(j: Journey, stock: Car[], lead: { carSlug?: string; carTitle?: string }): VisitCar[] {
  return j.cars.map(({ id, views }) => {
    const car = stock.find((c) => c.id === id);
    const asked = isAsked(lead.carSlug, id);
    return { id, views, car, asked, name: car ? `${car.year} ${car.make} ${car.model}` : asked ? lead.carTitle : undefined };
  });
}

// The visit as the lead page and the AI brief read it: the cars, the ones still in stock, the pattern, the searches as words and the tools.
export function readVisit(j: Journey, stock: Car[], lead: { carSlug?: string; carTitle?: string }) {
  const cars = visitCars(j, stock, lead);
  const viewed = cars.flatMap((v) => (v.car ? [v.car] : []));
  return { cars, viewed, pattern: visitPattern(viewed, j.searches, stock), searches: j.searches.map((s) => searchWords(s, stock)).filter((w) => w.length), tools: toolLines(j.tools) };
}
