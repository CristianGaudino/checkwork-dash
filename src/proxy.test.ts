import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verify = vi.fn();
let bound = false; // a real directory bound (the Worker)
vi.mock("@/lib/leads/bindings", () => ({ getBindings: () => (bound ? { DIRECTORY: {} } : {}) }));
vi.mock("@/lib/access", async (orig) => ({ ...(await orig<typeof import("@/lib/access")>()), verifyAccessJwt: (...a: unknown[]) => verify(...a) }));
const { proxy, config } = await import("./proxy");

afterEach(() => {
  vi.unstubAllEnvs();
  bound = false;
});
const get = (path: string, headers: Record<string, string> = {}) => proxy(new NextRequest(`https://demo.example${path}`, { headers }));

describe("the dashboard gate in the proxy", () => {
  it("answers 404 with noindex on a deployed site with no Access token", async () => {
    vi.stubEnv("APP_ENV", "demo");
    for (const path of ["/", "/stock", "/margins"]) {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
    }
  });
  it("still 404s when Access is configured and the token is missing or forged", async () => {
    vi.stubEnv("APP_ENV", "demo");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", "aud");
    expect((await get("/")).status).toBe(404);
    expect((await get("/", { "cf-access-jwt-assertion": "a.b.c" })).status).toBe(404);
  });
  it("is open in next dev, and closed in a build with no APP_ENV", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await get("/")).status).toBe(200);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "");
    expect((await get("/")).status).toBe(404); // a client build that forgot APP_ENV stays closed
  });

  it("is open with NEXT_PUBLIC_ADMIN_OPEN only while no directory is bound", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_OPEN", "1");
    expect((await get("/")).status).toBe(200); // the E2E run: next start, no bindings
    bound = true;
    expect((await get("/")).status).toBe(404); // a deploy that set it by mistake still needs Access
  });

  it("lets a verified request through and turns a forged one away; the pages verify the token again (src/lib/staff.ts)", async () => {
    vi.stubEnv("APP_ENV", "demo");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", "aud");
    verify.mockResolvedValueOnce({ email: "owner@dealer.example" });
    expect((await get("/margins", { "cf-access-jwt-assertion": "a.b.c" })).status).toBe(200);
    verify.mockResolvedValueOnce(null);
    expect((await get("/", { "cf-access-jwt-assertion": "a.b.c", "x-admin-email": "forged@evil.example" })).status).toBe(404);
  });
});

describe("what the gate covers", () => {
  // The matcher as Next reads it: a path the pattern does not match never reaches the proxy.
  const gated = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
  it("leaves the site API to its own key (dealer websites call it), as it does the other API routes, and gates every page", () => {
    expect(gated("/api/site/v1/leads")).toBe(false);
    expect(gated("/api/site/v1/stock")).toBe(false);
    expect(gated("/api/owner/v1/summary")).toBe(false);
    expect(gated("/leads")).toBe(true);
    expect(gated("/settings")).toBe(true);
  });
  it("gates the stock pages, and leaves out only the seeded car photos in public/stock", () => {
    expect(gated("/stock")).toBe(true);
    expect(gated("/stock/123")).toBe(true);
    expect(gated("/stock/new")).toBe(true);
    expect(gated("/stock/export")).toBe(true);
    expect(gated("/stock/123/reserve")).toBe(true);
    expect(gated("/stock/4710001/1-b1b37b33.webp")).toBe(false);
  });
});
