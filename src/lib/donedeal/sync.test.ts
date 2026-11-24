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
const sent: { to: string[]; subject: string; text: string }[] = [];
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
vi.mock("@/lib/leads/mail", () => ({ sendTo: async (to: string[], m: { subject: string; text: string }) => void sent.push({ to, subject: m.subject, text: m.text }) }));
// The sync's bell notices, by their heading.
const bells: string[] = [];
vi.mock("@/lib/admin/notifications", async (orig) => {
  const real = await orig<typeof import("@/lib/admin/notifications")>();
  return { ...real, notify: async (n: Parameters<typeof real.notify>[0], at?: number) => (n.kind === "sync" && bells.push(n.text), real.notify(n, at)) };
});
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
const { syncLine } = await import("@/components/admin/SyncPanel");

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
    expect(sent[0].text).toMatch(/^DoneDeal cars were removed: the DoneDeal key was removed\./); // the reason kept, not "not connected"
    expect(sent[0].text.match(/Contact Checkwork/g)).toHaveLength(1);
    expect(await asTest(syncStatus)).toMatchObject({ problem: "DoneDeal cars were removed: the DoneDeal key was removed." });
    mode = "simulated";
  });

  it("refused twice, then an outage, then the key deleted: Stock and the email keep the removal's reason", async () => {
    feed = async () => ({ ok: false, reason: "refused" });
    await asTest(() => runSync({ now: 1_000 }));
    await asTest(() => runSync({ now: 1_000 + 15 * MINUTE })); // removed, and the owners told
    feed = async () => ({ ok: false, reason: "failed" });
    expect((await asTest(() => runSync({ now: 1_000 + 30 * MINUTE }))).problem).toBe("DoneDeal did not answer.");
    mode = "off";
    feed = async () => ({ ok: false, reason: "not-connected" });
    await asTest(() => removeSyncedCars("the DoneDeal key was removed", "Checkwork")); // no cars left to remove
    const s = await asTest(() => runSync({ now: 1_000 + 3 * HOUR }));
    mode = "simulated";
    expect(s.problem).toBe("DoneDeal refused the key, so its cars were removed.");
    expect(sent).toHaveLength(1); // the removal's, once for this outage
    expect(sent[0]).toMatchObject({ subject: "Test Motors: the DoneDeal cars were removed", text: expect.stringMatching(/^DoneDeal refused the key, so its cars were removed\./) });
  });

  it("an outage already emailed, then the key deleted: the removal email goes, once", async () => {
    feed = async () => ({ ok: false, reason: "failed" });
    await asTest(() => runSync({ now: 1_000 }));
    await asTest(() => runSync({ now: 1_000 + HOUR }));
    expect(sent.map((m) => m.subject)).toEqual([expect.stringMatching(/has not updated/)]);
    expect(await asTest(() => removeSyncedCars("the DoneDeal key was removed", "Checkwork"))).toBe(2);
    mode = "off";
    feed = async () => ({ ok: false, reason: "not-connected" });
    for (const h of [2, 3, 4, 5]) await asTest(() => runSync({ now: 1_000 + h * HOUR }));
    mode = "simulated";
    expect(sent.map((m) => m.subject)).toEqual([expect.stringMatching(/has not updated/), "Test Motors: the DoneDeal cars were removed"]);
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
    expect(s).toMatchObject({ removed: true, problem: "DoneDeal cars were removed: the DoneDeal key was removed." });
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

// The whole state machine, one sequence a row: what a refused, missing or failing key does to the cars, the Stock line, the bell and the
// owners' email. Steps run `at` minutes in. "delete": Checkwork removes the key (the owner API), "newkey": a key is set again.
describe("the sync's state, sequence by sequence", () => {
  type Step = ["ok" | "failed" | "refused" | "not-connected" | "held" | "delete-mid-run", number] | ["delete" | "newkey"];
  const REMOVED = "Test Motors: the DoneDeal cars were removed";
  const LATE = "Test Motors: the DoneDeal stock has not updated yet";
  const FIRST_REFUSAL = "DoneDeal refused the key. If it still does at the next check, its cars come off the dashboard and the website.";
  const BY_REFUSAL = "DoneDeal refused the key, so its cars were removed.";
  const BY_DELETE = "DoneDeal cars were removed: the DoneDeal key was removed.";
  const NONE_YET = "No cars have come through yet.";
  const NOT_UPDATED = "Stock did not update";
  const CARS_REMOVED = "DoneDeal cars removed";
  const cases: { name: string; steps: Step[]; dealer?: "demo" | "own"; noCars?: true; cars: "kept" | "removed"; line: string | RegExp; bells: string[]; emails: string[]; email?: RegExp }[] = [
    { name: "ok", steps: [["ok", 0]], cars: "kept", line: /^Last updated .*\. No changes\.$/, bells: [], emails: [] },
    { name: "failed 1h+", steps: [["failed", 0], ["failed", 15], ["failed", 60], ["failed", 120]], cars: "kept", line: `DoneDeal did not answer. ${NONE_YET}`, bells: [NOT_UPDATED], emails: [LATE], email: /still shows the cars/ },
    { name: "held", steps: [["ok", 0], ["held", 15]], cars: "kept", line: /^DoneDeal sent no cars, and the site has 2\. The site kept its stock\. .* The site shows the cars from the last update/, bells: [NOT_UPDATED], emails: [] },
    { name: "refused once", steps: [["refused", 0]], cars: "kept", line: `${FIRST_REFUSAL} ${NONE_YET}`, bells: [NOT_UPDATED], emails: [] },
    { name: "refused twice under 10 minutes", steps: [["refused", 0], ["refused", 5]], cars: "kept", line: `${FIRST_REFUSAL} ${NONE_YET}`, bells: [NOT_UPDATED], emails: [] },
    { name: "refused twice 10+ minutes", steps: [["refused", 0], ["refused", 10]], cars: "removed", line: BY_REFUSAL, bells: [NOT_UPDATED, CARS_REMOVED], emails: [REMOVED], email: /^DoneDeal refused the key, so its cars were removed\./ },
    { name: "refused twice 10+ minutes, no cars", noCars: true, steps: [["refused", 0], ["refused", 10]], cars: "removed", line: BY_REFUSAL, bells: [NOT_UPDATED, CARS_REMOVED], emails: [REMOVED] },
    { name: "refused after removal", steps: [["refused", 0], ["refused", 10], ["refused", 30], ["refused", 120]], cars: "removed", line: BY_REFUSAL, bells: [NOT_UPDATED, CARS_REMOVED], emails: [REMOVED] },
    { name: "refused, failed, refused", steps: [["refused", 0], ["failed", 5], ["refused", 15]], cars: "kept", line: `${FIRST_REFUSAL} ${NONE_YET}`, bells: [NOT_UPDATED, NOT_UPDATED], emails: [] },
    { name: "an outage after removal keeps why", steps: [["refused", 0], ["refused", 10], ["failed", 20]], cars: "removed", line: `${BY_REFUSAL} DoneDeal did not answer.`, bells: [NOT_UPDATED, CARS_REMOVED], emails: [REMOVED] },
    { name: "long outage emailed, then refused twice", steps: [["failed", 0], ["failed", 60], ["refused", 75], ["refused", 90]], cars: "removed", line: BY_REFUSAL, bells: [NOT_UPDATED, NOT_UPDATED, CARS_REMOVED], emails: [LATE, REMOVED] },
    { name: "key deleted, then runs for 1h+", steps: [["delete"], ["not-connected", 0], ["not-connected", 15], ["not-connected", 60]], cars: "removed", line: BY_DELETE, bells: [CARS_REMOVED], emails: [REMOVED], email: /^DoneDeal cars were removed: the DoneDeal key was removed\./ },
    { name: "key deleted mid-run", steps: [["delete-mid-run", 0]], cars: "removed", line: BY_DELETE, bells: [CARS_REMOVED], emails: [] },
    { name: "key deleted after a refusal removal", steps: [["refused", 0], ["refused", 10], ["delete"], ["not-connected", 20], ["not-connected", 120]], cars: "removed", line: BY_REFUSAL, bells: [NOT_UPDATED, CARS_REMOVED], emails: [REMOVED] },
    { name: "key deleted, then a new key refused", steps: [["delete"], ["not-connected", 0], ["newkey"], ["refused", 15], ["refused", 30]], cars: "removed", line: BY_DELETE, bells: [CARS_REMOVED], emails: [] },
    { name: "reconnected after removal", steps: [["refused", 0], ["refused", 10], ["ok", 20]], cars: "kept", line: /^Last updated .*\. 2 added\.$/, bells: [NOT_UPDATED, CARS_REMOVED], emails: [REMOVED] },
    { name: "demo dealer refused twice", dealer: "demo", steps: [["refused", 0], ["refused", 15]], cars: "kept", line: /^DoneDeal refused the key\. If it still does at the next check/, bells: [NOT_UPDATED], emails: [] },
    { name: "dealer with stock kept here", dealer: "own", steps: [["delete"], ["refused", 0], ["refused", 15]], cars: "kept", line: `${FIRST_REFUSAL} ${NONE_YET}`, bells: [NOT_UPDATED], emails: [] },
  ];

  it.each(cases)("$name", async (c) => {
    const as = <T,>(fn: () => Promise<T>) => (c.dealer === "demo" ? fn() : runAsDealer("test-motors", fn));
    await patchDealer("test-motors", "Test Motors", { stock: { source: c.dealer === "own" ? "checkwork" : "donedeal", listingSite: "DoneDeal", listingUrl: "https://www.donedeal.ie/" } });
    const [a, b] = await forSale();
    await as(async () => {
      await resetSyncStatus();
      if (c.dealer === "demo") return;
      for (const car of await adminCars()) await removeCar(car.id, car);
      if (!c.noCars) for (const [car, id] of [[a, "910001"], [b, "910002"]] as const) await saveCar({ ...car, id, slug: `car-${id}`, photos: [] });
    });
    const listings = c.noCars ? [a, b].map((car, i) => ({ ...car, id: `91000${i + 1}`, slug: `car-91000${i + 1}`, photos: [] })) : await as(adminCars);
    const before = (await as(adminCars)).length;
    sent.length = 0;
    bells.length = 0;
    mode = "simulated";
    const t0 = Date.now();
    const deleteKey = () => as(() => removeSyncedCars("the DoneDeal key was removed", "Checkwork"));
    try {
      for (const [step, at] of c.steps) {
        if (step === "delete") {
          await deleteKey();
          mode = "off";
        } else if (step === "newkey") mode = "simulated";
        else {
          feed =
            step === "ok" ? async () => ({ ok: true, listings })
            : step === "held" ? async () => ({ ok: true, listings: [] })
            : step === "delete-mid-run" ? async () => (await deleteKey(), (mode = "off"), { ok: true, listings })
            : async () => ({ ok: false, reason: step });
          if (step === "not-connected") mode = "off";
          await as(() => runSync({ now: t0 + at! * MINUTE }));
        }
      }
    } finally {
      mode = "simulated";
    }
    expect((await as(adminCars)).length).toBe(c.cars === "removed" ? 0 : c.noCars ? listings.length : before);
    const line = syncLine(await as(syncStatus));
    if (typeof c.line === "string") expect(line).toBe(c.line);
    else expect(line).toMatch(c.line);
    expect(bells).toEqual(c.bells);
    expect(sent.map((m) => m.subject)).toEqual(c.emails);
    if (c.email) expect(sent.at(-1)!.text).toMatch(c.email);
    for (const m of sent) expect(m.text.match(/Contact Checkwork/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
