import { expect, it } from "vitest";
import type { Car } from "@/lib/stock/types";

// What dealer A keeps is never seen, changed or removed as dealer B. Run twice: in memory (src/lib/tenancy/separation.test.ts, next dev and
// the E2E run) and on the D1 path with a SQLite database per dealer (separation.int.test.ts, the Worker). The caller mocks the request side
// so that outside runAsDealer nobody is signed in at any dealer.
const A = "checkwork-motors";
const B = "test-motors";
const car = (id: string): Car => ({ id, slug: `make-model-2020-${id}`, make: "Make", makeSlug: "make", model: "Model", modelSlug: "model", year: 2020, priceEur: 5000, photos: [] });

export function separationCases() {
  it("a record written as one dealer is not listed, got, changed or removed as another", async () => {
    const { defineCollection } = await import("@/lib/admin/docs");
    const { runAsDealer } = await import("@/lib/tenancy/current");
    const c = defineCollection<{ id: string; n: number }>("separation-records", () => []);
    await runAsDealer(A, () => c.put({ id: "x", n: 1 }));
    await runAsDealer(B, async () => {
      expect(await c.list()).toEqual([]);
      expect(await c.get("x")).toBeUndefined();
      expect(await c.update("x", (d) => ({ ...d, n: 2 }))).toBeUndefined();
      await c.remove("x");
      await c.put({ id: "x", n: 9 }); // B's own record under the same id
    });
    await runAsDealer(A, async () => expect(await c.list()).toEqual([{ id: "x", n: 1 }]));
    await runAsDealer(B, async () => expect(await c.list()).toEqual([{ id: "x", n: 9 }]));
  });

  it("gives the demo dealer its made-up records and a dealer that is not a demo none", async () => {
    const { leadsStore } = await import("@/lib/admin/collections");
    const { runAsDealer } = await import("@/lib/tenancy/current");
    expect((await runAsDealer(A, () => leadsStore.list())).length).toBeGreaterThan(10);
    expect(await runAsDealer(B, () => leadsStore.list())).toEqual([]);
  });

  it("keeps each dealer's stock apart, in the dashboard and on the dealer's own stock reads", async () => {
    const { adminCar, adminCars, removeCar, saveCar } = await import("@/lib/admin/stock-admin");
    const { stock } = await import("@/lib/stock");
    const { runAsDealer } = await import("@/lib/tenancy/current");
    await runAsDealer(A, () => saveCar(car("990001")));
    await runAsDealer(B, async () => {
      expect((await adminCars()).map((c) => c.id)).not.toContain("990001");
      expect(await stock.getById("990001")).toBeNull();
      await removeCar("990001"); // not B's: nothing happens to A's
      await saveCar(car("990002"));
    });
    await runAsDealer(A, async () => {
      expect(await adminCar("990001")).toMatchObject({ id: "990001" });
      expect(await stock.getById("990001")).toMatchObject({ id: "990001" });
      expect(await adminCar("990002")).toBeUndefined();
    });
  });

  it("keeps each dealer's activity history apart", async () => {
    const { listActivity, logActivity } = await import("@/lib/admin/activity");
    const { runAsDealer } = await import("@/lib/tenancy/current");
    await runAsDealer(A, () => logActivity("stock", "Changed the price of A's car", undefined, "Someone at A"));
    await runAsDealer(B, () => logActivity("stock", "Changed the price of B's car", undefined, "Someone at B"));
    const summaries = async (id: string) => (await runAsDealer(id, () => listActivity({}, 1, 500))).rows.map((r) => r.summary);
    expect(await summaries(A)).toContain("Changed the price of A's car");
    expect(await summaries(A)).not.toContain("Changed the price of B's car");
    expect(await summaries(B)).toEqual(["Changed the price of B's car"]); // a real dealer's history starts empty
  });

  it("with no current dealer, every store refuses rather than guess one", async () => {
    const { leadsStore } = await import("@/lib/admin/collections");
    const { adminCars } = await import("@/lib/admin/stock-admin");
    const { listActivity } = await import("@/lib/admin/activity");
    const { stock } = await import("@/lib/stock");
    const { currentDealer, dealerBucket } = await import("@/lib/tenancy/current");
    await expect(currentDealer()).rejects.toThrow("No current dealer");
    await expect(leadsStore.list()).rejects.toThrow("No current dealer");
    await expect(adminCars()).rejects.toThrow("No current dealer");
    await expect(listActivity({}, 1, 10)).rejects.toThrow("No current dealer");
    await expect(stock.getById("4710001")).rejects.toThrow("No current dealer");
    await expect(dealerBucket()).rejects.toThrow("No current dealer");
  });

  it("refuses a dealer the directory does not have", async () => {
    const { runAsDealer } = await import("@/lib/tenancy/current");
    await expect(runAsDealer("nobody-motors", async () => 1)).rejects.toThrow("Unknown dealer");
  });
}
