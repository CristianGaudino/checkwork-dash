import { describe, expect, it, vi } from "vitest";
import { carRaceCases } from "@/test/car-race-cases";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: () => null }) }));

// With no D1 (next dev, the E2E run): the dealer's cars in memory.
describe("changing a car while others do (in memory)", () => carRaceCases());

describe("freeCarId", () => {
  it("never hands out an id a lead or its visit note still names, so an old lead can't point at a new car", async () => {
    const { freeCarId } = await import("./stock-admin");
    const { leadsStore } = await import("./collections");
    const seeded = (await leadsStore.list())[0];
    const above = Number(await freeCarId());
    await leadsStore.put({ ...seeded, id: "lead-deleted-car", carSlug: `ford-focus-2019-${above + 5}` });
    expect(Number(await freeCarId())).toBe(above + 6);
    await leadsStore.put({ ...seeded, id: "lead-viewed-car", journey: { v: 1, minutes: 3, cars: [{ id: String(above + 9), views: 1 }], searches: [], tools: {} } });
    expect(Number(await freeCarId())).toBe(above + 10);
  });
  it("never hands out an id a test drive still names", async () => {
    const { freeCarId } = await import("./stock-admin");
    const { drivesStore } = await import("./collections");
    const above = Number(await freeCarId());
    await drivesStore.put({ ...(await drivesStore.list())[0], id: "drive-deleted-car", carSlug: `ford-focus-2019-${above + 5}` });
    expect(Number(await freeCarId())).toBe(above + 6);
  });
  it("never hands out an id a post or a library photo still names", async () => {
    const { freeCarId } = await import("./stock-admin");
    const { mediaStore, postsStore } = await import("./collections");
    const above = Number(await freeCarId());
    await postsStore.put({ id: "post-deleted-car", network: "Facebook", carSlug: `ford-focus-2019-${above + 5}`, text: "x", status: "posted", postedAt: 1, createdAt: 1 });
    expect(Number(await freeCarId())).toBe(above + 6);
    await mediaStore.put({ id: "media-deleted-car", kind: "image", src: "/x.jpg", name: "x.jpg", bytes: 1, carSlug: `ford-focus-2019-${above + 8}`, createdAt: 1 });
    expect(Number(await freeCarId())).toBe(above + 9);
  });
});
