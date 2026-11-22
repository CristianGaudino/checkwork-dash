import { describe, expect, it } from "vitest";
import type { AdminReview, Lead, TestDrive } from "./collections";
import { overview } from "./overview";
import { forPerson, leadsToAnswer } from "./follow-ups";
import { personalReport } from "./reports";
import { DAY, HOUR } from "@/lib/time";
import { DEMO_PROFILE } from "@/lib/tenancy/profile";

const now = new Date("2026-11-10T12:00:00Z").getTime();
const lead = (id: string, ago: number, status: Lead["status"] = "new"): Lead => ({ id, type: "enquiry", status, name: id, email: "", phone: "", message: "", source: "Website", notes: [], createdAt: now - ago });
const drive = (id: string, inMs: number, status: TestDrive["status"]): TestDrive => ({ id, name: id, email: "", phone: "", carSlug: "x", carTitle: "x", startsAt: now + inMs, status, notes: "", createdAt: now });
const review = (id: string, rating: AdminReview["rating"], reply?: string): AdminReview => ({ id, author: id, rating, text: "", createdAt: now, reply });

describe("overview", () => {
  it("counts eight weeks of leads, this one last, and a usual week from the seven before it", () => {
    // Weeks back: 0 (this one) has 1, 1 has 3, 2 has 2, 3 has 2; the rest none. Usual: the middle of 3, 2, 2, 0, 0, 0, 0.
    const at = (week: number, n: number) => Array.from({ length: n }, (_, i) => lead(`w${week}-${i}`, week * 7 * DAY + (i + 1) * HOUR));
    const o = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [...at(0, 1), ...at(1, 3), ...at(2, 2), ...at(3, 2)], drives: [], reviews: [], now });
    expect(o.weeks).toEqual([0, 0, 0, 0, 2, 2, 3, 1]);
    expect(o.usualWeek).toBe(0);
    const busy = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [...at(0, 1), ...at(1, 3), ...at(2, 2), ...at(3, 2), ...at(4, 2), ...at(5, 2), ...at(6, 2)], drives: [], reviews: [], now });
    expect(busy.usualWeek).toBe(2);
  });
  it("counts this week's leads as the last week, and last week's before it", () => {
    const o = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [lead("a", 1 * DAY), lead("b", 6 * DAY), lead("c", 9 * DAY)], drives: [], reviews: [], now });
    expect(o.weeks.slice(-2)).toEqual([1, 2]);
    const spam = { ...lead("spam", 2 * DAY), status: "closed" as const, closedReason: "Spam" as const };
    expect(overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [lead("a", 1 * DAY), spam], drives: [], reviews: [], now }).weeks.at(-1)).toBe(1); // a closed enquiry is no lead (#55)
  });
  it("lists drives in the next 7 days in date order, ignoring past, far-off and closed ones", () => {
    const o = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [], drives: [drive("late", 5 * DAY, "confirmed"), drive("soon", DAY, "requested"), drive("past", -DAY, "confirmed"), drive("far", 9 * DAY, "confirmed"), drive("done", DAY, "cancelled")], reviews: [], now });
    expect(o.upcomingDrives.map((d) => d.id)).toEqual(["soon", "late"]);
  });
  it("flags what needs attention and leaves out what does not", () => {
    const o = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [lead("old", 30 * HOUR), lead("fresh", HOUR)], drives: [drive("d", DAY, "requested")], reviews: [review("r", 5), review("s", 4, "thanks")], now });
    expect(o.attention.map((a) => [a.key, a.count])).toEqual([["reply", 2], ["drives", 1], ["reviews", 1]]); // every new lead, the late one makes it red
    expect(o.attention[0].urgency).toBe("now");
    expect(overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [], drives: [], reviews: [review("s", 5, "thanks")], now }).attention).toEqual([]);
  });
  it("flags old stock, cars with no cost, a failing sync and drives booked on a sold car", () => {
    const car = (id: string, listedAt: string, o: object = {}) => ({ id, slug: id, listedAt, photos: [], ...o }) as unknown as import("@/lib/stock/types").Car;
    const cars = [car("old", "2026-07-01"), car("new", "2026-11-01"), car("gone", "2026-08-01", { soldAt: "2026-11-05" }), car("down", "2026-11-01", { listing: "hidden", takenDownAt: "2026-11-10" })];
    const o = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [], drives: [{ ...drive("d", DAY, "confirmed"), carSlug: "car-edited-since-gone" }, { ...drive("e", DAY, "confirmed"), carSlug: "down" }], reviews: [], cars, costs: new Set(["old", "down"]), syncProblem: true, now });
    expect(o.attention.map((a) => [a.key, a.count])).toEqual([["sync", 1], ["sold-drives", 2], ["taken-down", 1], ["old", 1], ["costs", 1]]);
    // Without the margins permission there is no cost item at all, and a sold car is never old stock.
    expect(overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [], drives: [], reviews: [], cars: [car("gone", "2026-01-01", { soldAt: "2026-02-01" })], now }).attention).toEqual([]);
  });
  it("lists the records behind the to-dos in the order to work them, and today's open drives", () => {
    const o = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [lead("newer", 30 * HOUR), lead("older", 50 * HOUR), lead("fresh", HOUR)], drives: [drive("later", 2 * DAY, "requested"), drive("sooner", HOUR, "requested"), drive("past", -HOUR, "confirmed"), drive("off", 2 * HOUR, "cancelled")], reviews: [], now });
    expect(o.reply.map((t) => t.lead.id)).toEqual(["older", "newer", "fresh"]); // the late ones first, the longest waiting first
    expect(o.toConfirm.map((d) => d.id)).toEqual(["sooner", "later"]);
    expect(o.todayDrives.map((d) => d.id)).toEqual(["past", "sooner"]); // this morning's still counts; a cancelled one does not
  });
  it("counts each lead waiting on you once, by one rule: a follow-up due, else a new lead", () => {
    const today = "2026-11-10";
    const leads = [
      lead("fresh", HOUR),
      { ...lead("hot", 2 * HOUR), topic: "buying", answers: { timing: "this-week" } },
      lead("late", 30 * HOUR),
      { ...lead("new-due", 2 * HOUR), followUpOn: today }, // new, with a follow-up due: once, as a follow-up
      { ...lead("late-due", 30 * HOUR), followUpOn: today }, // red for being a late new lead, though its follow-up is only due today
      { ...lead("overdue", 5 * DAY, "contacted"), followUpOn: "2026-11-08" },
      { ...lead("today", 5 * DAY, "contacted"), followUpOn: today },
      { ...lead("later", 5 * DAY, "contacted"), followUpOn: "2026-11-12" },
      { ...lead("won", 5 * DAY, "won"), followUpOn: "2026-11-01" },
      lead("answered", 50 * HOUR, "contacted"),
    ] as Lead[];
    const t = leadsToAnswer(leads, now, today, 24);
    // Now first, then the longest waiting: a follow-up since its day, a new lead since it came in.
    expect(t.map((x) => [x.lead.id, x.kind, x.urgency])).toEqual([
      ["overdue", "follow", "now"],
      ["late", "reply", "now"],
      ["late-due", "follow", "now"],
      ["hot", "reply", "now"],
      ["new-due", "follow", "soon"],
      ["today", "follow", "soon"],
      ["fresh", "reply", "soon"],
    ]);
    // The Overview's two lead to-dos add up to the same count.
    const o = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads, drives: [], reviews: [], now, slaHours: 24 });
    expect(o.answer.length).toBe(7);
    expect(o.attention.filter((a) => a.key === "reply" || a.key === "follow").reduce((n, a) => n + a.count, 0)).toBe(7);
  });
  it("Only mine keeps what is given to that person or to nobody yet, and agrees with their report's follow-ups and with Leads", () => {
    const leads = [
      { ...lead("a", 5 * DAY, "contacted"), assignedTo: "Ciara", followUpOn: "2026-11-09" },
      { ...lead("b", 5 * DAY, "new"), assignedTo: "Ciara", followUpOn: "2026-11-10" },
      { ...lead("c", 5 * DAY, "contacted"), assignedTo: "Conor", followUpOn: "2026-11-09" },
      lead("d", 2 * HOUR), // a new website lead nobody has taken yet: stays in sight
      { ...lead("e", 5 * DAY, "new"), assignedTo: "Conor" },
      { ...lead("f", 5 * DAY, "contacted"), followUpOn: "2026-11-09" }, // nobody's follow-up: not in their report, so not here
    ] as Lead[];
    const drives = [{ ...drive("x", DAY, "requested"), assignedTo: "Ciara" }, drive("y", 2 * DAY, "requested"), { ...drive("z", DAY, "requested"), assignedTo: "Conor" }];
    const o = overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads, drives, reviews: [], now, mine: "Ciara" });
    expect(o.answer.map((t) => t.lead.id)).toEqual(["a", "b", "d"]);
    expect(o.toConfirm.map((d) => d.id)).toEqual(["x", "y"]);
    // Leads' To answer now with Only mine (the button's link) counts the same leads.
    expect(forPerson(leadsToAnswer(leads, now, "2026-11-10", 24), "Ciara").length).toBe(o.answer.length);
    expect(o.attention.find((a) => a.key === "follow")?.href).toBe("/leads?need=due&with=Ciara");
    expect(o.due.length).toBe(personalReport({ name: "Ciara", sales: [], leads, period: 3, now }).totals.followUpsDue);
    // Without it, the whole team's.
    expect(overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads, drives, reviews: [], now }).answer).toHaveLength(6);
  });
  it("averages ratings, and is 0 with no reviews", () => {
    expect(overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [], drives: [], reviews: [review("a", 5), review("b", 4)], now }).averageRating).toBe(4.5);
    expect(overview({ rules: DEMO_PROFILE.rules, listingSite: "DoneDeal", leads: [], drives: [], reviews: [], now }).averageRating).toBe(0);
  });
});
