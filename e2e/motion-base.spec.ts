import { expect, test, type Page } from "@playwright/test";
import { as } from "./open";
import { sideLink } from "./admin-menu";

// The shared motion base (#199): press feedback that eases, and Fresh (Tween.tsx), which eases in what arrived in the browser and never
// what the server painted first.

test("a summary tab with transition-colors still eases its press", async ({ page }) => {
  await page.goto("/leads");
  const tab = page.getByRole("navigation", { name: "Lead status" }).getByRole("link").first();
  expect(await tab.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("scale");
});

test("a hard load of /reports has nothing fresh on it", async ({ page, context }) => {
  await as(context, "Owner");
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("load");
  await expect(page.locator("[data-fresh]")).toHaveCount(0);
});

// Fresh is put on /reports by #200 (streaming): until then nothing on the page uses it.
test.fixme("a client navigation to /reports eases the new content in", async ({ page, context }) => {
  await as(context, "Owner");
  await page.setViewportSize({ width: 1280, height: 900 }); // the sidebar
  await page.goto("/");
  await (await sideLink(page, "Reports")).click();
  await expect(page).toHaveURL(/\/reports$/);
  const fresh = page.locator("[data-fresh]");
  await expect(fresh).toHaveCount(1);
  expect(await fresh.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
});

// The CSS alone, on a chart put on the page by hand, so it holds before any page uses [data-chart] (#202).
const chartAnimations = (page: Page) =>
  page.evaluate(() => {
    const wrap = Object.assign(document.createElement("div"), { innerHTML: "<div data-chart></div>" });
    wrap.setAttribute("data-fresh", "");
    document.querySelector("main")!.append(wrap);
    return wrap.querySelector("[data-chart]")!.getAnimations().length;
  });

test("a fresh chart draws in, and stands still with reduced motion", async ({ page }) => {
  await page.goto("/reports");
  expect(await chartAnimations(page)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await chartAnimations(page)).toBe(0);
});
