import { expect, test, type Locator, type Page } from "@playwright/test";

// Where visits come from (#35, #213): on the Overview the three busiest under the week's visits, on Analytics a ranked list with each group's
// networks always listed under it, nothing to open. Each source has its mark, its visits and its leads, with nothing scrolling sideways.
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function expectSources(rows: Locator) {
  for (const row of await rows.all()) {
    await expect(row.locator("svg").first()).toBeVisible();
    await expect(row).toContainText(/\d[km]? visits?/); // rounded from 1,000 (#206)
    await expect(row).toContainText(/\d leads?/);
  }
}

for (const width of [390, 1280]) {
  test(`the overview's Visits row shows the three busiest channels with their marks, and opens Analytics, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const row = page.getByRole("region", { name: "This week" }).getByRole("link", { name: /^Visits/ });
    const channels = row.getByRole("listitem");
    await expect(channels).toHaveCount(3);
    for (const c of await channels.all()) await expect(c.locator("svg").first()).toBeVisible();
    expect(await noSideways(page)).toBe(true);
    await row.click();
    await expect(page).toHaveURL(/\/analytics\?range=7$/); // the row counts this week, so Analytics opens on 7 days
  });

  test(`analytics ranks the sources, with each group's networks listed under it, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/analytics");
    const view = page.getByRole("region", { name: "Where visits come from" });
    await expect(view.getByText("Search", { exact: true })).toBeVisible();
    await expect(view.getByText("Most leads").first()).toBeVisible();
    await expect(view.locator("details")).toHaveCount(0); // nothing to open
    const networks = view.getByRole("list", { name: "Search: by site" }).getByRole("listitem");
    await expect(networks).toHaveCount(2); // Google and Bing, on the page
    await expect(networks.filter({ hasText: "Google" })).toBeVisible();
    await expectSources(view.getByRole("listitem"));
    // Most visits first.
    const visits = await view.locator(":scope ol > li > div .font-display").allTextContents();
    const n = (v: string) => parseFloat(v) * (/k/.test(v) ? 1000 : 1);
    expect(visits.map(n)).toEqual([...visits.map(n)].sort((a, b) => b - a));
    expect(await noSideways(page)).toBe(true);
  });
}
