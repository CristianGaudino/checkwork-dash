import { expect, test, type Locator, type Page } from "@playwright/test";
import { sideLink } from "./admin-menu";

// Charts and figures enter together (#202): after a client navigation the chart draws from the left, its bars grow and every tile counts,
// so the page arrives as one thing. Never on the server's first paint, and the chart stands still with reduced motion.
const animations = (l: Locator) => l.evaluate((el) => el.getAnimations().map((a) => (a as CSSAnimation).animationName));
const chart = (page: Page) => page.locator("[data-chart]");
const visitsFigure = (page: Page) => page.getByRole("region", { name: "Numbers" }).getByRole("link", { name: /^Visits this week/ }).locator("p.font-display");
const sourceFigure = (page: Page) => page.getByRole("region", { name: "Where visits come from" }).locator("[data-tile] p.font-display > span").first();

test.beforeEach(({ page }) => page.setViewportSize({ width: 1280, height: 900 })); // the sidebar

test("a client navigation draws the chart and bars in, and the tiles count to their figures; a hard load stays still", async ({ page }) => {
  await page.goto("/analytics");
  await expect(chart(page)).toBeVisible();
  await page.waitForLoadState("load");
  await expect(page.locator("[data-fresh]")).toHaveCount(0);
  expect(await animations(chart(page))).toEqual([]);
  const source = (await sourceFigure(page).textContent())!;
  await page.goto("/");
  const visits = (await visitsFigure(page).textContent())!;
  expect(visits).toMatch(/^[\d,]+$/);

  await (await sideLink(page, "Analytics")).click();
  await expect(page).toHaveURL(/\/analytics$/);
  const drawn = page.locator("[data-fresh] [data-chart]");
  await expect(drawn).toBeVisible();
  expect(await animations(drawn)).toContain("reveal-x");
  expect(await animations(page.locator("[data-fresh] [data-chart-peak]").first())).toContain("arrive");
  expect(await animations(page.locator("[data-fresh] [data-bars] li > [aria-hidden] > span").first())).toContain("reveal-x");
  await expect(sourceFigure(page)).toHaveText(source); // retries until the count settles

  await (await sideLink(page, "Overview")).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(visitsFigure(page)).toHaveText(visits);
});

test("with reduced motion the chart is not drawn in, only faded with its page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await (await sideLink(page, "Analytics")).click();
  await expect(page).toHaveURL(/\/analytics$/);
  const drawn = page.locator("[data-fresh] [data-chart]");
  await expect(drawn).toBeVisible();
  expect(await animations(drawn)).not.toContain("reveal-x");
  expect(await animations(page.locator("[data-fresh] [data-bars] li > [aria-hidden] > span").first())).toEqual([]);
  expect(await animations(page.locator("[data-fresh]"))).toContain("arrive");
});
