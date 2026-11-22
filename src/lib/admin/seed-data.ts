import demoCars from "@/lib/stock/demo-cars.json";
import type { Car } from "@/lib/stock/types";
import { carBand, type Journey } from "@/lib/leads/journey";

// Made-up records for the dealer admin. Everything here is invented: names, emails (example.com is reserved for this),
// numbers and figures. Times are relative to "now" when a collection is first read, so the demo always looks current.
const cars = demoCars as Car[];
const live = cars.filter((c) => !c.soldAt);

// A small seeded random generator (mulberry32), so a seed gives the same records every time it runs.
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
  };
}

const FIRST = ["Aoife", "Ciaran", "Niamh", "Sean", "Orla", "Conor", "Saoirse", "Darragh", "Roisin", "Eoin", "Grainne", "Fionn", "Maeve", "Cathal", "Sinead", "Tadhg", "Aisling", "Rory", "Clodagh", "Donal", "Una", "Padraig", "Eimear", "Colm"];
const LAST = ["Brennan", "Doyle", "Kavanagh", "Lynch", "Murphy", "Nolan", "O'Brien", "Quinn", "Ryan", "Walsh", "Byrne", "Fitzgerald", "Gallagher", "Hegarty", "Keane", "McCarthy", "Sheehan", "Foley", "Daly", "Moran"];


export function person(r: ReturnType<typeof rng>) {
  const first = r.pick(FIRST);
  const last = r.pick(LAST);
  const email = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com";
  const phone = `+353 83 000 ${String(r.int(1000, 9999))}`;
  return { name: `${first} ${last}`, email, phone };
}

export const carTitleOf = (c: Car) => `${c.year} ${c.make} ${c.model}`;
export const livePicks = (r: ReturnType<typeof rng>) => r.pick(live);

// A visit note as a dealer's website sends it (#34), for a few of the demo's website leads: the car they asked about opened a few times, a few
// like it, the searches that led there and a tool or two. `askedSlug`: the lead's car; none for a message sent from the contact page.
export function demoJourney(seed: number, askedSlug?: string): Journey {
  const r = rng(seed);
  const asked = live.find((c) => c.slug === askedSlug);
  const base = asked ?? r.pick(live);
  const like = live.filter((c) => c.id !== base.id && c.bodySlug === base.bodySlug);
  const seen = [...new Set(Array.from({ length: Math.min(3, like.length) }, () => r.pick(like)))];
  const band = carBand(base);
  return {
    v: 1,
    minutes: r.int(4, 26),
    cars: [
      ...(asked ? [{ id: asked.id, views: r.int(2, 5) }] : []),
      ...seen.map((c) => ({ id: c.id, views: r.int(1, 2) })),
      ...(seed % 2 === 1 ? [{ id: "999999", views: 1 }] : []), // a car sold and gone from the stock since
    ],
    searches: [
      { ...(base.bodySlug && { body: base.bodySlug }), ...(band && { priceBand: band }), ...(base.gearbox && { gearbox: base.gearbox }) },
      ...(seed % 3 !== 0 ? [{ make: base.makeSlug }] : []),
    ],
    tools: {
      ...(seed % 2 === 1 && { finance: { monthlyEur: 50 * Math.round((base.priceEur / 60) / 50) } }),
      ...(seed % 3 === 0 && { tradeIn: true }),
      saved: r.int(0, 3),
      ...(seed % 2 === 0 && { compared: 2 }),
    },
  };
}
