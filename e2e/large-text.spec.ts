import { expect, test, type Page } from "@playwright/test";

// Large text (#189): no sideways scroll on a phone (320 to 480px) with text at 150%, nor from 640px up at 200%. The text size is the root's,
// as a browser's text zoom sets it, so every rem in the type scale grows. Measured against the page's own width (clientWidth): the Pixel 7
// profile widens innerWidth when a page overflows, which would hide the fault.
// Every dashboard page, and a record of each kind (a lead, a car, a customer, a test drive, a claim and its request, a post).
const PAGES = [
  "/", "/to-do", "/leads", "/test-drives", "/test-drives?view=list", "/analytics", "/reports", "/stock", "/customers", "/activity", "/margins",
  "/marketing", "/reviews", "/settings", "/settings?section=team", "/data-requests", "/billing", "/help", "/aftersales", "/settings?section=services", "/monthly-report",
  "/leads/lead-1000", "/stock/4710007", "/stock/new", "/customers/cust-300", "/test-drives/drive-232", "/test-drives/new",
  "/aftersales/requests/lead-2003", "/aftersales/claim-s1", "/aftersales/new", "/marketing/new", "/marketing/posts/post-700", "/marketing?tab=calendar",
];
const CASES = [[320, 1.5], [360, 1.5], [390, 1.5], [480, 1.5], [640, 2], [1024, 2], [1280, 2]] as const;

const overflow = (page: Page, scale: number) =>
  page.evaluate(async (scale) => {
    document.documentElement.style.fontSize = `${scale * 100}%`;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  }, scale);

for (const path of PAGES) {
  test(`${path}: no sideways scroll with large text`, async ({ page }) => {
    for (const [width, scale] of CASES) {
      await page.setViewportSize({ width, height: 800 });
      expect((await page.goto(path))?.status(), `${path} answers`).toBe(200);
      expect(await overflow(page, scale), `${path} @${width}px, text ${scale * 100}%`).toBeLessThanOrEqual(0);
    }
  });
}

test("the tab bar's labels and the Whose switch stay on screen at 320px with text at 150%", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  expect((await page.goto("/leads"))?.status()).toBe(200);
  await overflow(page, 1.5);
  const cw = await page.evaluate(() => document.documentElement.clientWidth);
  const more = page.getByRole("button", { name: "More", exact: true });
  for (const box of [more, page.getByRole("navigation", { name: "Whose leads" }).getByRole("link", { name: "For me" })]) {
    const r = (await box.boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(cw);
  }
  // "More" is whole, not cut to "Mo…".
  expect(await more.locator("span").evaluate((s) => s.scrollWidth <= s.clientWidth)).toBe(true);
});

// The sign-in page lives on the closed server (playwright.config.ts, the third), as in e2e/sign-in.spec.ts. Skipped when the run points at
// another server (E2E_BASE_URL), which has none.
test("/sign-in: no sideways scroll with large text", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "the closed server runs only with the local build");
  for (const [width, scale] of CASES) {
    await page.setViewportSize({ width, height: 800 });
    expect((await page.goto(`http://localhost:${Number(process.env.PORT ?? 3000) + 2}/sign-in`))?.status(), "/sign-in answers").toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in", exact: true })).toBeVisible();
    expect(await overflow(page, scale), `/sign-in @${width}px, text ${scale * 100}%`).toBeLessThanOrEqual(0);
  }
});
