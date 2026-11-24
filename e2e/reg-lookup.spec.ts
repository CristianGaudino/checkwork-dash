import { expect, test } from "@playwright/test";

// The registration lookup (#2), in the dashboard. On the demo it is simulated: the plate's own year and county, and a sample car for the
// make and model.
test("adding a car in the dashboard starts from the registration", async ({ page }) => {
  await page.goto("/stock/new");
  await page.getByRole("textbox", { name: /^Registration/ }).fill("242-D-98");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText(/Registered in Dublin, July to December 2024/)).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Year", exact: true })).toHaveValue("2024");
  await expect(page.getByRole("textbox", { name: /^Make/ })).not.toHaveValue("");
});

test("a valuation lead shows the car's plate, and the dealer can look it up", async ({ page }) => {
  await page.goto("/leads?type=trade-in");
  await page.getByRole("row").nth(1).getByRole("link").first().click();
  const panel = page.getByRole("region", { name: "Their car" });
  await expect(panel.getByRole("definition").first()).toHaveText(/^\d{3}-[A-Z]{1,2}-\d+$/);
  // The Look up in the Edit dialog: the panel's own only shows while the car is not looked up yet, which a seeded lead may not be.
  await panel.getByRole("button", { name: /^Edit/ }).click();
  const dialog = page.getByRole("dialog", { name: "Their car" });
  await dialog.getByRole("button", { name: "Look up" }).click();
  await expect(dialog.getByRole("status")).toContainText(/Registered in /);
  await expect(dialog.getByRole("textbox", { name: "Make" })).not.toHaveValue("");
});

test("the settings list the registration lookup as a service", async ({ page }) => {
  await page.goto("/settings?section=services");
  await expect(page.getByRole("row", { name: /Registration lookup/ })).toContainText("Connected"); // simulated on the demo
});
