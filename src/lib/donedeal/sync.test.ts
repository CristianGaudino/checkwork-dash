import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Car } from "@/lib/stock/types";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: () => null }) }));
// The feed and the email are what a test changes: DoneDeal's answer, and whether the warning went.
let feed: () => Promise<unknown> = async () => ({ ok: false, reason: "failed" });
vi.mock("./feed", () => ({ fetchListings: () => feed() }));
// Whether the DoneDeal key is connected when the sync is about to apply its plan ("off": removed meanwhile).
let mode = "simulated";
vi.mock("@/lib/integrations", async (orig) => {
  const real = await orig<typeof import("@/lib/integrations")>();
  return { ...real, modeOf: async (id: Parameters<typeof real.modeOf>[0]) => (id === "donedeal" ? mode : real.modeOf(id)) };
});
const sent: { to: string[]; subject: string }[] = [];
// A car whose save fails (as an address clash with another car would in D1). `race`: a change someone makes to that car in the dashboard
// after the sync planned and just before its write lands (#15).
const race: { id?: string; change?: (c: Car) => Car } = {};
vi.mock("@/lib/admin/stock-admin", async (orig) => {
  const real = await orig<typeof import("@/lib/admin/stock-admin")>();
  return {
    ...real,
    saveCar: async (c: Car) => (c.id === "bad" ? Promise.reject(new Error("UNIQUE constraint failed: cars.slug")) : real.saveCar(c)),
    updateCar: async (id: string, fn: Parameters<typeof real.updateCar>[1]) => {
      if (race.id === id && race.change) {
        const change = race.change;
        race.id = undefined;
        await real.updateCar(id, change);
      }
      return real.updateCar(id, fn);
    },
  };
});
vi.mock("@/lib/leads/mail", () => ({ sendTo: async (to: string[], m: { subject: string }) => void sent.push({ to, subject: m.subject }) }));
// The stored photos a removed car takes with it (R2 on the Worker; tests have no bucket).
const dropped: string[] = [];
vi.mock("@/lib/admin/car-photos", async (orig) => ({ ...(await orig<typeof import("@/lib/admin/car-photos")>()), dropCarPhotos: async (p: { src: string }[]) => void dropped.push(...p.map((x) => x.src)) }));

const { runSync, syncStatus, resetSyncStatus, syncActor, removeSyncedCars } = await import("./sync");
const { adminCars } = await import("@/lib/admin/stock-admin");
const { listActivity } = await import("@/lib/admin/activity");
const { HOUR, MINUTE } = await import("@/lib/time");
const { forSale: isForSale } = await import("@/lib/stock/types");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { patchDealer } = await import("@/lib/tenancy/directory");
const { salesStore } = await import("@/lib/admin/collections");
const { removeCar, saveCar } = await import("@/lib/admin/stock-admin");

// What DoneDeal lists: the cars for sale (as the simulated feed sends, src/lib/donedeal/feed.ts).
const forSale = async () => (await adminCars()).filter(isForSale);

