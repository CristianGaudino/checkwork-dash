import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verify = vi.fn();
vi.mock("@/lib/access", async (orig) => ({ ...(await orig<typeof import("@/lib/access")>()), verifyAccessJwt: (...a: unknown[]) => verify(...a) }));
const { proxy } = await import("./proxy");

afterEach(() => vi.unstubAllEnvs());
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

  it("lets a verified request through and turns a forged one away; the pages verify the token again (src/lib/staff.ts)", async () => {
    vi.stubEnv("APP_ENV", "demo");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", "aud");
    verify.mockResolvedValueOnce({ email: "owner@dealer.ie" });
    expect((await get("/margins", { "cf-access-jwt-assertion": "a.b.c" })).status).toBe(200);
    verify.mockResolvedValueOnce(null);
    expect((await get("/", { "cf-access-jwt-assertion": "a.b.c", "x-admin-email": "forged@evil.example" })).status).toBe(404);
  });
});

describe("modules in the proxy (#173)", () => {
  it("answers 404 for every page when the dealer does not have the dashboard, and a module's page without its module", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const plan = (modules: string) => ({ cookie: `checkwork-demo-modules=${modules}` });
    expect((await get("/", plan("reviews"))).status).toBe(404);
    expect((await get("/reviews", plan("reviews"))).status).toBe(404);
    expect((await get("/leads", plan("dashboard"))).status).toBe(200);
  });
  it("says a module is not in the plan only with the dashboard on", async () => {
    const to = async (path: string, cookie?: string) => {
      const res = await get(path, cookie === undefined ? {} : { cookie: `checkwork-demo-modules=${cookie}` });
      const where = new URL(res.headers.get("x-middleware-rewrite")!).pathname;
      expect(res.status, path).toBe(where.startsWith("/not-in-plan/") ? 200 : 404); // the screen's own action needs a 200 (src/proxy.ts)
      return where;
    };
    vi.stubEnv("NODE_ENV", "development");
    expect(await to("/whatsapp", "dashboard")).toBe("/not-in-plan/whatsapp");
    expect(await to("/test-drives", "none")).toBe("/not-found-closed-area");
  });
});
