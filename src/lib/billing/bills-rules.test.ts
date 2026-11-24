import { describe, expect, it } from "vitest";
import { itemise, nextBillDate, parseEuro, parseLimits, usageLines, type Bill } from "./bills-rules";

describe("parseEuro", () => {
  it("reads blank, whole euros and cents", () => {
    expect(parseEuro("")).toEqual({});
    expect(parseEuro("20")).toEqual({ eur: 20 });
    expect(parseEuro("€20,50")).toEqual({ eur: 20.5 });
    expect(parseEuro("0")).toEqual({ eur: 0 });
  });
  it("refuses a negative, a word, three decimals and over 10,000", () => {
    for (const bad of ["-5", "abc", "1.234", "10000.01", "1e3"]) expect(parseEuro(bad).error).toBeTruthy();
    expect(parseEuro("10000")).toEqual({ eur: 10000 });
  });
});

describe("parseLimits", () => {
  const get = (v: Record<string, string>) => (k: string) => v[k] ?? "";
  it("keeps what is set and drops blanks", () => {
    expect(parseLimits(get({ "cap-lookup": "9", "cap-whatsapp": "" }), {}, ["lookup", "whatsapp"]).caps).toEqual({ lookup: 9 });
  });
  it("never lets a limit pass ours", () => {
    const r = parseLimits(get({ "cap-whatsapp": "200" }), { whatsapp: 150 }, ["whatsapp"]);
    expect(r.errors["cap-whatsapp"]).toBe("Our limit for your account is €150");
    expect(parseLimits(get({ "cap-whatsapp": "150" }), { whatsapp: 150 }, ["whatsapp"]).errors).toEqual({});
  });
});

describe("itemise", () => {
  const bill: Bill = {
    id: "2026-10", issuedOn: "2026-11-01", dueOn: "2026-12-01", status: "due", modules: [{ label: "Website + Dashboard plan", eur: 249 }, { label: "Social and ads", eur: 29 }], // as stored, whatever today's prices
    usage: [{ service: "ai", kind: "opus", count: 10, unitEur: 0.05 }, { service: "whatsapp", kind: "alert", count: 0, unitEur: 0.05 }],
  };
  it("adds the plan and the usage, then VAT, and takes a first month free off", () => {
    const t = itemise(bill);
    expect(t.planEur).toBe(278);
    expect(t.usageEur).toBe(0.5);
    expect(t.net).toBe(278.5);
    expect(t.vatEur).toBe(64.06);
    expect(t.total).toBe(342.56);
    expect(t.usage).toHaveLength(1); // a line with no uses is left out
    expect(t.usage[0].detail).toBe("10 x €0.05");
    expect(itemise({ ...bill, modules: [...bill.modules, { label: "First month free", eur: -278 }] }).planEur).toBe(0);
  });
  it("still labels a stored line for the website's lookup, which is no longer billed (#182)", () => {
    expect(itemise({ ...bill, usage: [{ service: "lookup", kind: "website", count: 3, unitEur: 0.3 }] }).usage[0].label).toBe("Registration lookup: on the website");
  });
  it("bills only the uses past what the plan includes, and never AI writing", () => {
    const usage = usageLines([{ service: "lookup", kind: "dashboard", count: 30 }, { service: "whatsapp", kind: "reply", count: 10 }, { service: "ai", kind: "opus", count: 50 }], { lookup: 25 });
    expect(usage.some((u) => u.service === "ai")).toBe(false);
    const t = itemise({ ...bill, usage });
    expect(t.usage.map((l) => l.detail)).toEqual(["5 x €0.30", "10 x €0.03"]);
    expect(t.usageEur).toBe(1.8);
  });
});

describe("dates", () => {
  it("bills on the first of next month", () => {
    expect(nextBillDate(new Date("2026-12-31T10:00:00Z"))).toBe("1 January 2027");
  });
});

import { servicesOf } from "./bills-rules";
describe("servicesOf", () => {
  it("lists a paid service only when its module is on, and never AI writing", () => {
    expect(servicesOf(new Set(["lookupDashboard", "ai", "whatsapp"]))).toEqual(["lookup", "whatsapp"]);
    expect(servicesOf(new Set(["dashboard"]))).toEqual([]);
  });
});