describe("the DoneDeal sync", () => {
  beforeEach(async () => {
    sent.length = 0;
    await resetSyncStatus();
  });

  it("with what we already have, changes nothing and says when it ran", async () => {
    const cars = await forSale();
    feed = async () => ({ ok: true, listings: cars });
    const s = await runSync({ now: 1_000 });
    expect(s).toMatchObject({ lastOkAt: 1_000, result: { added: 0, changed: 0, takenDown: 0 } });
    expect(s.problem).toBeUndefined();
  });

  it("writes each change to the stock and the activity history, as the sync", async () => {
    const [a, b, ...rest] = await forSale();
    const fresh: Car = { ...a, id: "dd-1", slug: "ford-focus-dd-1" };
    feed = async () => ({ ok: true, listings: [{ ...a, priceEur: a.priceEur - 500 }, ...rest, fresh] });
    const s = await runSync();
    expect(s.result).toEqual({ added: 1, changed: 1, takenDown: 1 });
    const now = await adminCars();
    expect(now.find((c) => c.id === a.id)?.priceEur).toBe(a.priceEur - 500);
    expect(now.find((c) => c.id === b.id)).toMatchObject({ listing: "hidden", takenDownAt: expect.any(String) });
    expect(now.find((c) => c.id === "dd-1")?.listedAt).toBeTruthy();
    const log = (await listActivity({ actor: syncActor("DoneDeal") }, 1, 3)).rows.map((r) => r.summary);
    expect(log).toEqual(expect.arrayContaining(["Added from DoneDeal", "Hidden: the ad came down on DoneDeal", expect.stringMatching(/^Changed the price from/)]));
  });

  it("leaves a car alone that was changed here after it planned, and says nothing changed (#15)", async () => {
    const [a, ...rest] = await forSale();
    feed = async () => ({ ok: true, listings: [{ ...a, priceEur: a.priceEur - 700 }, ...rest] });
    race.id = a.id;
    race.change = (c) => ({ ...c, priceEur: c.priceEur + 1 }); // someone saved its price here meanwhile
    const logged = async () => (await listActivity({ actor: syncActor("DoneDeal") }, 1, 500)).rows.length;
    const before = await logged();
    const s = await runSync();
    expect(s.result?.changed).toBe(0);
    expect((await adminCars()).find((c) => c.id === a.id)?.priceEur).toBe(a.priceEur + 1); // theirs kept, not the sync's planned price
    expect(await logged()).toBe(before); // nothing in the history for a change that did not happen
  });

  it("a sold car DoneDeal lists again goes back on sale, and its sale goes with it", async () => {
    const { salesStore } = await import("@/lib/admin/collections");
    const sold = (await adminCars()).find((c) => c.soldAt && c.id !== "dd-1")!;
    await salesStore.put({ id: sold.id, carTitle: "x", priceEur: 1, soldOn: sold.soldAt!, createdAt: 0 });
    feed = async () => ({ ok: true, listings: [...(await forSale()), { ...sold, soldAt: undefined }] });
    await runSync();
    expect((await adminCars()).find((c) => c.id === sold.id)?.soldAt).toBeUndefined();
    expect(await salesStore.get(sold.id)).toBeUndefined();
  });

  it("a broken answer changes nothing and is held", async () => {
    const before = await adminCars();
    feed = async () => ({ ok: true, listings: [] });
    const s = await runSync();
    expect(s).toMatchObject({ held: true, problem: expect.stringMatching(/sent no cars/) });
    expect(await adminCars()).toEqual(before);
  });

  it("skips a car that cannot be saved, saves the rest, and says so", async () => {
    const cars = await forSale();
    feed = async () => ({ ok: true, listings: [...cars, { ...cars[0], id: "bad", slug: "clash" }, { ...cars[0], id: "dd-ok", slug: "fine" }] });
    const s = await runSync();
    expect(s.result).toEqual({ added: 1, changed: 0, takenDown: 0 });
    expect(s.problem).toBe("1 car from DoneDeal could not be saved. The rest are up to date.");
    expect((await adminCars()).some((c) => c.id === "dd-ok")).toBe(true);
  });

  it("warns the owners and managers an hour into an outage, once, and again for a new one", async () => {
    const cars = await forSale();
    feed = async () => ({ ok: true, listings: cars });
    await runSync({ now: 0 });
    feed = async () => ({ ok: false, reason: "failed" });
    await runSync({ now: HOUR / 2 }); // the outage starts here
    await runSync({ now: HOUR });
    expect(sent).toHaveLength(0); // half an hour in
    expect((await syncStatus()).problem).toBe("DoneDeal did not answer.");
    await runSync({ now: 1.5 * HOUR });
    await runSync({ now: 1.75 * HOUR });
    expect(sent).toHaveLength(1);
    expect(sent[0].to.sort()).toEqual(["aoife@example.com", "ciara@example.com"]); // the owner and the manager, not sales or finance
    feed = async () => ({ ok: true, listings: cars });
    await runSync({ now: 2 * HOUR });
    expect((await syncStatus()).problem).toBeUndefined();
    feed = async () => ({ ok: false, reason: "failed" });
    await runSync({ now: 3 * HOUR });
    await runSync({ now: 4 * HOUR });
    expect(sent).toHaveLength(2); // a new outage, a new warning
  });

  it("is not warned on the first failure, however long ago the last good sync was", async () => {
    feed = async () => ({ ok: false, reason: "not-connected" });
    await runSync({ now: 10 * HOUR });
    expect(sent).toHaveLength(0);
    await runSync({ now: 11 * HOUR });
    expect(sent).toHaveLength(1);
  });
});

