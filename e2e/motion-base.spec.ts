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

// The figures on /reports stream in under a Fresh (#200).
test("a client navigation to /reports eases the new content in", async ({ page, context }) => {
  await as(context, "Owner");
  await page.setViewportSize({ width: 1280, height: 900 }); // the sidebar
  await page.goto("/");
  await (await sideLink(page, "Reports")).click();
  await expect(page).toHaveURL(/\/reports$/);
  const fresh = page.locator("[data-fresh]");
  await expect(fresh).toHaveCount(1);
  expect(await fresh.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
});

// Loading bones (Skeleton.tsx) stand still and wait 150ms before they fade in, so a quick answer never flashes them (#214). Opacity only,
// so reduced motion keeps it. The CSS alone, on bones (a tile's inside a region's) put on the page by hand.
const bones = (page: Page) =>
  page.evaluate(() => {
    const wrap = Object.assign(document.createElement("div"), { innerHTML: '<div data-bones><div data-bones><span class="block h-4 bg-hairline"></span></div></div>' });
    document.querySelector("main")!.append(wrap);
    const s = getComputedStyle(wrap.firstElementChild!);
    return { name: s.animationName, delay: s.animationDelay, inner: wrap.firstElementChild!.getAnimations({ subtree: true }).length - 1 }; // one fade: a tile's bones inside a region's do not fade again
  });

test("loading bones wait, then fade in once, and still do under reduced motion", async ({ page }) => {
  await page.goto("/reports");
  expect(await bones(page)).toEqual({ name: "arrive", delay: "0.15s", inner: 0 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await bones(page)).toEqual({ name: "arrive", delay: "0.15s", inner: 0 });
});
