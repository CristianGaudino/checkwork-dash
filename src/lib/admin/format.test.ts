import { describe, expect, it } from "vitest";
import { addMonths, daysSince, fmtCompact, fmtCompactEur, isIsoDay, isIsoMonth, fmtAgo, fmtAgoOn, fmtDateTime, fmtDay, fmtEur, fmtPct, fmtTime, monthChoices, plural, threeLetter } from "./format";

describe("admin format", () => {
  const now = new Date("2026-11-10T12:00:00Z").getTime();
  it("says how long ago, in the biggest unit that fits", () => {
    expect(fmtAgo(now - 5 * 3600_000, now)).toBe("5 hours ago");
    expect(fmtAgo(now - 86400_000, now)).toBe("yesterday");
    expect(fmtAgo(now - 20_000, now)).toBe("just now");
  });
  it("says days up to a week, then the date", () => {
    expect(fmtAgo(now - 6 * 86400_000, now)).toBe("6 days ago");
    expect(fmtAgo(now - 7 * 86400_000, now)).toBe("7 days ago");
    expect(fmtAgo(now - 8 * 86400_000, now)).toBe("2 November");
    expect(fmtAgo(Date.parse("2021-11-25T12:00:00Z"), now)).toBe("25 November 2021");
  });
  it("puts on before the day in a sentence, not before a time ago", () => {
    expect(fmtAgoOn(now - 6 * 86400_000, now)).toBe("6 days ago");
    expect(fmtAgoOn(now - 8 * 86400_000, now)).toBe("on 2 November");
    expect(fmtAgoOn(Date.parse("2021-11-25T12:00:00Z"), now)).toBe("on 25 November 2021");
  });
  it("writes euros without cents and a percentage with one decimal at most", () => {
    expect(fmtEur(12500)).toBe("€12,500");
    expect(fmtPct(12.345)).toBe("12.3%");
    expect(fmtPct(8)).toBe("8.0%");
  });
  it("rounds a figure read at a glance, never one under 1,000, with a decimal only below 100 of the unit", () => {
    const cases: [number, string, string][] = [
      [0, "0", "€0"],
      [999, "999", "€999"],
      [1000, "1k", "€1k"],
      [1234, "1.2k", "€1.2k"],
      [9950, "10k", "€10k"],
      [12400, "12.4k", "€12.4k"],
      [99949, "99.9k", "€99.9k"],
      [99950, "100k", "€100k"],
      [117565, "118k", "€118k"],
      [999499, "999k", "€999k"],
      [999500, "1m", "€1m"],
      [999949, "1m", "€1m"],
      [999950, "1m", "€1m"],
      [1050000, "1.1m", "€1.1m"],
      [5864950, "5.9m", "€5.9m"],
      [-999, "-999", "-€999"],
      [-1050000, "-1.1m", "-€1.1m"],
    ];
    for (const [n, count, eur] of cases) {
      expect(fmtCompact(n)).toBe(count);
      expect(fmtCompactEur(n)).toBe(eur);
    }
    expect(fmtCompact(NaN)).toBe("NaN");
    expect(fmtCompactEur(Infinity)).toBe("€∞");
  });
  it("writes September in full, and short as Sep", () => {
    expect(fmtDay("2027-09-01", "monthYear")).toBe("September 2027");
    expect(threeLetter("1 Sept 2027")).toBe("1 Sep 2027");
  });
});

describe("Irish time", () => {
  it("shows a summer moment an hour ahead of UTC, and a winter one the same", () => {
    expect(fmtDateTime(Date.UTC(2026, 6, 1, 10, 0))).toContain("11:00");
    expect(fmtDateTime(Date.UTC(2026, 0, 15, 10, 0))).toContain("10:00");
  });
});

