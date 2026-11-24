import { describe, expect, it } from "vitest";
import { MODULE_IDS } from "@/lib/modules-rules";
import { AI_FAIR_USE, BILLING_DEFAULT, PLANS, inAllowance, allowanceFor, alertsCrossed, capOf, monthEndEstimate, planEur, planFor, planLines, switchPlan, termOf, usageCosts, usageEstimate, withBillingDefaults, withinCaps, type BillingSettings, type UsageCount } from "./rules";

const c = (service: UsageCount["service"], kind: string, count: number): UsageCount => ({ id: `m:${service}:${kind}`, month: "2026-11", service, kind, count });

const WEBSITE = ["tradeIn", "finance", "carFinder", "commercial", "reviews"] as const;
const DASHBOARD = ["dashboard", "testDrives", "sales", "margins", "service", "reviews", "newsletter", "analytics", "whatsapp", "ai", "lookupDashboard", "history"] as const;
const BOTH = [...WEBSITE, ...DASHBOARD];

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

  it("each plan's allowance: lookups and WhatsApp alerts with the dashboard; none on the website alone, none for AI writing", () => {
    expect(allowanceFor([], BILLING_DEFAULT)).toEqual({}); // no modules is Website
    expect(allowanceFor(WEBSITE, BILLING_DEFAULT)).toEqual({});
    expect(allowanceFor(DASHBOARD, BILLING_DEFAULT)).toEqual({ lookup: 100, whatsapp: 500 });
    expect(allowanceFor(BOTH, BILLING_DEFAULT)).toEqual({ lookup: 100, whatsapp: 500 });
    expect(allowanceFor([...BOTH, "social"], BILLING_DEFAULT)).toEqual({ lookup: 100, whatsapp: 500 });
  });
});

describe("the plans", () => {
  const one = { term: 1 } as const;
  const two = { term: 2 } as const;
  it("prices each plan, with a setup fee for the website on a 1-year term and none on 2 years", () => {
    expect(planFor(WEBSITE, one)).toMatchObject({ name: "Website", eur: 149, setupEur: 500, extras: [] });
    expect(planFor(WEBSITE, two)).toMatchObject({ name: "Website", eur: 149, setupEur: 0 });
    expect(planFor(DASHBOARD, one)).toMatchObject({ name: "Dashboard", eur: 149, setupEur: 0, extras: [] });
    expect(planFor(DASHBOARD, two)).toMatchObject({ name: "Dashboard", eur: 149, setupEur: 0 });
    expect(planFor(BOTH, one)).toMatchObject({ name: "Website + Dashboard", eur: 249, setupEur: 500, extras: [] });
    expect(planFor(BOTH, two)).toMatchObject({ name: "Website + Dashboard", eur: 249, setupEur: 0 });
  });
  it("is the cheapest plan that holds the modules: none is Website, the dashboard alone is Dashboard, a website module with it is both", () => {
    expect(planFor([]).name).toBe("Website");
    expect(planFor(["reviews"]).name).toBe("Website");
    expect(planFor(["dashboard"]).name).toBe("Dashboard");
    expect(planFor(["dashboard", "reviews"]).name).toBe("Dashboard");
    expect(planFor(["dashboard", "finance"]).name).toBe("Website + Dashboard");
    expect(planEur(MODULE_IDS.filter((m) => m !== "social"))).toBe(249); // everything is included
    for (const p of PLANS) expect(planFor(p.modules).plan.id).toBe(p.id);
  });
  it("keeps Social and ads as the only add-on, at its own price and setup", () => {
    expect(planFor([...BOTH, "social"], one)).toMatchObject({ eur: 249 + 99, setupEur: 500 + 150, extras: ["social"] });
    expect(planFor([...DASHBOARD, "social"], two)).toMatchObject({ eur: 149 + 99, setupEur: 0 });
    expect(planLines([...BOTH, "social"])).toEqual([{ label: "Website + Dashboard plan", eur: 249 }, { label: "Social and ads", eur: 99 }]);
  });
  it("takes the plan off the dealer's first month, and only that month", () => {
    const o = { term: 1, freeMonth: "2026-11" } as const;
    expect(planLines(DASHBOARD, o, "2026-11")).toEqual([{ label: "Dashboard plan", eur: 149 }, { label: "First month free", eur: -149 }]);
    expect(planEur([...BOTH, "social"], o, "2026-11")).toBe(0);
    expect(planEur(DASHBOARD, o, "2026-12")).toBe(149);
    expect(planEur(DASHBOARD, o)).toBe(149);
  });
  it("has no branches: a stored record from the tiers reads as one dealership, its term as 1 or 2 years", () => {
    const old = withBillingDefaults({ branches: 3, brands: 4, term: "twoYear", alerts: [{ scope: "total", amountEur: 5 }], alertAt80: true } as never);
    expect(old.term).toBe(2);
    expect(planFor(BOTH, old).eur).toBe(249);
    expect(allowanceFor(BOTH, old)).toEqual({ lookup: 100, whatsapp: 500 });
    expect(old.ceilings).toEqual({ lookup: 15, history: 25, whatsapp: 20 });
    expect([termOf("monthly"), termOf("annual"), termOf(undefined), termOf(2)]).toEqual([1, 1, 1, 2]);
    for (const p of PLANS) expect(p).not.toHaveProperty("branchEur");
  });
  it("keeps the add-ons when the plan changes, and drops only those the new plan cannot hold, saying which", () => {
    const plan = (id: string) => PLANS.find((p) => p.id === id)!;
    const dash = switchPlan([...BOTH, "social"], plan("dashboard"));
    expect([...dash.modules].sort()).toEqual([...DASHBOARD, "social"].sort());
    expect(dash.dropped).toEqual([]);
    expect(switchPlan([...BOTH, "social"], plan("website"))).toEqual({ modules: new Set(WEBSITE), dropped: ["social"] });
  });
});

describe("limits", () => {
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
    expect(withinCaps(usageCosts([c("history", "dashboard", 9)], allowanceFor(BOTH, BILLING_DEFAULT)), BILLING_DEFAULT, "history")).toBe(true);
    expect(withinCaps(usageCosts([c("history", "dashboard", 10)], allowanceFor(BOTH, BILLING_DEFAULT)), BILLING_DEFAULT, "history")).toBe(false);
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
