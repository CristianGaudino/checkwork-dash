import { expect, test } from "@playwright/test";
import { BASE } from "./open";
import { choose } from "./combo";

// The owner's 2026-11-11 list (#85 to #88), the dashboard's part: DoneDeal stock, the drop-down that stayed open, and the summary tabs
// and tables.

test.describe("the drop-down", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("closes on a second press, on a press elsewhere, and a press on its label does not reopen it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 }); // room for the list to open below the field, clear of its label
    await page.goto("/orders/new");
    const box = page.getByRole("combobox", { name: /^Buyer/ });
    const list = page.getByRole("listbox");
    await box.click();
    await expect(list).toBeVisible();
    await box.click();
    await expect(list).toHaveCount(0);
    await box.click();
    await page.getByRole("heading", { name: "Place an order" }).click();
    await expect(list).toHaveCount(0);
    await box.click();
    await page.getByText("Buyer", { exact: true }).first().click(); // the field's own label
    await expect(list).toHaveCount(0);
    await choose(box, 1); // and it still chooses
    await expect(box).not.toHaveValue("A new customer");
  });
});

test.describe("DoneDeal stock", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "checkwork-demo-stock", value: "donedeal", url: BASE }]);
  });

  test("the stock page is read only and points to DoneDeal", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByText(/^Last updated /)).toBeVisible();
    await expect(page.getByRole("link", { name: /Add a car/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mark sold" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Open DoneDeal/ })).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("row").nth(1).getByRole("link", { name: /^Edit .+ on DoneDeal/ })).toBeVisible();
    await page.goto("/stock/new");
    await expect(page.getByRole("heading", { name: "This stock comes from DoneDeal" })).toBeVisible();
    await expect(page.getByLabel("Make", { exact: true })).toHaveCount(0);
  });

  test("the stock page has no sync card, and Refresh stock runs the sync", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByRole("region", { name: "Cars from DoneDeal" })).toHaveCount(0);
    await page.getByRole("button", { name: "Refresh stock" }).click();
    await expect(page).toHaveURL(/\/stock\?synced=1$/);
    // The demo's feed is the stock itself, so a sync finds nothing to change.
    await expect(page.getByRole("status").filter({ hasText: "Stock refreshed. No changes." })).toBeVisible();
  });

  test("the overview has no Add car and no sync card; Settings shows the DoneDeal connection", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Add a car" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Cars from DoneDeal" })).toHaveCount(0);
    await page.goto("/settings?section=services");
    await expect(page.getByRole("region", { name: "DoneDeal" })).toContainText("Connected");
    await expect(page.getByRole("cell", { name: "DoneDeal stock" })).toBeVisible();
  });
});

test("our own stock has Add car, no sync and no DoneDeal service", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Add a car" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Cars from DoneDeal" })).toHaveCount(0);
  await page.goto("/settings?section=services");
  await expect(page.getByRole("cell", { name: "DoneDeal stock" })).toHaveCount(0);
  expect((await page.request.post("/api/donedeal/sync")).status()).toBe(404); // the cron's route needs its key
});

test("a car for sale is posted to social from its stock row; a sold car has no Post to social", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); // the row's buttons are from 640px; below 1536px Post is under More
  await page.goto("/stock");
  const row = page.getByRole("row").nth(1);
  await row.getByRole("button", { name: /^More for/ }).click();
  const post = row.getByRole("link", { name: "Post to social" });
  await expect(post).toHaveAttribute("href", /^\/marketing\/new\?car=/);
  await post.click();
  await expect(page).toHaveURL(/\/marketing\/new\?car=/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("New post");
  await page.goto("/stock?view=sold");
  const sold = page.getByRole("row").nth(1);
  await sold.getByRole("button", { name: /^More for/ }).click();
  await expect(sold.getByRole("link", { name: "Post to social" })).toHaveCount(0);
  // From 1536px it is in the row itself, in words.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/stock");
  await expect(page.getByRole("row").nth(1).getByRole("link", { name: "Post to social" })).toHaveText("Post to social");
});

test("the summary tiles are the filter: one press filters the table and marks the tile", async ({ page }) => {
  await page.goto("/stock");
  const tabs = page.getByRole("navigation", { name: "Stock views" });
  await tabs.getByRole("link", { name: /^Sold/ }).click();
  await expect(page).toHaveURL(/view=sold/);
  await expect(tabs.getByRole("link", { name: /^Sold/ })).toHaveAttribute("aria-current", "true");
  await page.goto("/customers");
  await page.getByRole("navigation", { name: "Customer lists" }).getByRole("link", { name: /^Stock alerts/ }).click();
  await expect(page.getByRole("columnheader", { name: "Looking for" })).toBeVisible();
});

