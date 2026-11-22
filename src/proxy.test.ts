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
  it("runs on our sign-in pages and /sign-out too, so a browser's x-cw-path is stripped there", () => {
    for (const p of ["/sign-in", "/sign-in/code", "/sign-in/link", "/sign-out"]) expect(gated(p), p).toBe(true);
  });
});

describe("x-cw-path reaches the app only as the proxy wrote it", () => {
  const FORGED = { "x-cw-path": "/x", accept: "text/html" };
  const send = (path: string, method = "GET", headers: Record<string, string> = FORGED) => proxy(new NextRequest(`https://demo.example${path}`, { method, headers }));
  // What the app will see: Next's override list names every request header kept, and each one's new value.
  const kept = (res: Response) => (res.headers.get("x-middleware-override-headers") ?? "").split(",");
  const stripped = (res: Response) => !kept(res).includes("x-cw-path") && res.headers.get("x-middleware-request-x-cw-path") === null;

  const SIGN_IN_REQUESTS: [string, string, Record<string, string>][] = [
    ["/sign-in", "GET", {}],
    ["/sign-in", "POST", { "next-action": "x" }],
    ["/sign-in/code", "POST", { "next-action": "x" }],
    ["/sign-out", "POST", { origin: "https://demo.example" }],
  ];
  const accessOn = () => {
    vi.stubEnv("APP_ENV", "demo");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", "aud");
  };

  it("access and both: the sign-in pages and /sign-out are behind Access like any page, so no app code runs without a token", async () => {
    accessOn();
    for (const mode of ["", "access", "bogus", "both"]) {
      vi.stubEnv("SIGN_IN", mode);
      for (const [path, method, extra] of SIGN_IN_REQUESTS) {
        const res = await send(path, method, { ...FORGED, ...extra });
        expect(res.status, `${mode} ${method} ${path}`).toBe(404);
        expect(res.headers.get("x-middleware-rewrite"), `${mode} ${path}`).toContain("/not-found-closed-area"); // the proxy's own 404
        expect(stripped(res), `${mode} ${path}`).toBe(true);
      }
    }
  });

  it("access and both: with a valid token they pass with the header stripped, never given a path, so /sign-in never loops", async () => {
    accessOn();
    for (const mode of ["", "both"]) {
      vi.stubEnv("SIGN_IN", mode);
      for (const [path, method, extra] of SIGN_IN_REQUESTS) {
        verify.mockResolvedValueOnce({ email: "owner@dealer.example" });
        const res = await send(path, method, { ...FORGED, ...extra, "cf-access-jwt-assertion": "a.b.c" });
        expect(res.status, `${mode} ${path}`).toBe(200);
        expect(kept(res), `${mode} ${path}`).toContain("accept"); // the rest of the request goes on as it was
        expect(stripped(res), `${mode} ${path}`).toBe(true);
      }
    }
  });

  it("own: they pass with no token and no cookie, the header stripped", async () => {
    accessOn();
    vi.stubEnv("SIGN_IN", "own");
    for (const [path, method, extra] of SIGN_IN_REQUESTS) {
      const res = await send(path, method, { ...FORGED, ...extra });
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
      expect(kept(res), path).toContain("accept");
      expect(stripped(res), path).toBe(true);
    }
  });

  it("the open app: they pass with the header stripped", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await send("/sign-in");
    expect(res.status).toBe(200);
    expect(stripped(res)).toBe(true);
  });

  it("strips it on the closed area's 404, in every mode", async () => {
    vi.stubEnv("APP_ENV", "demo");
    for (const [mode, method] of [["", "GET"], ["both", "GET"], ["own", "POST"], ["own", "PUT"]]) {
      vi.stubEnv("SIGN_IN", mode);
      const res = await send("/leads", method);
      expect(res.status, mode).toBe(404);
      expect(res.headers.get("location"), mode).toBeNull();
      expect(stripped(res), mode).toBe(true);
    }
  });
});

