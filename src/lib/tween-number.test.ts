import { describe, expect, it } from "vitest";
import { countable, figureAt, parseFigure } from "./tween-number";

describe("tween-number", () => {
  it("splits a figure into its number and words", () => {
    expect(parseFigure("€5,864,950")).toEqual({ before: "€", n: 5864950, decimals: 0, grouped: true, after: "" });
    expect(parseFigure("124 cars")).toEqual({ before: "", n: 124, decimals: 0, grouped: false, after: " cars" });
    expect(parseFigure("4.6")).toMatchObject({ n: 4.6, decimals: 1 });
    expect(parseFigure("3 of 12")).toBeNull();
    expect(parseFigure("Not set")).toBeNull();
  });

  it("counts only when the words stay the same", () => {
    expect(countable(parseFigure("12 cars"), parseFigure("124 cars"))).toBe(true);
    expect(countable(parseFigure("1 car"), parseFigure("2 cars"))).toBe(false);
    expect(countable(parseFigure("€300"), parseFigure("€300"))).toBe(false);
    expect(countable(parseFigure("€300"), null)).toBe(false);
  });

  it("starts on the old value, ends exactly on the new one, and groups thousands on the way", () => {
    const from = parseFigure("€950")!;
    const to = parseFigure("€1,200")!;
    expect(figureAt(from, to, 0)).toBe("€950");
    expect(figureAt(from, to, 1)).toBe("€1,200");
    expect(figureAt(from, to, 0.5)).toMatch(/^€1,1\d\d$/);
    expect(figureAt(parseFigure("4.1")!, parseFigure("4.6")!, 1)).toBe("4.6");
  });

  it("counts a rounded figure by its number, keeping the k or m", () => {
    expect(parseFigure("€118k")).toEqual({ before: "€", n: 118, decimals: 0, grouped: false, after: "k" });
    expect(parseFigure("-€1.2m")).toEqual({ before: "-€", n: 1.2, decimals: 1, grouped: false, after: "m" });
    expect(countable(parseFigure("12.4k"), parseFigure("13k"))).toBe(true);
    expect(countable(parseFigure("€950"), parseFigure("€1.2k"))).toBe(false);
    expect(countable(parseFigure("€999k"), parseFigure("€1m"))).toBe(false);
    const from = parseFigure("12.4k")!;
    const to = parseFigure("13k")!;
    expect(figureAt(from, to, 0)).toBe("12.4k");
    expect(figureAt(from, to, 1)).toBe("13k");
    expect(figureAt({ ...to, n: 0 }, to, 0.5)).toMatch(/^\d+k$/);
    expect(figureAt({ ...parseFigure("€1.2m")!, n: 0 }, parseFigure("€1.2m")!, 0.5)).toMatch(/^€\d\.[1-9]m$|^€\dm$/); // never "€0.0m"
    for (let t = 0; t <= 1; t += 0.01) expect(figureAt(parseFigure("12.4k")!, parseFigure("13.2k")!, t)).not.toMatch(/\.0[km]/);
    for (let t = 0; t <= 1; t += 0.01) expect(figureAt({ ...parseFigure("€1.2m")!, n: 0 }, parseFigure("€1.2m")!, t)).not.toMatch(/\.0[km]/);
  });
});
