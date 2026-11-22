import { describe, expect, it } from "vitest";
import type { Car } from "@/lib/stock/types";
import { JOURNEY_MAX_BYTES, closestCars, parseJourney, toolLines, visitCars, visitPattern, wantOf, type Journey } from "./journey";

const journey = (over: Partial<Journey> = {}): Journey => ({
  v: 1,
  minutes: 12,
  cars: [{ id: "4508173", views: 3 }],
  searches: [{ make: "toyota", body: "suv", gearbox: "automatic", priceBand: "20k-30k", fuel: "hybrid", condition: "used" }],
  tools: { finance: { monthlyEur: 320 }, tradeIn: true, saved: 2, compared: 3 },
  ...over,
});

let n = 0;
const car = (over: Partial<Car>): Car => {
  const id = String(1000 + n++);
  return { id, slug: `x-y-2020-${id}`, make: "Toyota", makeSlug: "toyota", model: "RAV4", modelSlug: "rav4", year: 2020, priceEur: 25000, photos: [], ...over };
};

describe("parseJourney", () => {
  it("takes the contract as written", () => {
    expect(parseJourney(journey())).toEqual(journey());
    expect(parseJourney(journey({ cars: [], searches: [], tools: {} }))).toBeDefined();
  });

  it("drops a missing, malformed or unknown-version journey", () => {
    expect(parseJourney(undefined)).toBeUndefined();
    expect(parseJourney("a string")).toBeUndefined();
    expect(parseJourney({ ...journey(), v: 2 })).toBeUndefined(); // a version this app does not know
    expect(parseJourney({ ...journey(), page: "/used-cars" })).toBeUndefined(); // an unknown key
    expect(parseJourney(journey({ tools: { finance: { monthlyEur: 320 }, note: "hi" } as never }))).toBeUndefined();
    expect(parseJourney(journey({ searches: [{ make: "Toyota" }] }))).toBeUndefined(); // not a slug
    expect(parseJourney(journey({ searches: [{ make: "toyota corolla" }] }))).toBeUndefined();
    expect(parseJourney(journey({ searches: [{ model: "a".repeat(41) }] }))).toBeUndefined();
    expect(parseJourney(journey({ searches: [{ fuel: "steam" as never }] }))).toBeUndefined();
    expect(parseJourney(journey({ cars: [{ id: "https://x.ie", views: 1 }] }))).toBeUndefined();
    expect(parseJourney(journey({ cars: [{ id: "1", views: 100 }] }))).toBeUndefined();
    expect(parseJourney(journey({ minutes: 241 }))).toBeUndefined();
    expect(parseJourney(journey({ minutes: 1.5 }))).toBeUndefined();
    expect(parseJourney(journey({ tools: { finance: { monthlyEur: 5001 } } }))).toBeUndefined();
    expect(parseJourney(journey({ cars: Array.from({ length: 13 }, (_, i) => ({ id: String(i), views: 1 })) }))).toBeUndefined();
    expect(parseJourney(journey({ searches: Array.from({ length: 9 }, () => ({ make: "toyota" })) }))).toBeUndefined();
  });

  it("drops one over 4 KB; the largest v1 can be is well under it", () => {
    const largest = journey({
      minutes: 240,
      cars: Array.from({ length: 12 }, (_, i) => ({ id: String(1e11 + i), views: 99 })),
      searches: Array.from({ length: 8 }, () => ({ make: "a".repeat(40), model: "b".repeat(40), body: "c".repeat(40), fuel: "plug-in-hybrid" as const, gearbox: "automatic" as const, priceBand: "under-10k" as const, condition: "commercial" as const })),
      tools: { finance: { monthlyEur: 5000 }, tradeIn: true, saved: 99, compared: 99 },
    });
    expect(JSON.stringify(largest).length).toBeLessThan(JOURNEY_MAX_BYTES);
    expect(parseJourney(largest)).toEqual(largest);
    expect(parseJourney({ ...journey(), cars: Array.from({ length: 400 }, (_, i) => ({ id: String(i), views: 1 })) })).toBeUndefined();
  });
});

