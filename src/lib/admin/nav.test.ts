import { describe, expect, it } from "vitest";
import { DEALER_NAV, DEFAULT_OPEN, menuItems, navGroups, openGroupsCookie, parseOpenGroups } from "./nav";

describe("the sidebar's groups", () => {
  it("puts Overview and the everyday places on their own, then each heading with the items under it, every item once", () => {
    const { top, groups } = navGroups(DEALER_NAV);
    expect(top.map((i) => i.label)).toEqual(["Overview", "Leads", "Test drives", "Stock", "Marketing"]);
    expect(groups.map((g) => g.name)).toEqual(["Customers", "Results", "Settings and help"]);
    expect(groups[0].items.map((i) => i.label)).toEqual(["Customers", "Warranty claims", "Reviews"]);
    expect(groups[2].items.map((i) => i.label)).not.toContain("WhatsApp"); // a channel in Settings now (#142), not a place
    expect(top.length + groups.reduce((n, g) => n + g.items.length, 0)).toBe(DEALER_NAV.length);
  });
  it("keeps a heading when a role filters out its first item", () => {
    // Reports starts Results; without it (no Margins module) the group still holds the monthly report, so it must still show.
    const { groups } = navGroups(DEALER_NAV.filter((i) => i.href !== "/reports"));
    expect(groups.map((g) => g.name)).toContain("Results");
  });
  it("shows Reports once: Reports itself when allowed, else its Monthly view", () => {
    const results = (items: typeof DEALER_NAV) => navGroups(menuItems(items, 1)).groups.find((g) => g.name === "Results")!.items.map((i) => `${i.label} ${i.href}`);
    expect(results(DEALER_NAV)).toEqual(["Reports /reports", "Analytics /analytics", "Margins /margins"]);
    expect(results(DEALER_NAV.filter((i) => i.href !== "/reports" && i.href !== "/margins"))).toEqual(["Reports /monthly-report", "Analytics /analytics"]);
  });
  it("shows Switch dealer only to someone at two or more dealers, with its own icon", () => {
    expect(menuItems(DEALER_NAV, 1).some((i) => i.href === "/dealers")).toBe(false);
    const sw = menuItems(DEALER_NAV, 2).at(-1)!;
    expect(sw).toMatchObject({ href: "/dealers", label: "Switch dealer", group: "Settings and help" });
    expect(sw.icon).not.toBe("home");
  });
});

describe("which groups are open", () => {
  it("starts with Customers open, and reads back what was saved, an empty choice included", () => {
    expect(parseOpenGroups(undefined)).toEqual(DEFAULT_OPEN);
    expect(DEFAULT_OPEN).toEqual(["Customers"]);
    const saved = openGroupsCookie(["Customers", "Results"]).split(";")[0].split("=")[1];
    expect(parseOpenGroups(saved)).toEqual(["Customers", "Results"]);
    expect(parseOpenGroups("")).toEqual([]);
    expect(parseOpenGroups("%E0%A4%A")).toEqual(DEFAULT_OPEN); // does not decode
  });
});
