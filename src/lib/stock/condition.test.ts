import { describe, expect, it } from "vitest";
import extra from "./demo-cars-extra.json";
import { createStockEngine } from "./engine";
import { DEFAULT_QUERY } from "./query";
import { CONDITIONS, type Car } from "./types";

const car = (id: string, o: Partial<Car> = {}): Car => ({ id, slug: `make-model-2020-${id}`, make: "Make", makeSlug: "make", model: "Model", modelSlug: "model", year: 2020, priceEur: 10000, photos: [], ...o });
const engine = createStockEngine([car("1"), car("2", { condition: "used" }), car("4", { condition: "commercial", vat: "ex", make: "Ford", makeSlug: "ford" })], { soldDays: 30 });
const ids = async (condition?: Car["condition"]) => (await engine.query({ ...DEFAULT_QUERY, condition })).cars.map((c) => c.id).sort();

describe("stock condition", () => {
  it("is used or commercial only: the dealer sells no new vehicles (#188)", () => {
    expect([...CONDITIONS]).toEqual(["used", "commercial"]);
  });
  it("lists used cars by default, and commercials only when asked", async () => {
    expect(await ids()).toEqual(["1", "2"]);
    expect(await ids("commercial")).toEqual(["4"]);
  });
  it("still opens any car by its link, whatever its kind", async () => {
    expect((await engine.getBySlug("make-model-2020-4"))?.id).toBe("4");
    expect((await engine.lookup("make-model-2020-4"))?.state).toBe("live");
  });
  it("keeps commercials out of the make list the used pages use", async () => {
    expect((await engine.taxonomy()).makes.map((m) => m.slug)).toEqual(["make"]);
  });
  it("facets on a kind count only that kind", async () => {
    const r = await engine.query({ ...DEFAULT_QUERY, condition: "commercial" });
    expect(r.facets.make.map((m) => [m.value, m.count])).toEqual([["ford", 1]]);
  });
});

describe("the demo's extra cars and commercials", () => {
  const cars = extra as Car[];
  it("have unique digit ids and slugs that end in them", () => {
    expect(new Set(cars.map((c) => c.id)).size).toBe(cars.length);
    for (const c of cars) expect(c.slug.endsWith(`-${c.id}`) && /^\d+$/.test(c.id)).toBe(true);
  });
  it("are used stock: a kind from the list, one to three owners, real mileage, nothing sold new", () => {
    for (const c of cars) {
      expect(CONDITIONS, c.slug).toContain(c.condition ?? "used");
      expect(c.owners, c.slug).toBeGreaterThanOrEqual(1);
      expect(c.owners, c.slug).toBeLessThanOrEqual(3);
      expect(c.mileageKm, c.slug).toBeGreaterThan(10_000);
      expect(JSON.stringify(c), c.slug).not.toMatch(/manufacturer|delivery mileage/i);
    }
  });
  it("every commercial says its price is without VAT", () => {
    const vans = cars.filter((c) => c.condition === "commercial");
    expect(vans).toHaveLength(6);
    expect(vans.every((v) => v.vat === "ex" && ["van", "pickup"].includes(v.bodySlug!))).toBe(true);
    expect(cars.filter((c) => c.wasPriceEur !== undefined).every((c) => c.wasPriceEur! > c.priceEur)).toBe(true);
  });
});
