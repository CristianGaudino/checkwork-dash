import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, DEMO_PROFILE, parseProfile, planOf } from "./profile";

// The plan a dealer pays for (#212): stored as `plan`, or read once from a profile saved with the old `modules` list.
describe("the plan from a stored profile", () => {
  it("reads an old modules list: the dashboard with a website part is both, the dashboard alone the dashboard, no dashboard the website", () => {
    expect(planOf({ modules: "all" }, "dashboard")).toBe("both");
    expect(planOf({ modules: "dashboard,tradeIn,sales" }, "dashboard")).toBe("both");
    expect(planOf({ modules: "dashboard, testDrives, reviews" }, "website")).toBe("dashboard"); // reviews is in both, so not a website part
    expect(planOf({ modules: "tradeIn,finance,reviews" }, "dashboard")).toBe("website");
    expect(planOf({ modules: "" }, "dashboard")).toBe("website"); // nothing on was the website alone
  });
  it("keeps a stored plan over the old list, and falls back to the base's with neither, or with a plan it does not know", () => {
    expect(planOf({ plan: "website", modules: "all" }, "dashboard")).toBe("website");
    expect(planOf({}, "dashboard")).toBe("dashboard");
    expect(planOf({ plan: "gold" }, "both")).toBe("both");
    expect(planOf({ plan: "toString" }, "both")).toBe("both"); // a name every object has is not a plan
  });
  it("gives a dealer with nothing set the dashboard plan, and the demo dealer both", () => {
    expect(parseProfile(null).plan).toBe("dashboard");
    expect(parseProfile("{}", DEMO_PROFILE).plan).toBe("both");
    expect(parseProfile(JSON.stringify({ modules: "tradeIn" })).plan).toBe("website");
    expect(DEFAULT_PROFILE.plan).toBe("dashboard");
  });
});
