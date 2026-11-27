import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Meter, figureSize, initials, pageOf, paginate, sortRows, type Column } from "./kit";

describe("paginate", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i);
  it("cuts a long list into pages of 25, or the size asked for", () => {
    expect(paginate(rows, "2")).toMatchObject({ page: 2, pageCount: 5, total: 120, per: 25, rows: rows.slice(25, 50) });
    expect(paginate(rows, "3", 50).rows).toEqual(rows.slice(100, 120));
  });
  it("takes the Rows choice from the URL, and only the sizes offered", () => {
    expect(pageOf(rows, { per: "10", page: "2" })).toMatchObject({ per: 10, pageCount: 12, rows: rows.slice(10, 20) });
    expect(pageOf(rows, { per: "7" }).per).toBe(25);
    expect(pageOf(rows, { per: "100" }).pageCount).toBe(2);
  });
  it("a bad or stale page number shows the nearest real page, never an empty one", () => {
    expect(paginate(rows, "99").page).toBe(5);
    expect(paginate(rows, "0").page).toBe(1);
    expect(paginate(rows, "abc").page).toBe(1);
    expect(paginate(rows, undefined).page).toBe(1);
    expect(paginate([], "4")).toMatchObject({ page: 1, pageCount: 1, rows: [] });
  });
});

describe("sortRows", () => {
  type R = { name: string; price?: number };
  const rows: R[] = [{ name: "b10", price: 3 }, { name: "B2" }, { name: "a", price: 1 }];
  const cols: Column<R>[] = [
    { key: "name", header: "Name", cell: () => null, sort: (r) => r.name },
    { key: "price", header: "Price", cell: () => null, sort: (r) => r.price },
    { key: "photo", header: "Photo", cell: () => null },
  ];
  const by = (sp: { sort?: string; dir?: string }) => sortRows(rows, cols, sp, { key: "price", dir: "desc" });
  it("sorts by the column the URL names, either way, letters as people read them, empties last", () => {
    expect(by({ sort: "name" }).rows.map((r) => r.name)).toEqual(["a", "B2", "b10"]);
    expect(by({ sort: "name", dir: "desc" }).rows.map((r) => r.name)).toEqual(["b10", "B2", "a"]);
    expect(by({ sort: "price" }).rows.map((r) => r.price)).toEqual([1, 3, undefined]);
    expect(by({ sort: "price", dir: "desc" }).rows.map((r) => r.price)).toEqual([3, 1, undefined]);
  });
  it("ignores a column that does not sort or does not exist, and keeps the page's own order", () => {
    expect(by({ sort: "photo" }).sort).toEqual({ key: "price", dir: "desc" });
    expect(by({ sort: "nope" }).rows.map((r) => r.price)).toEqual([3, 1, undefined]);
    expect(sortRows(rows, cols, {}, { key: "", dir: "asc" }).rows).toEqual(rows);
  });
});

describe("a headline figure's size", () => {
  it("is large, and makes a long word smaller so it never breaks inside", () => {
    expect(figureSize("€117,565")).toBe("text-[min(3.5rem,20cqi)]");
    expect(figureSize("WhatsApp")).toBe("text-[min(3.5rem,15cqi)]"); // at 20cqi it broke as "WhatsAp / p"
    expect(figureSize("€5,864,950")).toBe("text-[min(3.5rem,15cqi)]");
    expect(figureSize("Bookmarked")).toBe("text-[min(3.5rem,12cqi)]");
  });
});

describe("initials", () => {
  it("takes the first and last word, so a long Irish name is CP, not CÓ", () => {
    expect(initials("Caoimhín Ó Súilleabháin-Mac Giolla Phádraig")).toBe("CP");
    expect(initials("  mary   o'brien ")).toBe("MO");
    expect(initials("Aoife")).toBe("A");
    expect(initials("")).toBe("");
  });
});

describe("Meter", () => {
  const fill = (lead?: boolean) => renderToStaticMarkup(createElement(Meter, { value: 3, max: 4, lead }));
  it("is neutral, and the accent only when it leads", () => {
    expect(fill()).toContain("bg-chart-muted");
    expect(fill()).not.toContain("bg-accent");
    expect(fill(true)).toContain("bg-accent");
    expect(fill(true)).toContain("width:75%");
  });
});
