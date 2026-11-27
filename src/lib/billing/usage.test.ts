import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const team = vi.hoisted(() => ({ list: [] as { id: string; name: string; email: string; role: string }[] }));
vi.mock("@/lib/admin/collections", () => ({
  getSettings: async () => ({ team: team.list, billing: { caps: { lookup: 1, total: 5 }, ceilings: { ai: 50 }, alerts: [], alertAt80: true, aiPlan: "assistant", term: "annual", branches: 2 } }), // a record from before: aiPlan, alerts, the total limit and branches are ignored
  settingsStore: { put: async () => {} },
}));
const notices = vi.hoisted(() => [] as { for?: string }[]);
vi.mock("@/lib/admin/notifications", () => ({ notify: async (n: { for?: string }) => void notices.push(n) }));
const { recordUsage, usageStore, sentAlertsStore } = await import("./usage");

beforeEach(async () => {
  notices.length = 0;
  // An empty month, not the demo's seeded one.
  for (const s of [usageStore, sentAlertsStore]) for (const d of await s.list()) await s.remove(d.id);
});
afterEach(() => vi.unstubAllEnvs());

describe("who hears that a limit is reached", () => {
  it("each owner and manager by name (an owner the directory has with no name yet goes by their email); never Sales", async () => {
    team.list = [
      { id: "1", name: "Ciara Walsh", email: "ciara@example.com", role: "Manager" },
      { id: "2", name: "Conor Doyle", email: "conor@example.com", role: "Sales" },
      { id: "3", name: "owner@example.com", email: "owner@example.com", role: "Owner" },
    ];
    await recordUsage("lookup", "dashboard", 104); // 100 included, then 4 at €1.20, past the €1 limit
    expect([...new Set(notices.map((n) => n.for))].sort()).toEqual(["Ciara Walsh", "owner@example.com"]);
  });

  it("nobody at all when there is no owner or manager, rather than everyone", async () => {
    team.list = [{ id: "2", name: "Conor Doyle", email: "conor@example.com", role: "Sales" }];
    await recordUsage("lookup", "dashboard", 104);
    expect(notices).toEqual([]);
  });
});

describe("a record from before the plans (#147)", () => {
  it("reads as one dealership on a 1-year term", async () => {
    const { billingSettings } = await import("./usage");
    expect((await billingSettings()).term).toBe(1);
  });
});

describe("a stored AI assistant plan", () => {
  it("is ignored: the allowance is the plan's", async () => {
    const { monthUsage } = await import("./usage");
    await recordUsage("lookup", "dashboard", 100);
    expect((await monthUsage()).lookup).toMatchObject({ count: 100, costEur: 0 }); // the plan's 100 lookups
  });
});

describe("our limits", () => {
  it("start every plan at EUR 15 of lookups and EUR 20 of WhatsApp past the allowance; the dealer's lower limit counts", async () => {
    const { billingSettings } = await import("./usage");
    const { capOf } = await import("./rules");
    const b = await billingSettings();
    expect(b.ceilings).toMatchObject({ lookup: 15, whatsapp: 20 });
    expect(capOf(b, "lookup")).toBe(1); // the stored limit of EUR 1 is lower
    expect(capOf(b, "whatsapp")).toBe(20);
  });
});

describe("the demo's real AI usage", () => {
  it("is kept when the demo's records are put back to their seed, so the month's cap holds across the morning reseed", async () => {
    await recordUsage("ai", "opus", 3);
    await usageStore.reset();
    const { monthCounts } = await import("./usage");
    const ai = (await monthCounts()).filter((c) => c.service === "ai" && c.kind === "opus");
    expect(ai.reduce((n, c) => n + c.count, 0)).toBeGreaterThanOrEqual(3 + 4); // 3 real, plus the seeded line
    expect(ai.some((c) => c.id.startsWith("real-"))).toBe(true);
  });
});
