import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODULES, MODULE_IDS, moduleForPath, parseModules, pathAllowed, withModule, withoutModule } from "./modules-rules";

describe("modules", () => {
  it("reads unset or 'all' as every module, so an older site keeps what it had", () => {
    expect(parseModules(undefined).size).toBe(MODULE_IDS.length);
    expect(parseModules("all").size).toBe(MODULE_IDS.length);
  });

  it("reads an empty setting as the base site only, and ignores what it does not know", () => {
    expect([...parseModules("")]).toEqual([]);
    expect([...parseModules("finance,rocket")]).toEqual(["finance"]);
    // The website's lookup is gone (#182): a stored plan that lists it keeps the rest.
    expect([...parseModules("tradeIn,lookupWebsite,dashboard,lookupDashboard")]).toEqual(["tradeIn", "dashboard", "lookupDashboard"]);
  });

  it("drops a module whose needs are off, through the chain", () => {
    expect(parseModules("margins,sales").has("margins")).toBe(false); // sales needs the dashboard
    expect([...parseModules("margins,sales,dashboard")].sort()).toEqual(["dashboard", "margins", "sales"]);
  });

  it("turning one on brings what it needs; turning one off takes what needs it", () => {
    expect([...withModule(new Set(), "margins")].sort()).toEqual(["dashboard", "margins", "sales"]);
    expect([...withoutModule(parseModules("dashboard,sales,margins,finance"), "dashboard")]).toEqual(["finance"]);
  });

  it("finds the module of a path by its longest prefix", () => {
    expect(moduleForPath("/test-drives/abc")).toBe("testDrives");
    expect(moduleForPath("/leads")).toBeUndefined(); // the dashboard alone
    expect(moduleForPath("/test-drivesx")).toBeUndefined(); // a prefix is a whole segment
  });

  it("allows a page only with the dashboard, and a module page only with its module too", () => {
    const base = parseModules("");
    expect(pathAllowed("/", base)).toBe(false);
    expect(pathAllowed("/leads", base)).toBe(false);
    expect(pathAllowed("/leads", parseModules("dashboard"))).toBe(true);
    expect(pathAllowed("/test-drives", parseModules("dashboard"))).toBe(false);
    expect(pathAllowed("/test-drives", parseModules("dashboard,testDrives"))).toBe(true);
  });

  it("keeps reviews on a site without the dashboard, and the replies page needs the dashboard (#224)", () => {
    const showroom = parseModules("reviews");
    expect([...showroom]).toEqual(["reviews"]);
    expect(pathAllowed("/reviews", showroom)).toBe(false);
    expect(pathAllowed("/reviews", parseModules("dashboard,reviews"))).toBe(true);
    expect([...withModule(new Set(), "reviews")]).toEqual(["reviews"]);
    expect([...withoutModule(parseModules("dashboard,reviews"), "dashboard")]).toEqual(["reviews"]);
  });
});

describe("each module's dashboard pages", () => {
  it("sit under a layout that checks that module on the server (PlanGate), so a module that is off is never shown", () => {
    for (const m of MODULES)
      for (const path of m.dashboard) {
        const layout = readFileSync(`src/app${path}/layout.tsx`, "utf8");
        expect(layout, path).toContain(`<PlanGate id="${m.id}">`);
      }
  });
});
