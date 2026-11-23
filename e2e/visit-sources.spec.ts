import { expect, test, type Locator, type Page } from "@playwright/test";

// Where visits come from (#35): on the Overview the three busiest under the week's visits, on Analytics the groups opening into their networks. Each tile has
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
  test(`the overview's Visits tile shows the three busiest channels with their marks, and opens Analytics, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const tile = page.getByRole("region", { name: "Numbers" }).getByRole("link", { name: /^Visits this week/ });
    const channels = tile.getByRole("listitem");
    await expect(channels).toHaveCount(3);
    for (const c of await channels.all()) await expect(c.locator("svg").first()).toBeVisible();
    expect(await noSideways(page)).toBe(true);
    await tile.click();
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
