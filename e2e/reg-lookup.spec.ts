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
  await expect(panel).toContainText(/Registration \d{3}-[A-Z]{1,2}-\d+/);
  await panel.getByRole("button", { name: "Look up" }).click();
  await expect(panel.getByRole("status")).toContainText(/Registered in /);
});

test("the settings list the registration lookup as a service", async ({ page }) => {
  await page.goto("/settings?section=services");
  await expect(page.getByRole("row", { name: /Registration lookup/ })).toContainText("Connected"); // simulated on the demo
});
