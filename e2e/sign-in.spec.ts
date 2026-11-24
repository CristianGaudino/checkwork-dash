import { expect, request as http, test, type APIRequestContext } from "@playwright/test";

// Our own sign-in's switch (docs/sign-in.md, sections 4 and 7), on the real build. The main server is the E2E run's open app with SIGN_IN
// unset (Access alone, as production today): nothing of our sign-in is there. The third server (playwright.config.ts) is closed, with
// SIGN_IN=own: a page with no session or a dead one goes to sign in. There is no sign-in yet (steps 4 and 5), so no live session here: the
// unit tests cover those (src/lib/staff.test.ts, src/lib/auth/session.test.ts).
const CLOSED = `http://localhost:${Number(process.env.PORT ?? 3000) + 2}`;
const CLOSED_ACCESS = `http://localhost:${Number(process.env.PORT ?? 3000) + 3}`; // closed, SIGN_IN unset, no Access set up
const DEAD = { cookie: `__Host-cw_session=${"a".repeat(43)}` }; // the shape of ours, but no session behind it

// Stands in for Cloudflare's Turnstile script (the build has its test site key), so no spec calls Cloudflare. pass: a token arrives at once.
const stub = (page: import("@playwright/test").Page, pass = true) =>
  page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = { render(el, o) { ${pass} && setTimeout(() => o.callback("e2e-token")); return "w1"; }, reset() {}, remove() {} };`,
    }),
  );

test.describe("SIGN_IN unset (the open app, and production today)", () => {
  test("has no sign-in page and no sign-out, and pages are sent no-store", async ({ request, baseURL }) => {
    expect((await request.get("/sign-in", { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.post("/sign-out", { headers: { origin: baseURL! }, maxRedirects: 0 })).status()).toBe(404);
    for (const path of ["/sign-in/code", "/sign-in/link", "/sign-in/outbox?to=aoife%40example.com"]) expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
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
    for (const path of ["/sign-in/code", "/sign-in/link", "/sign-in/outbox?to=aoife%40example.com"]) expect((await api.get(path, { headers, maxRedirects: 0 })).status(), path).toBe(404);
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

  test("the service worker and its offline screen load with no session, so the worker never caches the sign-in page (#144)", async () => {
    for (const path of ["/sw.js", "/offline.html"]) {
      const res = await api.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
    }
    expect(await (await api.get("/offline.html", { maxRedirects: 0 })).text()).not.toContain("Email me a code");
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

// The emailed code and link (docs/sign-in.md, section 3), on the closed server. Its mail is the in-memory outbox, read at /sign-in/outbox.
test.describe("signing in by email on the closed server", () => {
  test.skip(!!process.env.E2E_BASE_URL, "needs the run's own closed server");
  // Signing in loads the dashboard, which installs the service worker in the background, where it could outlive a test's clearCookies
  // (#144). The worker has its own spec (app-install.spec.ts).
  test.use({ serviceWorkers: "block" });
  test.beforeEach(({ page }) => stub(page));
  const mailTo = async (page: import("@playwright/test").Page, to: string) => {
    const get = async () => (await (await page.request.get(`${CLOSED}/sign-in/outbox?to=${encodeURIComponent(to)}`)).json()) as { subject: string; text: string }[];
    await expect.poll(async () => (await get()).length).toBeGreaterThan(0);
    return (await get()).at(-1)!;
  };
  const sessionCookie = (page: import("@playwright/test").Page) => page.context().cookies(CLOSED).then((c) => c.find((x) => x.name === "__Host-cw_session"));

  test("a code from the outbox signs in a seeded person, who lands on the dashboard with a session", async ({ page }) => {
    await page.goto(`${CLOSED}/sign-in?next=%2Fleads`);
    await page.getByLabel("Email").fill("aoife@example.com");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page).toHaveURL(`${CLOSED}/sign-in/code?next=%2Fleads`);
    await expect(page.getByText("If that email is on a team, we have sent a code to it.")).toBeVisible();
    const mail = await mailTo(page, "aoife@example.com");
    expect(mail.text).toMatch(/Only type the code at localhost:\d+/);
    const code = /Your code is (\d{3}) (\d{3})/.exec(mail.text)!.slice(1).join("");
    await page.getByLabel("Code").fill(code);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${CLOSED}/leads`); // where they were going
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await sessionCookie(page)).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" });
    expect((await page.context().cookies(CLOSED)).find((c) => c.name === "__Host-cw_attempt")).toBeUndefined();
    expect((await page.request.get(`${CLOSED}/`, { maxRedirects: 0 })).status()).toBe(200); // signed in: the overview
    await page.goto(`${CLOSED}/sign-in?next=%2Fleads`); // a signed-in person is sent on
    await expect(page).toHaveURL(`${CLOSED}/leads`);
  });

  test("a wrong code is refused and an unknown address looks the same", async ({ page }) => {
    for (const email of ["ciara@example.com", "nobody@example.com"]) {
      await page.goto(`${CLOSED}/sign-in`);
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Email me a code" }).click();
      await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
      await page.getByLabel("Code").fill("000000");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.locator("form").getByRole("alert")).toHaveText("That code did not work. Check it, or ask for a new one.");
      expect(await sessionCookie(page)).toBeUndefined();
    }
  });

  test("the link page shows the masked email, clears the fragment, never redirects, and its button signs in", async ({ page }) => {
    await page.goto(`${CLOSED}/sign-in`);
    await page.getByLabel("Email").fill("conor@example.com");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page).toHaveURL(/\/sign-in\/code/);
    const link = /(http:\/\/localhost:\d+\/sign-in\/link[^\s]*)/.exec((await mailTo(page, "conor@example.com")).text)![1];
    expect(link).toMatch(/#t=[A-Za-z0-9_-]{43}$/);
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Sign in as co…r@example.com?" })).toBeVisible();
    expect(page.url()).toBe(`${CLOSED}/sign-in/link`); // the token is out of the address bar, and the page did not redirect
    expect(await page.evaluate(() => location.hash)).toBe("");
    await page.reload(); // the link is not in the history either, so nothing is left to open
    await expect(page.getByRole("heading", { name: "Open the link again" })).toBeVisible();
    await page.goto("about:blank"); // a new tab, as from Mail: the same address with only a new #t would not load the page again
    await page.goto(link);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${CLOSED}/`);
    expect(await sessionCookie(page)).toBeDefined();
    // signed in, the link page is still just a page
    const again = await page.request.get(`${CLOSED}/sign-in/link`, { maxRedirects: 0 });
    expect(again.status()).toBe(200);
    expect(again.headers()["location"]).toBeUndefined();
    // and the link was single use. Leave the dashboard first: its page can still be loading parts of itself, and with the cookie gone the
    // next of those goes to sign in and takes the tab with it, over the link's load (#144).
    await page.goto("about:blank");
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });

  test("/sign-in/link sends its own policy: frame-ancestors none and no analytics", async () => {
    const api = await http.newContext({ baseURL: CLOSED });
    const res = await api.get("/sign-in/link", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("cloudflareinsights");
    expect(res.headers()["referrer-policy"]).toBe("no-referrer");
    expect((await api.get("/sign-in", { maxRedirects: 0 })).headers()["content-security-policy"]).not.toContain("cloudflareinsights");
    expect((await api.get("/sign-in/outbox", { maxRedirects: 0 })).status()).toBe(200); // the run's mail, in an E2E run only
    await api.dispose();
  });
});

// The bot check on the email form (docs/sign-in.md, section 3). The closed server has no secret and fake backends, so the server side skips here: its rules are unit tests.
test.describe("the bot check on the closed server", () => {
  test.skip(!!process.env.E2E_BASE_URL, "needs the run's own closed server");

  test("the button waits for the check, then the token goes with the form", async ({ page }) => {
    await stub(page, true);
    await page.goto(`${CLOSED}/sign-in`);
    await page.getByLabel("Email").fill("aoife@example.com");
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue("e2e-token");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page).toHaveURL(/\/sign-in\/code/);
  });

  test("with no token the button stays off", async ({ page }) => {
    await stub(page, false);
    await page.goto(`${CLOSED}/sign-in`);
    await page.getByLabel("Email").fill("aoife@example.com");
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeDisabled();
  });
});

// The team (docs/sign-in.md, section 1, build step 6), on the closed server: someone removed, or signed out on all devices by a manager, is
// signed out at their next click. One manager sign-in for both, since every email counts in the address's caps (3 in 15 minutes).
test.describe("the team on the closed server", () => {
  test.skip(!!process.env.E2E_BASE_URL, "needs the run's own closed server");
  test.use({ serviceWorkers: "block" });

  const codes = async (api: APIRequestContext, to: string) =>
    ((await (await api.get(`${CLOSED}/sign-in/outbox?to=${encodeURIComponent(to)}`)).json()) as { subject: string; text: string }[]).filter((m) => m.subject === "Your Checkwork sign-in code");
  // Signs `email` in by code on `page`, and leaves it on the overview.
  const signIn = async (page: import("@playwright/test").Page, email: string) => {
    await stub(page);
    const before = (await codes(page.request, email)).length;
    await page.goto(`${CLOSED}/sign-in`);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page).toHaveURL(/\/sign-in\/code/);
    await expect.poll(async () => (await codes(page.request, email)).length).toBeGreaterThan(before);
    const code = /Your code is (\d{3}) (\d{3})/.exec((await codes(page.request, email)).at(-1)!.text)!.slice(1).join("");
    await page.getByLabel("Code").fill(code);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${CLOSED}/`);
  };
  // A click to another page, as the menu's links do (a client-side navigation).
  const go = (page: import("@playwright/test").Page, path: string) => page.evaluate((p) => (window as unknown as { next: { router: { push: (h: string) => void } } }).next.router.push(p), path);

  test("a person removed, or signed out on all devices, is signed out at their next click", async ({ page, browser }) => {
    const stamp = Date.now() % 1_000_000;
    const people = { leaver: { name: `Leaver ${stamp}`, email: `leaver${stamp}@example.com` }, lost: { name: `Lost Phone ${stamp}`, email: `lost${stamp}@example.com` } };
    await signIn(page, "ciara@example.com"); // a manager
    await page.goto(`${CLOSED}/settings?section=team`);
    for (const p of Object.values(people)) {
      await page.getByRole("button", { name: "Add someone" }).click();
      const add = page.getByRole("dialog", { name: "Add someone" });
      await add.locator('input[name="name"]').fill(p.name);
      await add.locator('input[name="email"]').fill(p.email);
      await add.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByRole("cell", { name: p.name })).toBeVisible();
    }
    const tabs = await Promise.all(Object.values(people).map(async (p) => {
      const ctx = await browser.newContext({ serviceWorkers: "block" });
      const tab = await ctx.newPage();
      await signIn(tab, p.email);
      return tab;
    }));
    const [leaver, lost] = tabs;

    // Signed out on all devices: still on the team, and their next click goes to sign in.
    let row = page.getByRole("row").filter({ hasText: people.lost.name });
    await row.getByRole("button", { name: `More for ${people.lost.name}` }).click();
    await row.getByRole("button", { name: "Sign out on all devices" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText(`${people.lost.name} is signed out on all devices`)).toBeVisible();
    await expect(row).toBeVisible();
    await go(lost, "/leads");
    await expect(lost).toHaveURL(`${CLOSED}/sign-in?next=%2Fleads`);

    // Removed: the same, and not "No access".
    row = page.getByRole("row").filter({ hasText: people.leaver.name });
    await row.getByRole("button", { name: `More for ${people.leaver.name}` }).click();
    await row.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText(people.leaver.name)).toHaveCount(0);
    await go(leaver, "/leads");
    await expect(leaver).toHaveURL(`${CLOSED}/sign-in?next=%2Fleads`);

    // The manager who did it is still signed in.
    await page.goto(`${CLOSED}/leads`);
    await expect(page).toHaveURL(`${CLOSED}/leads`);
    for (const t of tabs) await t.context().close();
  });

  test("the main server (SIGN_IN unset) has no Sign out on all devices in Team", async ({ page }) => {
    await page.goto("/settings?section=team");
    const row = page.getByRole("row").filter({ hasText: "Conor Doyle" });
    await row.getByRole("button", { name: "More for Conor Doyle" }).click();
    await expect(row.getByRole("button", { name: "Remove" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out on all devices" })).toHaveCount(0);
  });
});