describe("SIGN_IN in the proxy (docs/sign-in.md, sections 4 and 7)", () => {
  const SESSION = { cookie: `__Host-cw_session=${"a".repeat(43)}` };
  const send = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) => proxy(new NextRequest(`https://demo.example${path}`, init));
  const passedPath = (res: Response) => res.headers.get("x-middleware-request-x-cw-path");
  const accessOn = () => {
    vi.stubEnv("APP_ENV", "demo");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "team.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD", "aud");
  };

  it("unset or unknown acts as access: a session cookie alone is a 404, never a redirect to sign in", async () => {
    accessOn();
    for (const mode of ["", "access", "OWN", "bogus"]) {
      vi.stubEnv("SIGN_IN", mode);
      for (const res of [await send("/leads"), await send("/leads", { headers: SESSION })]) {
        expect(res.status, mode).toBe(404);
        expect(res.headers.get("location"), mode).toBeNull();
      }
      verify.mockResolvedValueOnce({ email: "owner@dealer.example" });
      expect((await send("/leads", { headers: { "cf-access-jwt-assertion": "a.b.c" } })).status).toBe(200);
    }
  });

  it("both: still the Access token, cookie or not", async () => {
    accessOn();
    vi.stubEnv("SIGN_IN", "both");
    expect((await send("/leads", { headers: SESSION })).status).toBe(404);
    verify.mockResolvedValueOnce({ email: "owner@dealer.example" });
    expect((await send("/leads", { headers: { "cf-access-jwt-assertion": "a.b.c" } })).status).toBe(200);
  });

  it("own: a page load with no cookie goes to sign in with its path and query as next; a POST is a 404", async () => {
    accessOn();
    vi.stubEnv("SIGN_IN", "own");
    const res = await send("/leads?status=new&_rsc=abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://demo.example/sign-in?next=%2Fleads%3Fstatus%3Dnew");
    for (const value of ["", "x", "a".repeat(42), `${"a".repeat(42)}=`, "a".repeat(44)]) // not the shape of one of ours: as if there were none
      expect((await send("/leads", { headers: { cookie: `__Host-cw_session=${value}` } })).status, value).toBe(307);
    expect((await send("/", { method: "POST" })).status).toBe(404); // a server action: never a redirect
    expect((await send("/", { method: "POST", headers: { "next-action": "x" } })).status).toBe(404);
    verify.mockResolvedValue({ email: "owner@dealer.example" });
    expect((await send("/leads", { headers: { "cf-access-jwt-assertion": "a.b.c" } })).status).toBe(307); // Access alone is not ours
  });

  it("own: lets a request with the cookie through (the server checks it), with the path the proxy saw, never the browser's", async () => {
    vi.stubEnv("SIGN_IN", "own");
    const res = await send("/leads?status=new", { headers: { ...SESSION, "x-cw-path": "//evil.example" } });
    expect(res.status).toBe(200);
    expect(passedPath(res)).toBe("/leads?status=new");
    const post = await send("/leads", { method: "POST", headers: { ...SESSION, "x-cw-path": "/elsewhere" } });
    expect(passedPath(post)).toBe(""); // a POST is never redirected, so it carries no path
  });

  it("overwrites a browser's x-cw-path under Access too", async () => {
    accessOn();
    verify.mockResolvedValueOnce({ email: "owner@dealer.example" });
    expect(passedPath(await send("/stock", { headers: { "cf-access-jwt-assertion": "a.b.c", "x-cw-path": "//evil.example" } }))).toBe("/stock");
  });

  it("keeps the open shortcut refused with a directory bound, and E2E_SIGN_IN closes it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_OPEN", "1");
    vi.stubEnv("SIGN_IN", "own");
    expect((await send("/")).status).toBe(200);
    bound = true;
    expect((await send("/")).status).toBe(307);
    bound = false;
    vi.stubEnv("E2E_SIGN_IN", "1");
    expect((await send("/")).status).toBe(307);
  });
});
