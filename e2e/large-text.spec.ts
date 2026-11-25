import { expect, test, type Page } from "@playwright/test";

// Large text (#189): no sideways scroll on a phone (320 to 480px) with text at 150%, nor from 640px up at 200%. The text size is the root's,
// as a browser's text zoom sets it, so every rem in the type scale grows. Measured against the page's own width (clientWidth): the Pixel 7
// profile widens innerWidth when a page overflows, which would hide the fault.
// The pages whose layout is the shared kit, charts and shell. Others join as their own fixes land.
const PAGES = ["/", "/leads", "/test-drives", "/test-drives?view=list", "/analytics", "/reports", "/stock", "/customers", "/activity", "/margins"];
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
      await page.goto(path);
      expect(await overflow(page, scale), `${path} @${width}px, text ${scale * 100}%`).toBeLessThanOrEqual(0);
    }
  });
}

test("the tab bar's labels and the Whose switch stay on screen at 320px with text at 150%", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/leads");
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
