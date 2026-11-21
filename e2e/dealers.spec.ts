import { expect, test } from "@playwright/test";

// One app, a store per dealer (src/lib/tenancy). The open app's person (dev@checkwork.invalid) is seeded at two dealers in the directory's
// memory copy (src/lib/tenancy/directory.ts): the demo dealer, which it opens by default, and Test Motors, which starts empty.
test("someone at two dealers switches between them, and each shows only its own records", async ({ page }) => {
  const name = `Separate ${Date.now() % 100000}`;
  await page.goto("/leads");
  await expect(page.getByText(/^Showing 1 to /)).toBeVisible(); // the demo dealer's made-up leads

  await page.goto("/dealers");
  await expect(page.getByRole("heading", { level: 1, name: "Switch dealer" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Checkwork Motors/ })).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: /^Test Motors/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dealers");
  await expect(page.getByRole("button", { name: /^Test Motors/ })).toHaveAttribute("aria-current", "true");

  // Test Motors: none of the demo's leads or cars, and its own team.
  await page.goto("/leads");
  await expect(page.getByText("No leads match")).toBeVisible();
  await page.goto("/stock");
  await expect(page.getByText("No cars match")).toBeVisible();
  await page.goto("/settings?section=team");
  const add = page.locator("form").filter({ has: page.locator('input[name="email"]') });
  await add.locator('input[name="name"]').fill(name);
  await add.locator('input[name="email"]').fill(`separate${Date.now() % 100000}@example.com`);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("cell", { name })).toBeVisible();

  // Back at the demo dealer: its leads again, and not the person added at Test Motors.
  await page.goto("/dealers");
  await page.getByRole("button", { name: /^Checkwork Motors/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/leads");
  await expect(page.getByText(/^Showing 1 to /)).toBeVisible();
  await page.goto("/settings?section=team");
  await expect(page.getByRole("cell", { name: "Aoife Brennan" })).toBeVisible();
  await expect(page.getByRole("cell", { name })).toHaveCount(0);
});

test("a forged dealer cookie for a dealer the person is not at opens nothing of it", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "checkwork-dealer", value: "nobody-motors", url: baseURL! }]);
  await page.goto("/leads");
  await expect(page.getByText(/^Showing 1 to /)).toBeVisible(); // the demo dealer, as with no cookie
});
