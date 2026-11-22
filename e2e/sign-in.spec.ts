import { expect, request as http, test, type APIRequestContext } from "@playwright/test";

// Our own sign-in's switch (docs/sign-in.md, sections 4 and 7), on the real build. The main server is the E2E run's open app with SIGN_IN
// unset (Access alone, as production today): nothing of our sign-in is there. The third server (playwright.config.ts) is closed, with
// SIGN_IN=own: a page with no session or a dead one goes to sign in. There is no sign-in yet (steps 4 and 5), so no live session here: the
// unit tests cover those (src/lib/staff.test.ts, src/lib/auth/session.test.ts).
const CLOSED = `http://localhost:${Number(process.env.PORT ?? 3000) + 2}`;
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
  });

  test("the sign-in page answers signed out, with or without a dead cookie, and never loops", async () => {
    for (const headers of [{}, DEAD]) {
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

  test("in the browser, opening a page lands on sign in", async ({ page }) => {
    await page.goto(`${CLOSED}/leads?status=new`);
    await expect(page).toHaveURL(`${CLOSED}/sign-in?next=%2Fleads%3Fstatus%3Dnew`);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in to Checkwork" })).toBeVisible();
  });
});
