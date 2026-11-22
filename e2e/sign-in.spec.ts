import { expect, request as http, test, type APIRequestContext } from "@playwright/test";

// Our own sign-in's switch (docs/sign-in.md, sections 4 and 7), on the real build. The main server is the E2E run's open app with SIGN_IN
// unset (Access alone, as production today): nothing of our sign-in is there. The third server (playwright.config.ts) is closed, with
// SIGN_IN=own: a page with no session or a dead one goes to sign in. There is no sign-in yet (steps 4 and 5), so no live session here: the
// unit tests cover those (src/lib/staff.test.ts, src/lib/auth/session.test.ts).
const CLOSED = `http://localhost:${Number(process.env.PORT ?? 3000) + 2}`;
const CLOSED_ACCESS = `http://localhost:${Number(process.env.PORT ?? 3000) + 3}`; // closed, SIGN_IN unset, no Access set up
const DEAD = { cookie: `__Host-cw_session=${"a".repeat(43)}` }; // the shape of ours, but no session behind it

test.describe("SIGN_IN unset (the open app, and production today)", () => {
  test("has no sign-in page and no sign-out, and pages are sent no-store", async ({ request, baseURL }) => {
    expect((await request.get("/sign-in", { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.post("/sign-out", { headers: { origin: baseURL! }, maxRedirects: 0 })).status()).toBe(404);
    const page = await request.get("/", { maxRedirects: 0 });
    expect(page.status()).toBe(200);
    expect(page.headers()["cache-control"]).toContain("no-store"); // a signed-in page is never kept by a cache
  });
});

test("SIGN_IN unset on a closed server: the sign-in page and /sign-out are 404s, as every page is without Access", async () => {
  test.skip(!!process.env.E2E_BASE_URL, "needs the run's own closed server");
  const api = await http.newContext({ baseURL: CLOSED_ACCESS });
  for (const headers of [{}, DEAD, { "x-cw-path": "/x" }] as Record<string, string>[]) { // a forged path header never reaches the app
    expect((await api.get("/sign-in", { headers, maxRedirects: 0 })).status()).toBe(404);
    expect((await api.get("/sign-in?next=%2Fleads", { headers, maxRedirects: 0 })).status()).toBe(404);
    expect((await api.post("/sign-out", { headers: { ...headers, origin: CLOSED_ACCESS }, maxRedirects: 0 })).status()).toBe(404);
    const page = await api.get("/leads", { headers, maxRedirects: 0 });
    expect(page.status()).toBe(404);
    expect(page.headers()["location"]).toBeUndefined(); // never sent to sign in
  }
  await api.dispose();
});

test.describe("SIGN_IN=own on a closed server", () => {
  test.skip(!!process.env.E2E_BASE_URL, "needs the run's own closed server");
  let api: APIRequestContext;
  test.beforeAll(async () => {
    api = await http.newContext({ baseURL: CLOSED });
  });
  test.afterAll(() => api.dispose());
  const location = async (path: string, headers: Record<string, string> = {}) => {
    const res = await api.get(path, { headers, maxRedirects: 0 });
    expect(res.status(), path).toBeGreaterThanOrEqual(300);
    expect(res.status(), path).toBeLessThan(400);
    return res.headers()["location"]?.replace(CLOSED, "");
  };

  test("a page with no session goes to sign in with its path as next, from the proxy", async () => {
    expect(await location("/leads?status=new")).toBe("/sign-in?next=%2Fleads%3Fstatus%3Dnew");
    expect(await location("/")).toBe("/sign-in?next=%2F");
    expect(await location("/leads", { "x-cw-path": "//evil.example" })).toBe("/sign-in?next=%2Fleads"); // the browser's copy is ignored
  });

  test("a dead session cookie passes the proxy, and the page then goes to sign in", async () => {
    expect(await location("/leads?status=new", DEAD)).toBe("/sign-in?next=%2Fleads%3Fstatus%3Dnew");
    expect(await location("/settings", { ...DEAD, "x-cw-path": "//evil.example" })).toBe("/sign-in?next=%2Fsettings");
  });

  test("a POST with no session is a 404, never a redirect", async () => {
    const res = await api.post("/leads", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect((await api.post("/leads", { headers: { "x-cw-path": "/leads" }, maxRedirects: 0 })).status()).toBe(404); // a forged path changes nothing
  });

  test("a plain POST or PUT with a dead cookie is not there either: signed out is not \"No access\"", async () => {
    for (const method of ["POST", "PUT"] as const) {
      const res = await api.fetch("/leads", { method, headers: { ...DEAD, "content-type": "application/x-www-form-urlencoded" }, data: "a=1", maxRedirects: 0 });
      expect(res.status(), method).toBe(404);
      expect(await res.text(), method).not.toContain("No access");
    }
  });

  test("the sign-in page answers signed out, with or without a dead cookie, and never loops", async () => {
    for (const headers of [{}, DEAD, { "x-cw-path": "/x" }] as Record<string, string>[]) {
      const res = await api.get("/sign-in?next=%2Fleads", { headers, maxRedirects: 0 });
      expect(res.status()).toBe(200);
      expect(await res.text()).toContain("Sign in to Checkwork");
    }
  });

  test("/sign-out refuses a missing and a foreign Origin, and otherwise clears the cookie and the cache", async () => {
    expect((await api.post("/sign-out", { headers: DEAD, maxRedirects: 0 })).status()).toBe(403);
    expect((await api.post("/sign-out", { headers: { ...DEAD, origin: "https://evil.example" }, maxRedirects: 0 })).status()).toBe(403);
    const res = await api.post("/sign-out", { headers: { ...DEAD, origin: CLOSED }, maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toBe("/sign-in");
    expect(res.headers()["clear-site-data"]).toBe('"cache"');
    expect(res.headers()["set-cookie"]).toMatch(/^__Host-cw_session=; Path=\/; .*Max-Age=0/);
    expect((await api.get("/sign-out", { maxRedirects: 0 })).status()).toBe(405); // no GET changes anything
  });

  test("a client-side navigation (an RSC request) with a dead cookie goes to sign in too, not into the page", async ({ page }) => {
    // A real navigation's RSC headers, from the open app (the same build), replayed against the closed server with a dead cookie.
    await page.goto("/leads");
    const rsc = page.waitForRequest((r) => r.headers()["rsc"] === "1" && new URL(r.url()).pathname === "/settings" && !r.headers()["next-router-prefetch"]);
    await page.evaluate(() => (window as unknown as { next: { router: { push: (h: string) => void } } }).next.router.push("/settings"));
    const req = await rsc;
    const sent = await req.allHeaders();
    const headers = Object.fromEntries(Object.entries(sent).filter(([k]) => k === "rsc" || k.startsWith("next-")));
    const url = new URL(req.url());
    const res = await api.get(url.pathname + url.search, { headers: { ...headers, ...DEAD }, maxRedirects: 0 });
    // Next's form for a redirect during an RSC request: a 200 flight payload whose page segment is the redirect, which the client router
    // follows. Before the fix the page itself ran (and failed with "No current dealer").
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/x-component");
    expect(await res.text()).toContain('{"digest":"NEXT_REDIRECT;replace;/sign-in?next=%2Fsettings;307;"}');
  });

  test("in the browser, opening a page lands on sign in", async ({ page }) => {
    await page.goto(`${CLOSED}/leads?status=new`);
    await expect(page).toHaveURL(`${CLOSED}/sign-in?next=%2Fleads%3Fstatus%3Dnew`);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in to Checkwork" })).toBeVisible();
  });
});
