import { describe, expect, it } from "vitest";
import { AI_FAIR_USE, BILLING_DEFAULT, PLANS, PLAN_IDS, inAllowance, alertsCrossed, capOf, monthEndEstimate, planEur, planLines, termOf, usageCosts, usageEstimate, withBillingDefaults, withinCaps, type BillingSettings, type UsageCount } from "./rules";

const c = (service: UsageCount["service"], kind: string, count: number): UsageCount => ({ id: `m:${service}:${kind}`, month: "2026-11", service, kind, count });


describe("usage costs", () => {
  it("prices each paid line, and adds them up; AI writing is counted, never billed", () => {
    const u = usageCosts([c("lookup", "dashboard", 10), c("whatsapp", "alert", 20), c("whatsapp", "reply", 50), c("ai", "opus", 4), c("ai", "sonnet", 5)], {});
    expect(u.lookup.costEur).toBe(3);
    expect(u.whatsapp.costEur).toBe(2.5); // 20 x 0.05 + 50 x 0.03
    expect(u.ai).toMatchObject({ count: 9, costEur: 0 });
    expect(u.totalEur).toBe(5.5);
  });

  it("puts the allowance against each service first, then bills per use over it; WhatsApp's covers alerts only", () => {
    expect(usageCosts([c("lookup", "dashboard", 30)], { lookup: 25 }).lookup.costEur).toBe(1.5); // 5 over x 0.30
    const w = usageCosts([c("whatsapp", "alert", 510), c("whatsapp", "reply", 10)], { whatsapp: 500 }).whatsapp;
    expect(w.costEur).toBe(0.8); // 10 alerts over x 0.05 + 10 replies x 0.03
    expect(w.kinds.map((k) => k.included)).toEqual([500, 0, 0]);
  });

  it("a plan with the dashboard includes 100 lookups and 500 WhatsApp alerts a month; the website alone none; no plan a history check", () => {
    expect(PLANS.website.allowance).toEqual({});
    expect(PLANS.dashboard.allowance).toEqual({ lookup: 100, whatsapp: 500 });
    expect(PLANS.both.allowance).toEqual({ lookup: 100, whatsapp: 500 });
  });
});

// Three plans (#212): each all-inclusive, a month before VAT, no setup fee and no add-ons.
describe("the plans", () => {
  const one = { term: 1 } as const;
  const two = { term: 2 } as const;
  it("prices each plan as one line, the same on either term", () => {
    expect(PLAN_IDS).toEqual(["website", "dashboard", "both"]);
    expect(planLines("website", one)).toEqual([{ label: "Website plan", eur: 149 }]);
    expect(planLines("dashboard", two)).toEqual([{ label: "Dashboard plan", eur: 149 }]);
    expect(planLines("both", one)).toEqual([{ label: "Website + Dashboard plan", eur: 249 }]);
    expect(planEur("both", two)).toBe(249);
  });
  it("takes the plan off the dealer's first month, and only that month", () => {
    const o = { term: 1, freeMonth: "2026-11" } as const;
    expect(planLines("dashboard", o, "2026-11")).toEqual([{ label: "Dashboard plan", eur: 149 }, { label: "First month free", eur: -149 }]);
    expect(planEur("both", o, "2026-11")).toBe(0);
    expect(planEur("both", o, "2026-12")).toBe(249);
    expect(planEur("both", o)).toBe(249);
  });
  it("has no branches: a stored record from the tiers reads as one dealership, its term as 1 or 2 years", () => {
    const old = withBillingDefaults({ branches: 3, brands: 4, term: "twoYear", alerts: [{ scope: "total", amountEur: 5 }], alertAt80: true } as never);
    expect(old.term).toBe(2);
    expect(planEur("both", old)).toBe(249);
    expect(old.ceilings).toEqual({ lookup: 15, history: 25, whatsapp: 20 });
    expect([termOf("monthly"), termOf("annual"), termOf(undefined), termOf(2)]).toEqual([1, 1, 1, 2]);
  });
});

