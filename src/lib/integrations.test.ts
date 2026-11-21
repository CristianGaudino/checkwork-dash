import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { INTEGRATIONS, integrationText, isConnected, missingEnv } = await import("./integrations");

afterEach(() => vi.unstubAllEnvs());

describe("integrations", () => {
  it("is not connected until every setting is present, and says which are missing", () => {
    const social = INTEGRATIONS.find((i) => i.id === "social")!;
    expect(isConnected("social")).toBe(false);
    expect(missingEnv(social)).toEqual(social.env);
    vi.stubEnv("META_PAGE_ID", "1");
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "x");
    expect(isConnected("social")).toBe(false);
    expect(missingEnv(social)).toEqual(["META_INSTAGRAM_ID"]);
    vi.stubEnv("META_INSTAGRAM_ID", "2");
    expect(isConnected("social")).toBe(true);
  });
  it("treats an empty value as missing", () => {
    vi.stubEnv("CARTELL_API_KEY", "");
    expect(isConnected("reglookup")).toBe(false);
  });
  it("lists each service once, each with a setting but lead email, whose addresses are the dealer's (their profile, Settings)", () => {
    expect(new Set(INTEGRATIONS.map((i) => i.id)).size).toBe(INTEGRATIONS.length);
    expect(INTEGRATIONS.filter((i) => i.env.length === 0).map((i) => i.id)).toEqual(["email"]);
  });
  it("puts the dealer's name and listing site in a service's words", () => {
    const dd = integrationText(INTEGRATIONS.find((i) => i.id === "donedeal")!, { name: "Murphy Motors", site: "CarsIreland" });
    expect([dd.name, dd.demoAccount]).toEqual(["CarsIreland stock", "Murphy Motors on CarsIreland"]);
    expect(integrationText(INTEGRATIONS.find((i) => i.id === "social")!, { name: "Murphy Motors", site: "DoneDeal" }).demoAccount).toBe("@murphymotors");
  });
});

describe("simulation", () => {
  it("covers only the three outward services, and only until SIMULATE_INTEGRATIONS=off", async () => {
    const { modeOf } = await import("./integrations");
    expect(modeOf("social")).toBe("simulated");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(modeOf("botcheck")).toBe("off"); // the bot check shows its true state
    vi.stubEnv("SIMULATE_INTEGRATIONS", "off");
    expect(modeOf("social")).toBe("off");
  });
  it("does not simulate on a production site unless asked", async () => {
    const { simulating } = await import("./integrations");
    vi.stubEnv("APP_ENV", "production");
    expect(simulating()).toBe(false);
    vi.stubEnv("SIMULATE_INTEGRATIONS", "on");
    expect(simulating()).toBe(true);
    vi.stubEnv("APP_ENV", "demo");
    vi.stubEnv("SIMULATE_INTEGRATIONS", "");
    expect(simulating()).toBe(true);
  });
});
