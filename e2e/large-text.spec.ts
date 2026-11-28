import { expect, test, type Page } from "@playwright/test";

// Large text (#189): no sideways scroll on a phone (320 to 480px) with text at 150%, nor from 640px up at 200%. Measured against the page's
// own width (clientWidth): the Pixel 7 profile widens innerWidth when a page overflows, which would hide the fault.
// Every dashboard page, and a record of each kind (a lead, a car, a customer, a test drive, a claim and its request, a post).
const PAGES = [
  "/", "/to-do", "/leads", "/test-drives", "/test-drives?view=list", "/analytics", "/reports", "/stock", "/customers", "/activity", "/margins",
  "/marketing", "/reviews", "/settings", "/settings?section=team", "/data-requests", "/billing", "/help", "/aftersales", "/settings?section=services", "/monthly-report",
  "/leads/lead-1000", "/stock/4710007", "/stock/new", "/customers/cust-300", "/test-drives/drive-232", "/test-drives/new",
  "/aftersales/requests/lead-2003", "/aftersales/claim-s1", "/aftersales/new", "/marketing/new", "/marketing/posts/post-700", "/marketing?tab=calendar",
];
const CASES = [[320, 1.5], [360, 1.5], [390, 1.5], [480, 1.5], [640, 2], [1024, 2], [1280, 2]] as const;

// CDP sets the browser's own default font size, as Chrome's font setting does, so rem media queries grow with the text too (a root
// font-size in CSS would leave the breakpoints at 16px and test widths no real user can reach).
// The session stays open: detaching it puts the font size back.
async function textAt(page: Page, scale: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: Math.round(16 * scale), fixed: Math.round(13 * scale) } });
}

const overflow = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });

for (const path of PAGES) {
  test(`${path}: no sideways scroll with large text`, async ({ page }) => {
    for (const [width, scale] of CASES) {
      await textAt(page, scale);
      await page.setViewportSize({ width, height: 800 });
      expect((await page.goto(path))?.status(), `${path} answers`).toBe(200);
      expect(await overflow(page), `${path} @${width}px, text ${scale * 100}%`).toBeLessThanOrEqual(0);
    }
  });
}

// The pages with jobs in their header (Overview, a lead, a customer, a test drive, Billing, Help): at 320px with text at 150% and 200% the
// buttons wrap onto more rows rather than run off the screen, and each is whole on screen.
for (const path of ["/", "/leads/lead-4000", "/customers/cust-300", "/test-drives/drive-232", "/billing", "/help"]) {
  test(`${path}: the header's buttons stay on screen at 320px with large text`, async ({ page }) => {
    for (const scale of [1.5, 2]) {
      await textAt(page, scale);
      await page.setViewportSize({ width: 320, height: 800 });
      expect((await page.goto(path))?.status(), `${path} answers`).toBe(200);
      expect(await overflow(page), `${path}, text ${scale * 100}%`).toBeLessThanOrEqual(0);
      const cw = await page.evaluate(() => document.documentElement.clientWidth);
      for (const r of await page.getByRole("main").locator("header").first().locator("a, button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0).map((b) => [b.left, b.right])))
        expect(r[0] >= 0 && r[1] <= cw, `${path}, text ${scale * 100}%: a header button at ${r} in ${cw}px`).toBe(true);
    }
  });
}

test("the text setting grows the root font and the breakpoints", async ({ page }) => {
  await textAt(page, 2);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  // 32px text, and lg (64rem) is now 2048px: a 1280px window gets the phone's tab bar, not the sidebar.
  expect(await page.evaluate(() => [getComputedStyle(document.documentElement).fontSize, matchMedia("(width >= 64rem)").matches])).toEqual(["32px", false]);
});

test("the tab bar's labels and the Whose switch stay on screen at 320px with text at 150%", async ({ page }) => {
  await textAt(page, 1.5);
  await page.setViewportSize({ width: 320, height: 800 });
  expect((await page.goto("/leads"))?.status()).toBe(200);
  await overflow(page);
  const cw = await page.evaluate(() => document.documentElement.clientWidth);
  const more = page.getByRole("button", { name: "More", exact: true });
  for (const box of [more, page.getByRole("navigation", { name: "Whose leads" }).getByRole("link", { name: "For me" })]) {
    const r = (await box.boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(cw);
  }
  // "More" is whole, not cut to "Mo…".
  expect(await more.locator("span").evaluate((s) => s.scrollWidth <= s.clientWidth)).toBe(true);
});

test("the composer's last step (Post now, Schedule post) fits at 320px with text at 150%", async ({ page }) => {
  await textAt(page, 1.5);
  await page.setViewportSize({ width: 320, height: 800 });
  expect((await page.goto("/marketing/new"))?.status()).toBe(200);
  await page.getByRole("main").locator("li > button[aria-pressed]").first().click();
  for (const n of [2, 3]) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`Step ${n + 1} of 4`) })).toBeFocused();
  }
  await expect(page.getByRole("radio", { name: "Schedule post" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

// The sign-in page lives on the closed server (playwright.config.ts, the third), as in e2e/sign-in.spec.ts. Skipped when the run points at
// another server (E2E_BASE_URL), which has none.
test("/sign-in: no sideways scroll with large text", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "the closed server runs only with the local build");
  for (const [width, scale] of CASES) {
    await textAt(page, scale);
    await page.setViewportSize({ width, height: 800 });
    expect((await page.goto(`http://localhost:${Number(process.env.PORT ?? 3000) + 2}/sign-in`))?.status(), "/sign-in answers").toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in", exact: true })).toBeVisible();
    expect(await overflow(page), `/sign-in @${width}px, text ${scale * 100}%`).toBeLessThanOrEqual(0);
  }
});
