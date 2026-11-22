import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { INTEGRATIONS, integrationText, isConnected, missingEnv } = await import("./integrations");

afterEach(() => vi.unstubAllEnvs());

describe("integrations", () => {
  it("is not connected until every setting is present, and says which are missing", async () => {
    const social = INTEGRATIONS.find((i) => i.id === "social")!;
    expect(await isConnected("social")).toBe(false);
    expect(await missingEnv(social)).toEqual(social.env);
    // Meta's settings are the dealer's own: an app-wide variable never counts for them (src/lib/dealer-secrets.ts).
    for (const k of ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN", "META_INSTAGRAM_ID"]) vi.stubEnv(k, "x");
    expect(await isConnected("social")).toBe(false);
    // Ours are the Worker secrets.
    const news = INTEGRATIONS.find((i) => i.id === "newsletter")!;
    vi.stubEnv("NEWSLETTER_API_KEY", "x");
    expect(await missingEnv(news)).toEqual(["NEWSLETTER_FROM_EMAIL", "UNSUBSCRIBE_SECRET"]);
  });
  it("treats an empty value as missing", async () => {
    vi.stubEnv("CARTELL_API_KEY", "");
    expect(await isConnected("reglookup")).toBe(false);
  });
  it("lists each service once, each with a setting but lead email, whose addresses are the dealer's (their profile, Settings)", () => {
    expect(new Set(INTEGRATIONS.map((i) => i.id)).size).toBe(INTEGRATIONS.length);
    expect(INTEGRATIONS.filter((i) => i.env.length === 0).map((i) => i.id)).toEqual(["email"]);
  });
  it("puts the dealer's name and listing site in a service's words", () => {
    const dd = integrationText(INTEGRATIONS.find((i) => i.id === "donedeal")!, { name: "Example Motors", site: "CarsIreland" });
    expect([dd.name, dd.demoAccount]).toEqual(["CarsIreland stock", "Example Motors on CarsIreland"]);
    expect(integrationText(INTEGRATIONS.find((i) => i.id === "social")!, { name: "Example Motors", site: "DoneDeal" }).demoAccount).toBe("@examplemotors");
  });
});

// Unit tests act for the demo dealer (vitest.setup.ts); runAsDealer("test-motors") is a dealer that is not a demo.
describe("simulation follows the dealer, never the deploy", () => {
  const META = ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN", "META_INSTAGRAM_ID"];
  it("a demo dealer simulates every outward service, keys or not, so it never sends anything real; reviews show their true state", async () => {
    const { modeOf, simulating } = await import("./integrations");
    vi.stubEnv("APP_ENV", "production");
    expect(await simulating()).toBe(true);
    expect(await modeOf("social")).toBe("simulated");
    for (const k of META) vi.stubEnv(k, "x");
    expect(await modeOf("social")).toBe("simulated");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    expect(await modeOf("reviews")).toBe("off");
  });
  it("a demo dealer's AI writing is real Claude when the key is set, the mock when not; the other services stay simulated", async () => {
    const { modeOf } = await import("./integrations");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await modeOf("ai")).toBe("simulated");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(await modeOf("ai")).toBe("live");
    for (const k of [...META, "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET"]) vi.stubEnv(k, "x");
    expect(await modeOf("social")).toBe("simulated");
    expect(await modeOf("whatsapp")).toBe("simulated");
  });
  it("a real dealer never simulates: off without keys, live with them", async () => {
    const { modeOf, simulating } = await import("./integrations");
    const { runAsDealer } = await import("@/lib/tenancy/current");
    vi.stubEnv("APP_ENV", "production");
    await runAsDealer("test-motors", async () => {
      expect(await simulating()).toBe(false);
      expect(await modeOf("social")).toBe("off");
      expect(await modeOf("whatsapp")).toBe("off");
      for (const k of META) vi.stubEnv(k, "x");
      expect(await modeOf("social")).toBe("off"); // a leftover app-wide token is nobody's account
      vi.stubEnv("CARTELL_API_KEY", "x");
      expect(await modeOf("reglookup")).toBe("live"); // ours: the Worker secret
    });
  });
});
