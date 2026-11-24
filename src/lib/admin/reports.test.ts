import { describe, expect, it } from "vitest";
import type { Lead, Sale } from "./collections";
import type { Car } from "@/lib/stock/types";
import { fullReport, monthsBetween, monthsOf, personalReport, salesCsv } from "./reports";

const now = Date.parse("2026-11-11T12:00:00Z");
const sale = (id: string, soldOn: string, priceEur: number, salesperson?: string): Sale => ({ id, carTitle: id, priceEur, soldOn, salesperson, createdAt: 0 });
const lead = (id: string, at: string, o: Partial<Lead> = {}) => ({ id, status: "new", source: "Website", createdAt: Date.parse(`${at}T12:00:00Z`), ...o }) as Lead;
const car = (id: string, listedAt: string, o: Partial<Car> = {}) => ({ id, listedAt, priceEur: 10000, photos: [], ...o }) as Car;

describe("monthsOf", () => {
  it("counts whole months back from this one, across a year end", () => {
    expect(monthsOf(3, "2026-11-11")).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(monthsOf(3, "2026-01-31")).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("fullReport", () => {
  const input = {
    sales: [sale("a", "2026-11-02", 12000, "Conor"), sale("b", "2026-10-20", 9000, "Aoife"), sale("c", "2026-10-01", 5000), sale("old", "2026-07-01", 7000, "Conor"), { ...sale("ret-1", "2026-10-02", 15000, "Conor"), carId: "z", returnedOn: "2026-10-20", kind: "returned" as const, refundEur: 15000 }],
    cars: [car("a", "2026-10-03", { soldAt: "2026-11-02" }), car("b", "2026-10-10", { soldAt: "2026-10-20" }), car("new", "2026-11-01"), car("aged", "2026-08-01", { priceEur: 8000 })],
    leads: [lead("1", "2026-11-01", { assignedTo: "Conor", status: "won", source: "Phone" }), lead("2", "2026-10-05", { assignedTo: "Conor" }), lead("3", "2026-10-06", { source: "Phone" }), lead("x", "2026-06-01", { assignedTo: "Conor", status: "won" })],
    team: ["Aoife", "Conor", "Niamh"],
    costs: new Map([["a", 10000], ["b", 8500]]),
    prep: [{ id: "a", lines: [{ kind: "Tyres" as const, eur: 300, at: Date.parse("2026-10-05") }, { kind: "Valet" as const, eur: 100, at: Date.parse("2026-05-01") }] }],
    period: 3 as const,
    now,
    oldDays: 120,
  };
  const r = fullReport(input);

  it("totals the period's sales, profit only where a cost is known, and the average days to sell", () => {
    expect(r.months.map((m) => [m.month, m.sold, m.value])).toEqual([["2026-09", 0, 0], ["2026-10", 2, 14000], ["2026-11", 1, 12000]]);
    expect(r.totals).toEqual({ sold: 3, value: 26000, profit: 2000 + 500, costed: 2, avgDaysToSell: Math.round((30 + 10) / 2) });
  });
  it("leaves a returned sale out of the sales and counts it, with its refund, as a return", () => {
    expect(r.returns).toEqual({ count: 1, refundEur: 15000 });
    expect(personalReport({ name: "Conor", sales: input.sales, leads: [], period: 3, now }).totals.sold).toBe(1);
  });
  it("ranks the people who sold or had leads, and keeps someone no longer on the team", () => {
    expect(r.people.map((p) => [p.name, p.sold, p.leads, p.won, p.winRate])).toEqual([["Conor", 1, 2, 1, 50], ["Aoife", 1, 0, 0, 0]]);
    const gone = fullReport({ ...input, team: [], oldDays: 120 });
    expect(gone.people.map((p) => p.name)).toEqual(["Conor", "Aoife"]);
  });
  it("counts a closed lead as a lead that did not buy, never as lost; leaves spam out of every figure (#55, #56)", () => {
    const closed = lead("c", "2026-11-04", { assignedTo: "Conor", status: "closed", closedReason: "Duplicate", source: "Phone" });
    const withClosed = fullReport({ ...input, leads: [...input.leads, closed], oldDays: 120 });
    expect(withClosed.lost).toEqual(r.lost);
    expect(withClosed.people.find((p) => p.name === "Conor")).toMatchObject({ leads: 3, won: 1, winRate: 33 });
    expect(withClosed.sources.find((s) => s.source === "Phone")).toEqual({ source: "Phone", leads: 3, won: 1, winRate: 33 });
    const spam = lead("s", "2026-11-04", { assignedTo: "Conor", status: "spam", source: "Phone" });
    const withSpam = fullReport({ ...input, leads: [...input.leads, spam], oldDays: 120 });
    expect([withSpam.people, withSpam.sources, withSpam.lost]).toEqual([r.people, r.sources, r.lost]);
    expect(personalReport({ name: "Conor", sales: [], leads: [...input.leads, spam], period: 3, now }).totals).toMatchObject({ leads: 2, won: 1, winRate: 50 });
  });
  it("shows which lead sources win, the stock by age, and the period's prep by kind", () => {
    expect(fullReport({ ...input, leads: [lead("l1", "2026-11-01", { status: "lost", lostReason: "Price" }), lead("l2", "2026-11-02", { status: "lost", lostReason: "Price" }), lead("l3", "2026-11-03", { status: "lost" })], oldDays: 120 }).lost).toEqual([{ reason: "Price", leads: 2 }, { reason: "Not said", leads: 1 }]);
    expect(r.sources).toEqual([{ source: "Phone", leads: 2, won: 1, winRate: 50 }, { source: "Website", leads: 1, won: 0, winRate: 0 }]);
    expect(r.stockAge.map((b) => [b.band, b.cars, b.value])).toEqual([["Under 30 days", 1, 10000], ["30 to 59 days", 0, 0], ["60 to 119 days", 1, 8000], ["120 days or more", 0, 0]]);
    expect(r.prep).toEqual([{ kind: "Tyres", eur: 300, lines: 1 }]);
  });
});

describe("personalReport", () => {
  it("counts only their own sales and leads, never money", () => {
    const p = personalReport({
      name: "Conor",
      sales: [sale("a", "2026-11-02", 12000, "Conor"), sale("b", "2026-11-03", 9000, "Aoife")],
      leads: [lead("1", "2026-11-01", { assignedTo: "Conor", status: "won" }), lead("2", "2026-10-05", { assignedTo: "Conor", status: "contacted", followUpOn: "2026-11-10" }), lead("3", "2026-11-01", { assignedTo: "Aoife" })],
      period: 3,
      now,
    });
    expect(p.totals).toEqual({ sold: 1, leads: 2, won: 1, winRate: 50, followUpsDue: 1 });
    expect(JSON.stringify(p)).not.toMatch(/12000|9000|value|profit/);
  });
});

describe("salesCsv", () => {
  const cost = (purchase: number, prep = 0, claims = 0) => ({ purchase, prep, claims, total: purchase + prep + claims });
  const sales: Sale[] = [
    { ...sale("a", "2026-11-02", 12000, "Conor"), customerId: "cust-1", coverMonths: 24, tradeIn: { reg: "151-D-23817", allowanceEur: 2500 } },
    sale("b", "2026-10-20", 9000, "Aoife"),
    sale("c", "2026-10-01", 5000),
    sale("old", "2026-07-01", 7000, "Conor"),
    { ...sale("undone-1", "2026-10-02", 15000, "Conor"), carId: "a", returnedOn: "2026-10-20", kind: "returned", refundEur: 14500 },
  ];
  const cars = [car("a", "2026-10-03", { reg: "191-D-12345", make: "Volkswagen", model: "Golf", year: 2019 })];
  const costs = new Map([["a", cost(9000, 600, 400)], ["b", cost(8500)]]);
  const rows = salesCsv({ sales, cars, costs, months: monthsOf(3, "2026-11-11") }).trim().split("\r\n").map((l) => l.split(","));
  const col = (name: string) => rows.slice(1).map((r) => r[rows[0].indexOf(name)]);
  const total = (name: string) => col(name).reduce((t, v) => t + Number(v || 0), 0);

  it("has a row for each sale of the period, oldest first, then the undone ones marked with their refund", () => {
    expect(rows[0]).toEqual(["Sale date", "Registration", "Make", "Model", "Year", "Sale price (€)", "Cost price (€)", "Prep (€)", "Warranty repairs (€)", "Margin (€)", "Warranty (months)", "Trade-in reg", "Trade-in allowance (€)", "Salesperson", "Returned", "Refund (€)"]);
    expect(rows.slice(1)).toEqual([
      ["2026-10-01", "", "c", "", "", "5000", "", "", "", "", "12", "", "", "", "", ""],
      ["2026-10-20", "", "b", "", "", "9000", "8500", "0", "0", "500", "12", "", "", "Aoife", "", ""],
      ["2026-11-02", "191-D-12345", "Volkswagen", "Golf", "2019", "12000", "9000", "600", "400", "2000", "24", "151-D-23817", "2500", "Conor", "", ""],
      ["2026-10-02", "191-D-12345", "Volkswagen", "Golf", "2019", "", "", "", "", "", "12", "", "", "Conor", "Returned 2026-10-20", "14500"],
    ]);
  });
  it("adds up to the same sales, profit and refunds as Reports", () => {
    const r = fullReport({ sales, cars, leads: [], team: [], costs: new Map([...costs].map(([id, c]) => [id, c.total])), prep: [], period: 3, now, oldDays: 120 });
    expect([total("Sale price (€)"), total("Margin (€)"), col("Margin (€)").filter(Boolean).length, total("Refund (€)")]).toEqual([r.totals.value, r.totals.profit, r.totals.costed, r.returns.refundEur]);
    expect(col("Returned").filter(Boolean).length).toBe(r.returns.count);
    expect(rows.length - 1 - r.returns.count).toBe(r.totals.sold);
  });
  it("never has the buyer", () => {
    expect(rows[0].join(" ")).not.toMatch(/buyer|customer|name|email|phone/i);
    expect(rows.flat()).not.toContain("cust-1");
  });
});

describe("monthsBetween", () => {
  it("lists the months from one to another, both included, and refuses a range that is not one", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-11", "2026-11")).toEqual(["2026-11"]);
    expect([monthsBetween("2026-03", "2026-01"), monthsBetween("2026-13", "2026-14"), monthsBetween("2000-01", "2026-01"), monthsBetween("", "")]).toEqual([null, null, null, null]);
  });
});
