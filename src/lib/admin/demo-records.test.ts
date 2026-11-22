import { afterEach, describe, expect, it, vi } from "vitest";
import { HOUR } from "@/lib/time";
import { DEMO_PROFILE } from "@/lib/tenancy/profile";

vi.mock("server-only", () => ({}));

// A clone for a real dealer must not open its dashboard on made-up leads, reviews and people.
async function fresh() {
  vi.resetModules();
  delete (globalThis as { __checkworkDocs?: unknown }).__checkworkDocs; // the record store's memory is shared across module copies (docs.ts)
  return import("./collections");
}

describe("demo records", () => {
  afterEach(() => vi.unstubAllEnvs());

  // The directory's demo flag decides, on any deploy (APP_ENV=production here, as on the one shared deploy).
  it("a real dealer (not a demo in the directory) starts empty, with the settings it needs and no made-up team", async () => {
    vi.stubEnv("APP_ENV", "production");
    const c = await fresh();
    const { runAsDealer } = await import("@/lib/tenancy/current");
    await runAsDealer("test-motors", async () => {
      expect(await c.leadsStore.list()).toEqual([]);
      expect(await c.reviewsStore.list()).toEqual([]);
      expect(await c.postsStore.list()).toEqual([]);
      expect((await c.getSettings()).team).toEqual([]);
      expect((await c.getSettings()).leadSlaHours).toBe(24);
    });
  });

  it("the demo dealer has its made-up records on a production deploy too", async () => {
    vi.stubEnv("APP_ENV", "production");
    expect((await (await fresh()).leadsStore.list()).length).toBeGreaterThan(10);
  });

  it("opens with a few new leads late, not all of them, and still so at the end of the day it was reset", async () => {
    const { overview } = await import("./overview");
    const { isSalesLead } = await import("./leads");
    const leads = (await (await fresh()).leadsStore.list()).filter(isSalesLead);
    for (const now of [Date.now(), Date.now() + 10 * HOUR]) {
      const o = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads, drives: [], reviews: [], now, slaHours: 24 });
      const late = o.answer.filter((t) => t.late).length;
      expect(late).toBeGreaterThan(0);
      expect(late).toBeLessThan(leads.filter((l) => l.status === "new").length / 2);
    }
  });
});

describe("the demo's stories", () => {
  it("agree with each other: claims are on real sales, held deposits on the cars marked reserved, linked records exist", async () => {
    const c = await fresh();
    const cars = (await import("@/lib/stock/demo-cars.json")).default as { id: string; reserved?: boolean }[];
    const [sales, deposits, claims, orders, leads, customers] = await Promise.all([c.salesStore.list(), c.reservationsStore.list(), c.claimsStore.list(), c.ordersStore.list(), c.leadsStore.list(), c.customersStore.list()]);
    const ids = (l: { id: string }[]) => new Set(l.map((x) => x.id));
    for (const k of claims) {
      const sale = sales.find((s) => s.id === k.saleId)!;
      expect(sale.returnedOn).toBeUndefined();
      expect(k.openedOn >= sale.soldOn).toBe(true);
      expect(k.customerId).toBe(sale.customerId);
    }
    expect(deposits.filter((d) => d.status === "held").map((d) => d.carId).sort()).toEqual(cars.filter((x) => x.reserved).map((x) => x.id).sort());
    const linked = [...claims, ...orders].flatMap((x) => (x.leadId ? [x.leadId] : []));
    expect(linked.length).toBeGreaterThan(0);
    for (const id of linked) expect(ids(leads).has(id)).toBe(true);
    for (const x of [...deposits, ...claims, ...orders]) expect(ids(customers).has(x.customerId!)).toBe(true);
    // Every stage but Arrived, which puts a car in stock (orders/actions.ts), so the demo would need a car made for it.
    expect([...new Set(orders.map((o) => o.status))].sort()).toEqual(c.ORDER_STATUSES.filter((s) => s !== "arrived").sort());
  });

  it("look right at any hour: no open drive in the past, ads claim no more leads than came from ads, each reply its own", async () => {
    const now = Date.UTC(2026, 10, 19, 18, 0); // 18:00 in Dublin, after the day's last seeded drive
    vi.useFakeTimers({ toFake: ["Date"], now });
    const c = await fresh();
    const [drives, ads, leads, reviews] = await Promise.all([c.drivesStore.list(), c.adsStore.list(), c.leadsStore.list(), c.reviewsStore.list()]);
    vi.useRealTimers();
    expect(drives.filter((d) => (d.status === "requested" || d.status === "confirmed") && d.startsAt <= now)).toEqual([]);
    const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);
    expect(sum(ads.map((a) => a.leads))).toBeLessThanOrEqual(leads.filter((l) => l.source === "Facebook" || l.source === "Google").length);
    const replies = reviews.flatMap((r) => (r.reply ? [r.reply] : []));
    expect(new Set(replies).size).toBe(replies.length);
  });
});

describe("reset demo data", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("puts a demo dealer back on a production deploy, and never touches a real dealer", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.resetModules();
    vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) })); // no role picked: the owner
    const { leadsStore } = await import("./collections");
    const { resetDemoAction } = await import("@/app/settings/actions");
    const { resetDemoRecords } = await import("./demo-reset");
    const { mayResetDemo } = await import("./docs");
    const { runAsDealer } = await import("@/lib/tenancy/current");
    const own = { id: "lead-own-1", type: "enquiry" as const, status: "new" as const, name: "A", email: "", phone: "", message: "", source: "Website" as const, notes: [], createdAt: 1 };
    // The demo dealer (as the open app's owner): the button puts its records back.
    expect(await mayResetDemo()).toBe(true);
    await leadsStore.put(own);
    await resetDemoAction();
    expect(await leadsStore.get(own.id)).toBeUndefined();
    // A real dealer: no button, and the reset itself refuses.
    await runAsDealer("test-motors", async () => {
      expect(await mayResetDemo()).toBe(false);
      await leadsStore.put(own);
      await expect(resetDemoRecords()).rejects.toThrow("Not a demo dealer");
      expect((await leadsStore.list()).map((l) => l.id)).toEqual(["lead-own-1"]);
    });
  });
});
