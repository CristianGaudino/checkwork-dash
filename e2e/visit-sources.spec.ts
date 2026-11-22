import { expect, test, type Locator, type Page } from "@playwright/test";

// Where visits come from (#35): on the Overview the busiest channels, on Analytics the groups opening into their networks. Each tile has
// its mark, its visits and its leads, two across on a phone, with nothing scrolling sideways.
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function expectTiles(tiles: Locator) {
  for (const tile of await tiles.all()) {
    await expect(tile.locator("svg").first()).toBeVisible();
    await expect(tile).toContainText(/\d visits?/);
    await expect(tile).toContainText(/\d leads?/);
  }
}

for (const width of [390, 1280]) {
  test(`the overview shows the four busiest channels, with marks and numbers, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const strip = page.getByRole("region", { name: "Where visits come from" });
    const tiles = strip.locator("[data-tile]");
    await expect(tiles).toHaveCount(4);
    await expectTiles(tiles);
    const [a, b] = [await tiles.nth(0).boundingBox(), await tiles.nth(1).boundingBox()];
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2); // two across
    expect(await noSideways(page)).toBe(true);
    await strip.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/analytics$/);
  });

  test(`analytics shows each group, and a group opens into its networks, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/analytics");
    const view = page.getByRole("region", { name: "Where visits come from" });
    await expect(view.getByText("Search", { exact: true })).toBeVisible();
    await expect(view.getByText("Most leads").first()).toBeVisible();
    const search = view.locator("details").filter({ hasText: "Search" });
    const networks = search.locator(":scope > div [data-tile]");
    await expect(networks.first()).toBeHidden();
    await search.locator("summary").click();
    await expect(networks).toHaveCount(2); // Google and Bing
    await expect(networks.filter({ hasText: "Google" })).toBeVisible();
    await expectTiles(view.locator("[data-tile]:visible"));
    expect(await noSideways(page)).toBe(true);
  });
}
