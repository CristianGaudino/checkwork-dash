import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/staff", () => ({ requireStaff: async () => {} }));
vi.mock("@/lib/admin/activity", () => ({ logActivity: async () => {} }));
const usage = vi.hoisted(() => ({ allowed: vi.fn(async () => true), recorded: vi.fn(async () => {}) }));
vi.mock("@/lib/billing/usage", () => ({ usageAllowed: usage.allowed, recordUsage: usage.recorded }));
// One lead in memory: update() runs the change on it, as the real store does.
let lead: { id: string; type: string; reg?: string; history?: unknown };
vi.mock("@/lib/admin/collections", () => ({
  leadsStore: { get: async () => lead, update: async (_id: string, fn: (l: typeof lead) => typeof lead) => (lead = fn(lead)) },
  salesStore: { get: async () => undefined },
}));
vi.mock("@/lib/admin/stock-admin", () => ({ adminCar: async () => undefined }));
const { checkHistoryAction } = await import("./history-action");
const { historyCache } = await import("@/lib/history");

describe("checkHistoryAction", () => {
  beforeEach(async () => {
    lead = { id: "l1", type: "trade-in", reg: "151-D-1000" };
    usage.recorded.mockClear();
    await historyCache.reset();
  });

  it("keeps the check on the lead, counted once as a history check in the dashboard", async () => {
    expect(await checkHistoryAction("lead", "l1")).toEqual({});
    expect(lead.history).toMatchObject({ reg: "151-D-1000", financeOwed: true });
    expect(usage.recorded).toHaveBeenCalledExactlyOnceWith("history", "dashboard");
  });

  it("says so past the monthly limit, and keeps nothing", async () => {
    usage.allowed.mockResolvedValueOnce(false);
    expect(await checkHistoryAction("lead", "l1")).toEqual({ error: "The monthly limit for history checks is reached." });
    expect(lead.history).toBeUndefined();
  });

  it("asks for the plate first when the record has none", async () => {
    lead = { id: "l1", type: "sell" };
    expect(await checkHistoryAction("lead", "l1")).toEqual({ error: "Add the registration first." });
  });
});

describe("checkHistoryAction again within 30 days", () => {
  it("says the plate was already checked and when, rather than that it was checked now", async () => {
    lead = { id: "l1", type: "trade-in", reg: "151-D-1000" };
    await historyCache.reset();
    expect(await checkHistoryAction("lead", "l1")).toEqual({});
    expect((await checkHistoryAction("lead", "l1")).error).toMatch(/^Already checked on .+\. A check is kept for 30 days\.$/);
  });
});