describe("visitPattern", () => {
  const suvs = [car({ bodySlug: "suv", bodyType: "SUV", priceEur: 22000, gearbox: "automatic", fuel: "diesel" }), car({ bodySlug: "suv", bodyType: "SUV", priceEur: 27000, gearbox: "automatic", fuel: "diesel" }), car({ make: "Kia", makeSlug: "kia", bodySlug: "suv", bodyType: "SUV", priceEur: 29000, gearbox: "automatic", fuel: "hybrid" })];

  it("says what most of what they opened and searched shares", () => {
    expect(visitPattern(suvs, [{ priceBand: "20k-30k", body: "suv" }], suvs)).toBe("Mostly Toyota SUVs, €20k to €30k, automatic, diesel");
  });

  it("names two fuels when the two cover everything, and leaves out what is split", () => {
    const mixed = [car({ makeSlug: "kia", fuel: "diesel", gearbox: "manual", priceEur: 9000 }), car({ makeSlug: "ford", fuel: "hybrid", gearbox: "automatic", priceEur: 45000 })];
    expect(visitPattern(mixed, [], mixed)).toBe("Mostly diesel or hybrid");
  });

  it("calls nothing a pattern from one car, or from nothing shared", () => {
    expect(visitPattern(suvs.slice(0, 1), [], suvs)).toBeNull();
    expect(visitPattern([], [{ make: "toyota" }], suvs)).toBeNull();
    const apart = [car({ makeSlug: "kia", fuel: "diesel", priceEur: 9000 }), car({ makeSlug: "ford", fuel: "petrol", priceEur: 45000 }), car({ makeSlug: "bmw", fuel: "electric", priceEur: 60000 })];
    expect(visitPattern(apart, [], apart)).toBeNull();
  });

  it("reads searches alone, with readable words for slugs the stock does not have", () => {
    expect(visitPattern([], [{ body: "mpv", priceBand: "under-10k" }, { body: "mpv" }], [])).toBe("Mostly MPVs, under €10k");
  });
});

describe("closestCars", () => {
  const sold = car({ bodySlug: "suv", priceEur: 25000, soldAt: "2026-01-01" });
  const stock = [
    car({ bodySlug: "suv", priceEur: 24000, makeSlug: "kia" }), // body and band
    car({ bodySlug: "suv", priceEur: 26000 }), // body, band and make
    car({ bodySlug: "suv", priceEur: 45000 }), // body and make
    car({ bodySlug: "hatchback", priceEur: 25000, makeSlug: "ford" }), // band only
    car({ bodySlug: "hatchback", priceEur: 60000, makeSlug: "toyota" }), // make only: not close enough
    sold,
  ];
  const forSale = (c: Car) => !c.soldAt;

  it("picks the same body and band first, then the make, then the nearest price; never a sold car", () => {
    const got = closestCars(stock, { body: "suv", band: "20k-30k", make: "toyota", priceEur: 25000 }, forSale);
    expect(got.map((c) => c.id)).toEqual([stock[1].id, stock[0].id, stock[2].id]);
    expect(got).not.toContain(sold);
  });

  it("skips the car they asked about, and finds nothing for nothing wanted", () => {
    expect(closestCars(stock, { body: "suv", band: "20k-30k", make: "toyota" }, forSale, [stock[1].id]).map((c) => c.id)).not.toContain(stock[1].id);
    expect(closestCars(stock, {}, forSale)).toEqual([]);
  });

  it("wants what the asked car is, or else what the visit points to", () => {
    expect(wantOf(stock[1], [], [])).toEqual({ body: "suv", band: "20k-30k", make: "toyota", priceEur: 26000 });
    expect(wantOf(undefined, [stock[0], stock[1]], [{ body: "suv" }])).toMatchObject({ body: "suv", band: "20k-30k", priceEur: 26000 });
  });
});

describe("the visit's cars and tools", () => {
  it("marks the car they asked about, and names a gone car only when the lead does", () => {
    const here = car({});
    const j = journey({ cars: [{ id: "77", views: 2 }, { id: here.id, views: 1 }, { id: "88", views: 1 }] });
    const got = visitCars(j, [here], { carSlug: "ford-focus-2019-77", carTitle: "2019 Ford Focus" });
    expect(got.map((v) => [v.asked, v.name])).toEqual([[true, "2019 Ford Focus"], [false, "2020 Toyota RAV4"], [false, undefined]]);
  });

  it("says what else they used, in plain words", () => {
    expect(toolLines(journey().tools)).toEqual(["Tried the finance calculator: €320 a month", "Started a trade-in", "Saved 2 cars", "Compared 3 cars"]);
    expect(toolLines({ finance: {}, saved: 1, compared: 0 })).toEqual(["Tried the finance calculator", "Saved 1 car"]);
  });
});
