import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: () => null }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
const { writeAction } = await import("./actions");
const { saveBilling, monthCounts, recordUsage, usageStore } = await import("@/lib/billing/usage");
const { adminCars } = await import("@/lib/admin/stock-admin");
const { forSale } = await import("@/lib/stock/types");
const { reviewsStore, settingsStore } = await import("@/lib/admin/collections");
const { AI_FAIR_USE, withBillingDefaults } = await import("@/lib/billing/rules");
// The model is ours to set (never from Billing), so the test writes it to the settings.
const useModel = (aiModel: "opus" | "sonnet") => settingsStore.update("dealer", (s) => ({ ...s, billing: { ...withBillingDefaults(s.billing), aiModel } }));

const count = async (kind: string) => (await monthCounts()).filter((c) => c.service === "ai" && c.kind === kind).reduce((n, c) => n + c.count, 0); // the demo's seeded line and its kept "real-" one

describe("writeWithAI behind the dashboard", () => {
  afterEach(async () => {
    await saveBilling({ caps: {} });
    await useModel("opus");
  });

  it("writes a post from the car, counted under the dealer's model, and an adjust the same way", async () => {
    const car = (await adminCars()).find(forSale)!;
    const req = { task: "post", carSlug: car.slug, network: "Facebook", format: "post" } as const;
    const opus = await count("opus");
    const first = await writeAction(req);
    expect(first).toMatchObject({ ok: true });
    expect(await count("opus")).toBe(opus + 1);
    await useModel("sonnet");
    const sonnet = await count("sonnet");
    const shorter = await writeAction(req, "shorter", first.ok ? first.text : "");
    expect(shorter).toMatchObject({ ok: true });
    expect(first.ok && shorter.ok && shorter.text.length < first.text.length).toBe(true);
    expect(await count("sonnet")).toBe(sonnet + 1);
    expect(await count("opus")).toBe(opus + 1);
  }, 10_000);

  it("says the limit is reached at our fair use, writes nothing and counts nothing", async () => {
    const review = (await reviewsStore.list())[0].id;
    expect(await writeAction({ task: "reviewReply", reviewId: review })).toMatchObject({ ok: true });
    await recordUsage("ai", "opus", AI_FAIR_USE); // past the month's fair use, whatever was used before
    const before = await count("opus");
    expect(await writeAction({ task: "reviewReply", reviewId: (await reviewsStore.list())[0].id })).toEqual({ ok: false, reason: "limit" });
    expect(await count("opus")).toBe(before);
    for (const c of await usageStore.list()) if (c.service === "ai") await usageStore.remove(c.id); // the month's AI back to none, for the tests after
  });

  it("fails quietly, uncounted, for a record that is not there or a request that is not valid", async () => {
    const before = await count("opus");
    expect(await writeAction({ task: "leadReply", leadId: "no-such-lead" })).toEqual({ ok: false, reason: "failed" });
    expect(await writeAction({ task: "post", carSlug: "x", network: "Nowhere", format: "post" } as never)).toEqual({ ok: false, reason: "failed" });
    expect(await writeAction({ task: "newsletter" } as never)).toEqual({ ok: false, reason: "failed" });
    expect(await count("opus")).toBe(before);
  });

  it("writes Prepare me for a lead with a visit note, counted as one AI action, with no rewording buttons", async () => {
    const { leadsStore } = await import("@/lib/admin/collections");
    const lead = (await leadsStore.list()).find((l) => l.journey)!;
    const before = await count("opus");
    const r = await writeAction({ task: "leadBrief", leadId: lead.id });
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.text.split("\n").length).toBeGreaterThanOrEqual(3);
    expect(await count("opus")).toBe(before + 1);
    expect(await writeAction({ task: "leadBrief", leadId: lead.id }, "shorter")).toEqual({ ok: false, reason: "failed" });
  });
});