// A real dealer whose stock comes from DoneDeal (Test Motors, switched to synced for these tests), with two synced cars, one with a photo
// stored here, and a sale of the other.
describe("a refused DoneDeal key (#158)", () => {
  const photo = "/car-photos/cars/900001/0f8fe0a4-7d55-4c3e-9a51-3c2d1a8e5b10.jpg";
  const asTest = <T,>(fn: () => Promise<T>) => runAsDealer("test-motors", fn);
  beforeEach(async () => {
    sent.length = 0;
    await patchDealer("test-motors", "Test Motors", { stock: { source: "donedeal", listingSite: "DoneDeal", listingUrl: "https://www.donedeal.ie/" } });
    const [a, b] = await forSale(); // the demo's, as a shape
    await asTest(async () => {
      await resetSyncStatus();
      for (const c of await adminCars()) await removeCar(c.id, c);
      await saveCar({ ...a, id: "900001", slug: "car-900001", photos: [{ src: photo, width: 1, height: 1 }] });
      await saveCar({ ...b, id: "900002", slug: "car-900002", photos: [] });
      await salesStore.put({ id: "900002", carTitle: "2019 Ford Focus", priceEur: 1, soldOn: "2026-11-01", createdAt: 0 });
    });
    dropped.length = 0;
  });

  const ids = async () => (await asTest(adminCars)).map((c) => c.id).sort();

  it("one refused answer keeps the cars and warns in the bell", async () => {
    feed = async () => ({ ok: false, reason: "refused" });
    const s = await asTest(() => runSync({ now: 1_000 }));
    expect(s.problem).toBe("DoneDeal refused the key. If it still does at the next check, its cars come off the dashboard and the website.");
    expect(await ids()).toEqual(["900001", "900002"]);
    expect(sent).toHaveLength(0);
  });

  it("refused, then a good run, then refused again keeps the cars", async () => {
    feed = async () => ({ ok: false, reason: "refused" });
    await asTest(() => runSync({ now: 1_000 }));
    feed = async () => ({ ok: true, listings: (await adminCars()).filter(isForSale) });
    await asTest(() => runSync({ now: 1_000 + 5 * MINUTE }));
    feed = async () => ({ ok: false, reason: "refused" });
    await asTest(() => runSync({ now: 1_000 + 15 * MINUTE }));
    expect(await ids()).toEqual(["900001", "900002"]);
    feed = async () => ({ ok: false, reason: "failed" }); // an outage in between starts the count again too
    await asTest(() => runSync({ now: 1_000 + 20 * MINUTE }));
    feed = async () => ({ ok: false, reason: "refused" });
    await asTest(() => runSync({ now: 1_000 + 30 * MINUTE }));
    expect(await ids()).toEqual(["900001", "900002"]);
    expect(dropped).toEqual([]);
  });

  it("a refusal counts only 10 minutes or more after the first: two quick refreshes keep the cars", async () => {
    feed = async () => ({ ok: false, reason: "refused" });
    await asTest(() => runSync({ now: 1_000 }));
    const s = await asTest(() => runSync({ now: 1_000 + MINUTE }));
    expect(s.problem).toMatch(/^DoneDeal refused the key\. If it still does/);
    expect(await ids()).toEqual(["900001", "900002"]);
    await asTest(() => runSync({ now: 1_000 + 10 * MINUTE }));
    expect(await ids()).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it("refused twice in a row removes the synced cars and their stored photos, keeps the sale, says why and tells the owners once", async () => {
    feed = async () => ({ ok: false, reason: "refused" });
    await asTest(() => runSync({ now: 1_000 }));
    const s = await asTest(() => runSync({ now: 1_000 + 15 * MINUTE }));
    expect(s).toMatchObject({ problem: "DoneDeal refused the key, so its cars were removed.", removed: true });
    expect(await asTest(adminCars)).toEqual([]);
    expect(dropped).toEqual([photo]);
    expect(await asTest(() => salesStore.get("900002"))).toMatchObject({ carTitle: "2019 Ford Focus" });
    expect(sent.map((m) => m.subject)).toEqual(["Test Motors: the DoneDeal cars were removed"]);
    const log = await asTest(() => listActivity({ actor: syncActor("DoneDeal") }, 1, 5));
    expect(log.rows.map((r) => r.summary)).toContain("Removed 2 cars: DoneDeal refused the key");
    await asTest(() => runSync({ now: 1_000 + HOUR }));
    await asTest(() => runSync({ now: 1_000 + 2 * HOUR }));
    expect(sent).toHaveLength(1); // once, not again an hour in
  });

  it("the key removed by Checkwork: the status says the cars were removed, and so does a later email", async () => {
    expect(await asTest(() => removeSyncedCars("the DoneDeal key was removed", "Checkwork"))).toBe(2);
    expect(await asTest(syncStatus)).toMatchObject({ removed: true, problem: "DoneDeal cars were removed: the DoneDeal key was removed." });
    mode = "off";
    feed = async () => ({ ok: false, reason: "not-connected" });
    await asTest(() => runSync({ now: 1_000 }));
    await asTest(() => runSync({ now: 1_000 + HOUR }));
    expect(sent.map((m) => m.subject)).toEqual(["Test Motors: the DoneDeal cars were removed"]);
    mode = "simulated";
  });

  it("a sync running when the key is removed stops before it puts the cars back", async () => {
    const listings = await asTest(adminCars);
    feed = async () => {
      await asTest(() => removeSyncedCars("the DoneDeal key was removed", "Checkwork"));
      mode = "off"; // removed between the fetch and the plan being applied
      return { ok: true, listings };
    };
    const s = await asTest(() => runSync({ now: 1_000 }));
    mode = "simulated";
    expect(await ids()).toEqual([]);
    expect(s).toMatchObject({ removed: true, problem: "DoneDeal is not connected. Contact Checkwork to connect it." });
  });

  it("an outage keeps the stock", async () => {
    feed = async () => ({ ok: false, reason: "failed" });
    await asTest(() => runSync());
    expect(await ids()).toEqual(["900001", "900002"]);
    expect(dropped).toEqual([]);
  });

  it("the demo dealer never removes anything", async () => {
    const before = await adminCars();
    feed = async () => ({ ok: false, reason: "refused" });
    await runSync();
    await runSync();
    expect(await adminCars()).toEqual(before);
    expect(dropped).toEqual([]);
  });
});
