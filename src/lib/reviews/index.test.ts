import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_PROFILE } from "../tenancy/profile";

vi.mock("server-only", () => ({}));
// The dealer's Google place is in their profile.
let placeId = "";
let demo = true; // the directory's flag: the fixtures are a demo dealer's only
vi.mock("../tenancy/current", () => ({ dealerProfile: async () => ({ placeId }), currentDealer: async () => ({ demo }) }));

const PLACES = { googleMapsUri: "https://maps.google.com/?cid=1", rating: 4.5, userRatingCount: 9, reviews: [{ rating: 5, relativePublishTimeDescription: "a day ago", authorAttribution: { displayName: "B." } }] };

// The module keeps one provider, so each test imports a fresh copy.
const load = () => import("./index");

beforeEach(() => vi.resetModules());
afterEach(() => {
  demo = true;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getReviews", () => {
  it.each([
    ["neither", "", ""],
    ["only the place ID", "ChIJ1", ""],
    ["only the key", "", "key"],
  ])("gives a demo dealer the fixtures without fetching when %s is set, on a production deploy too", async (_, place, key) => {
    vi.stubEnv("APP_ENV", "production"); // the deploy does not decide: the dealer does
    placeId = place;
    vi.stubEnv("GOOGLE_PLACES_API_KEY", key);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { getReviews, DEMO_REVIEWS } = await load();
    expect(await getReviews()).toBe(DEMO_REVIEWS);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gives a real dealer nothing, never the fixtures, without the place ID or key", async () => {
    demo = false;
    placeId = "";
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    const { getReviews } = await load();
    expect(await getReviews()).toBeNull();
  });

  it("returns Places data when both are set", async () => {
    placeId = "ChIJ1";
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "key");
    const fetch = vi.fn(async () => new Response(JSON.stringify(PLACES)));
    vi.stubGlobal("fetch", fetch);
    const { getReviews } = await load();
    expect(await getReviews()).toMatchObject({ source: "google", rating: 4.5, count: 9 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("never falls back to the fixtures when Places is configured and fails", async () => {
    placeId = "ChIJ1";
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const { getReviews } = await load();
    expect(await getReviews()).toBeNull();
  });
});

describe("DEMO_REVIEWS", () => {
  it("are ten clearly fictional reviews whose summary matches them", async () => {
    const { DEMO_REVIEWS: d } = await load();
    expect(d.source).toBe("demo");
    expect(d.reviews.map((r) => r.rating)).toEqual([5, 5, 5, 4, 5, 5, 5, 5, 5, 5]);
    expect(d.count).toBe(d.reviews.length);
    expect(d.rating).toBe(d.reviews.reduce((s, r) => s + r.rating, 0) / d.reviews.length);
    for (const r of d.reviews) {
      expect(r.author).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/);
      expect(r).not.toHaveProperty("authorUri");
      expect(r).not.toHaveProperty("photoUri");
      expect(r.reviewUri).toMatch(/^https:\/\//);
    }
    expect(d.placeUri).toContain(encodeURIComponent(DEMO_PROFILE.address.street)); // the dealer's own address, never a made-up eircode
    expect(JSON.stringify(d)).not.toContain(String.fromCharCode(0x2014));
  });
});
