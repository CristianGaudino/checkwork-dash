import { expect, test, type Locator, type Page } from "@playwright/test";
import { sideLink } from "./admin-menu";

// Content arrives once (#214): after a client navigation the new part of the page fades in as one thing. Its chart, bars and figures do
// not move on their own, and no figure counts: it shows its own value from the first frame. Never on the server's first paint.
const cssAnimations = (l: Locator) =>
  l.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a instanceof CSSAnimation).map((a) => (a as CSSAnimation).animationName));
const sourceFigure = (page: Page) => page.getByRole("region", { name: "Where visits come from" }).locator("[data-tile] p.font-display > span").first();
const visitsFigure = (page: Page) => page.getByRole("region", { name: "Numbers" }).getByRole("link", { name: /^Visits this week/ }).locator("p.font-display");

test.beforeEach(({ page }) => page.setViewportSize({ width: 1280, height: 900 })); // the sidebar

test("a client navigation fades the content in once, with its figures already in place; a hard load stays still", async ({ page }) => {
  await page.goto("/analytics");
  await page.waitForLoadState("load");
  await expect(page.locator("[data-fresh]")).toHaveCount(0);
  expect(await cssAnimations(page.getByRole("main"))).toEqual([]);
  const source = (await sourceFigure(page).textContent())!;
  await page.goto("/");
  const visits = (await visitsFigure(page).textContent())!;
  expect(visits).toMatch(/^\d+(\.\d)?[km]?$/); // rounded from 1,000 (#206)

  await (await sideLink(page, "Analytics")).click();
  await expect(page).toHaveURL(/\/analytics$/);
  const fresh = page.locator("[data-fresh]");
  await expect(fresh.getByRole("img").first()).toBeVisible();
  expect(await sourceFigure(page).textContent()).toBe(source); // at once: no count on the way
  expect(await cssAnimations(fresh)).toEqual(["arrive"]); // the content's one fade, nothing inside it

  await (await sideLink(page, "Overview")).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(visitsFigure(page)).toBeVisible();
  expect(await visitsFigure(page).textContent()).toBe(visits);
});

test("with reduced motion the content still fades in, the short fade stays", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await (await sideLink(page, "Analytics")).click();
  await expect(page).toHaveURL(/\/analytics$/);
  const fresh = page.locator("[data-fresh]");
  await expect(fresh.getByRole("img").first()).toBeVisible();
  expect(await cssAnimations(fresh)).toEqual(["arrive"]);
});
