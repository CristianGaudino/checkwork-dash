import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
const { ownerBilling } = await import("./billing");
const { runAsDealer } = await import("@/lib/tenancy/current");
const { listActivity } = await import("@/lib/admin/activity");
const { billingSettings } = await import("@/lib/billing/usage");
const { addMonths, dublinDay } = await import("@/lib/admin/format");
const { planFor, planLines } = await import("@/lib/billing/rules");

const call = (method: string, dealer: string, body?: unknown, token = "right") =>
  ownerBilling(new Request("https://x.test/api/owner/v1/x", { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: body === undefined ? undefined : JSON.stringify(body) }), dealer);
const month = (n: number) => addMonths(`${dublinDay().slice(0, 7)}-01`, n).slice(0, 7);
const stored = () => runAsDealer("test-motors", billingSettings);

beforeEach(() => vi.stubEnv("OWNER_API_TOKEN", "right"));
afterEach(async () => {
  await call("PUT", "test-motors", { term: 1, freeMonth: null });
  vi.unstubAllEnvs();
});

describe("owner API billing terms (#177)", () => {
  it("refuses a missing or wrong token and changes nothing", async () => {
    expect((await call("PUT", "test-motors", { term: 2 }, "wrong")).status).toBe(404);
    expect((await call("PUT", "test-motors", { term: 2 }, "")).status).toBe(404);
    expect((await call("GET", "test-motors", undefined, "")).status).toBe(404);
    expect((await stored()).term).toBe(1);
  });
  it("answers 404 for an unknown dealer and 400 for a bad body", async () => {
    expect((await call("GET", "nobody")).status).toBe(404);
    for (const b of [{}, { term: 3 }, { term: "2" }, { term: 2, freeMonth: "2026-13" }, { term: 2, freeMonth: "2026-1" }, { term: 2, freeMonth: month(-1) }, { term: 2, freeMonth: month(13) }, { term: 2, extra: 1 }, [], "x", null])
      expect((await call("PUT", "test-motors", b)).status).toBe(400);
    expect((await stored()).term).toBe(1);
  });
  it("sets the term and free month, logs each as Checkwork, keeps the free month when left out, and clears it with null", async () => {
    const free = month(1);
    const put = await call("PUT", "test-motors", { term: 2, freeMonth: free });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ version: 1, term: 2, freeMonth: free });
    const b = await stored();
    expect(b).toMatchObject({ term: 2, freeMonth: free });
    // What the Billing page shows from it: no setup fee, and that month's plan taken off.
    expect(planFor(["tradeIn"], b).setupEur).toBe(0);
    expect(planLines(["tradeIn"], b, free).at(-1)).toEqual({ label: "First month free", eur: -planFor(["tradeIn"], b).eur });
    const log = await runAsDealer("test-motors", () => listActivity({ area: "settings" }, 1, 2));
    expect(log.rows.map((r) => [r.actor, r.summary])).toEqual([
      ["Checkwork", expect.stringMatching(/^Set the first month free to /)],
      ["Checkwork", "Set the contract to 2 years"],
    ]);
    expect((await call("PUT", "test-motors", { term: 1 })).status).toBe(200);
    expect(await (await call("GET", "test-motors")).json()).toEqual({ version: 1, term: 1, freeMonth: free });
    expect(planFor(["tradeIn"], await stored()).setupEur).toBeGreaterThan(0);
    expect((await call("PUT", "test-motors", { term: 1, freeMonth: null })).status).toBe(200);
    expect((await stored()).freeMonth).toBeUndefined();
    expect((await runAsDealer("test-motors", () => listActivity({ area: "settings" }, 1, 1))).rows[0].summary).toBe("Removed the first month free");
  });
  it("is allowed for the demo dealer, and keeps dealers apart", async () => {
    expect((await call("PUT", "checkwork-motors", { term: 2 })).status).toBe(200);
    expect((await stored()).term).toBe(1);
    expect((await call("PUT", "checkwork-motors", { term: 1 })).status).toBe(200);
  });
});