describe("limits", () => {
  it("a EUR 0 limit refuses every paid use, while a lookup the plan includes still goes", () => {
    const zero: BillingSettings = { ...BILLING_DEFAULT, caps: { history: 0, lookup: 0 } };
    const none = usageCosts([], PLANS.dashboard.allowance);
    expect(capOf(zero, "history")).toBe(0); // a limit, not "no limit"
    expect(withinCaps(none, zero, "history")).toBe(false);
    expect(withinCaps(none, zero, "lookup")).toBe(false);
    expect(inAllowance(none, PLANS.dashboard.allowance, "history", "dashboard")).toBe(false); // no history check is included
    expect(inAllowance(none, PLANS.dashboard.allowance, "lookup", "dashboard")).toBe(true); // so usageAllowed lets it through
    const used = usageCosts([c("lookup", "dashboard", 100)], PLANS.dashboard.allowance);
    expect(inAllowance(used, PLANS.dashboard.allowance, "lookup", "dashboard")).toBe(false); // the 101st is paid, and the EUR 0 limit stops it
  });
  const b: BillingSettings = { ...BILLING_DEFAULT, caps: { lookup: 10, whatsapp: 30 }, ceilings: { lookup: 8 } };
  it("uses the lower of the dealer's limit and our ceiling", () => {
    expect(capOf(b, "lookup")).toBe(8);
    expect(capOf(b, "whatsapp")).toBe(30);
    expect(capOf({ ...b, caps: {} }, "whatsapp")).toBeUndefined();
  });
  it("stops a paid service at its own limit, and AI writing at our fair use", () => {
    expect(withinCaps(usageCosts([c("lookup", "dashboard", 26)], {}), b, "lookup")).toBe(true); // 7.80
    expect(withinCaps(usageCosts([c("lookup", "dashboard", 27)], {}), b, "lookup")).toBe(false); // 8.10
    expect(withinCaps(usageCosts([c("ai", "opus", AI_FAIR_USE - 1)], {}), b, "ai")).toBe(true);
    // History checks: none in any plan, so each is billed, and our default limit stops them at EUR 25 (10 checks).
    expect(withinCaps(usageCosts([c("history", "dashboard", 9)], PLANS.dashboard.allowance), BILLING_DEFAULT, "history")).toBe(true);
    expect(withinCaps(usageCosts([c("history", "dashboard", 10)], PLANS.dashboard.allowance), BILLING_DEFAULT, "history")).toBe(false);
    expect(withinCaps(usageCosts([c("ai", "opus", AI_FAIR_USE)], {}), b, "ai")).toBe(false);
  });
  it("sends one notice as a limit is reached, and none on the way to it", () => {
    const lookups = (n: number) => usageCosts([c("lookup", "dashboard", n)], {});
    expect(alertsCrossed(lookups(21), lookups(22), b, "2026-11")).toEqual([]); // 80% passed: nothing
    expect(alertsCrossed(lookups(26), lookups(27), b, "2026-11").map((a) => a.key)).toEqual(["2026-11:lookup:cap:8"]);
    expect(alertsCrossed(lookups(27), lookups(28), b, "2026-11")).toEqual([]);
    expect(alertsCrossed(usageCosts([], {}), usageCosts([c("ai", "opus", 10_000)], {}), b, "2026-11")).toEqual([]);
  });
});

describe("the estimate", () => {
  it("takes the month to date to a whole month at the same pace", () => {
    expect(monthEndEstimate(10, "2026-11-10")).toBe(30); // 10 of 30 days
    expect(monthEndEstimate(1, "2026-12-01")).toBe(31); // the 1st in Dublin, whatever the UTC day
  });
  it("stops each service at its own limit, never below what is spent, and never counts AI", () => {
    const counts = [c("lookup", "dashboard", 30), c("whatsapp", "reply", 100), c("ai", "opus", 300)]; // EUR 9 and EUR 3 by the 10th, so 27 and 9 at that pace
    const b = (caps: BillingSettings["caps"]): BillingSettings => ({ ...BILLING_DEFAULT, caps, ceilings: {} });
    expect(usageEstimate(counts, {}, b({}), "2026-11-10")).toBe(36);
    expect(usageEstimate(counts, {}, b({ lookup: 10 }), "2026-11-10")).toBe(19); // lookups stop at 10, WhatsApp goes on to 9
    expect(usageEstimate(counts, {}, b({ lookup: 5 }), "2026-11-10")).toBe(18); // a limit lowered below the spend: 9 spent, WhatsApp to 9
  });
  it("estimates past the allowance at the month's pace, not from what is billed so far", () => {
    expect(usageEstimate([c("lookup", "dashboard", 60)], { lookup: 100 }, { ...BILLING_DEFAULT, ceilings: {} }, "2026-11-10")).toBe(24); // 180 at that pace, 80 x 0.30
    expect(usageEstimate([c("lookup", "dashboard", 60)], { lookup: 100 }, BILLING_DEFAULT, "2026-11-10")).toBe(15); // our EUR 15 limit stops it
  });
  it("lets a use the plan still includes past any limit, as it costs nothing; WhatsApp only for alerts", () => {
    const allowance = { lookup: 25, whatsapp: 500 };
    const used = usageCosts([c("lookup", "dashboard", 24), c("whatsapp", "alert", 10)], allowance);
    expect(inAllowance(used, allowance, "lookup")).toBe(true);
    expect(inAllowance(usageCosts([c("lookup", "dashboard", 25)], allowance), allowance, "lookup")).toBe(false);
    expect(inAllowance(used, allowance, "whatsapp", "alert")).toBe(true);
    expect(inAllowance(used, allowance, "whatsapp", "reply")).toBe(false);
    expect(inAllowance(used, allowance, "whatsapp")).toBe(false);
    expect(inAllowance(used, allowance, "ai")).toBe(false);
  });
});
