import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { demoLeads } = await import("./collections");
const { fullReport } = await import("./reports");
const { summarise, monthRange } = await import("@/lib/reports/monthly");
const { DEMO_PROFILE } = await import("@/lib/tenancy/profile");
const { addMonths, dublinDay } = await import("./format");

// #83: the demo's leads go back a year, so the reports' periods differ, and its out-of-hours leads wait longer for a reply.
describe("the demo seed gives the reports something to show", () => {
  const now = Date.now();
  const leads = demoLeads();
  const report = (period: 3 | 12) => fullReport({ sales: [], cars: [], leads, team: [], costs: new Map(), prep: [], period, now, oldDays: 120 });
  const sum = (rows: { won: number }[]) => rows.reduce((t, r) => t + r.won, 0);

  it("12 months holds more won leads than 3, by source and by salesperson", () => {
    expect(sum(report(12).sources)).toBeGreaterThan(sum(report(3).sources));
    expect(sum(report(12).people)).toBeGreaterThan(sum(report(3).people));
  });

  it("a month's first reply is slower when the shop was closed", () => {
    const { from, to } = monthRange(addMonths(`${dublinDay(now).slice(0, 7)}-01`, -2).slice(0, 7));
    const { replies } = summarise({ leads, cars: [], sales: [], reviews: [] }, from, to, now, DEMO_PROFILE);
    expect(replies.medianOutOfHoursMin).toBeGreaterThanOrEqual(14 * 60);
    expect(replies.medianInHoursMin).toBeLessThan(4 * 60);
  });
});
