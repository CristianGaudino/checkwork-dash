import { expect, test } from "@playwright/test";

test("customers and stock alerts each have a table, and an alert can be stopped", async ({ page }) => {
  await page.goto("/customers");
  expect((await page.getByRole("row").count()) - 1).toBeGreaterThan(5);
  await page.getByRole("link", { name: "Stock alerts" }).click();
  const active = page.getByRole("row").filter({ hasText: "Active" }).first();
  await active.getByRole("button", { name: /^More for / }).click(); // Stop and Remove are under the row's menu (#95)
  await active.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("link", { name: "Stock alerts" })).toHaveAttribute("aria-current", "true");
  const paused = page.getByRole("row").filter({ hasText: "Stopped" }).first();
  await expect(paused).toBeVisible();
  // Consent only goes one way: staff can stop an alert, never start one again for the person.
  await expect(paused.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Resume|Turn on/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Subscribers/ })).toHaveCount(0); // the newsletter is gone (#149)
});

// NCT and service reminders (#171): a purchase shows when each is due. The demo's first sale (cust-300's) has its NCT typed on the sale.
test("a customer's purchase shows the NCT and service due", async ({ page }) => {
  await page.goto("/customers/cust-300");
  const purchases = page.getByRole("region", { name: "Purchases" });
  await expect(purchases).toContainText(/NCT due \d+ \w{3} \d{4}/);
  await expect(purchases).toContainText(/Service due \d+ \w{3} \d{4}/);
});