describe("the year on a day or moment outside this Irish year", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  it("leaves this year's out and puts another year's in", () => {
    expect(fmtDay("2026-03-14", "dayMonth", now)).toBe("14 March");
    expect(fmtDay("2023-03-14", "dayMonth", now)).toBe("14 March 2023");
    expect(fmtDay("2023-03-14", "long", now)).toBe("Tuesday 14 March 2023");
    expect(["weekday", "day", "month"].map((s) => fmtDay("2023-03-14", s as "day", now)).join(" ")).toBe("Tue 14 Mar 2023");
    expect(fmtDay("2027-01-04", "month", now)).toBe("Jan 2027");
    expect(fmtDateTime(Date.parse("2026-02-27T23:03:00Z"), now)).toBe("27 Feb, 23:03");
    expect(fmtDateTime(Date.parse("2024-02-29T23:03:00Z"), now)).toBe("29 Feb 2024, 23:03");
  });
  it("takes the year in Dublin time around New Year", () => {
    const newYear = Date.parse("2026-12-31T23:30:00Z"); // 23:30 on New Year's Eve in Dublin (UTC in winter)
    expect(fmtDay("2026-12-31", "dayMonth", newYear)).toBe("31 December");
    expect(fmtDay("2027-01-01", "dayMonth", newYear)).toBe("1 January 2027");
    expect(fmtDateTime(newYear, newYear)).toBe("31 Dec, 23:30");
    expect(fmtDateTime(newYear + 3600_000, newYear)).toBe("1 Jan 2027, 00:30");
    expect(fmtDateTime(newYear, newYear + 3600_000)).toBe("31 Dec 2026, 23:30");
  });
});

describe("monthChoices", () => {
  it("lists months as YYYY-MM with their names, across the new year", () => {
    expect(monthChoices("2026-11", 3)).toEqual([["2026-11", "November 2026"], ["2026-12", "December 2026"], ["2027-01", "January 2027"]]);
  });
});

describe("addMonths", () => {
  it("keeps the day, or takes the month's last when it is shorter", () => {
    expect(addMonths("2026-11-11", 2)).toBe("2027-01-11");
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(addMonths("2027-12-31", 2)).toBe("2028-02-29");
  });
});

describe("plural", () => {
  it("says one, many and none as written, with the number formatted", () => {
    expect(plural(1, "review")).toBe("1 review");
    expect(plural(0, "review")).toBe("0 reviews");
    expect(plural(1284, "car")).toBe("1,284 cars");
    expect(plural(2, "sold car")).toBe("2 sold cars");
  });
  it("says a calendar day the same in any zone, and a time in Irish time", () => {
    const in2026 = Date.parse("2026-11-10T12:00:00Z");
    expect(fmtDay("2026-11-12", "long", in2026)).toBe("Thursday, 12 November");
    expect(fmtDay("2026-11-12", "weekday", in2026)).toBe("Thu");
    expect(fmtDay("2026-11-12", "day", in2026)).toBe("12");
    expect(fmtDay("2026-11-12", "month", in2026)).toBe("Nov");
    expect(fmtDay("2026-11-12", "dayMonth", in2026)).toBe("12 November");
    expect(fmtTime(Date.parse("2026-07-01T10:30:00Z"))).toBe("11:30"); // summer time
    expect(fmtTime(Date.parse("2026-11-12T10:30:00Z"))).toBe("10:30");
  });
  it("counts whole days in stock, never below zero", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    expect(daysSince("2026-11-01", now)).toBe(9);
    expect(daysSince("2026-11-10", now)).toBe(0);
    expect(daysSince("2026-12-01", now)).toBe(0);
  });
  it("takes only real days and months", () => {
    expect(isIsoDay("2026-11-12")).toBe(true);
    expect(isIsoDay("2028-02-29")).toBe(true);
    for (const bad of ["2026-13-45", "2026-02-31", "2026-02-29", "2026-1-5", "12/11/2026", ""]) expect(isIsoDay(bad)).toBe(false);
    expect(isIsoMonth("2026-12")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "2026-1"]) expect(isIsoMonth(bad)).toBe(false);
  });
});
