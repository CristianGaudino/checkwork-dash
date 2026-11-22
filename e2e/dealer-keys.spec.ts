import { expect, test } from "@playwright/test";

// Dealers never set or remove keys: Checkwork does it through the owner API (docs/owner-api.md). Settings only says whether a service is connected (#80).
test("Settings has no key form or remove button, for an owner or the demo", async ({ page, context, baseURL }) => {
  for (const dealer of ["test-motors", "checkwork-motors"]) {
    await context.addCookies([{ name: "checkwork-dealer", value: dealer, url: baseURL! }]);
    await page.goto("/settings?section=services");
    await expect(page.getByRole("heading", { name: "Connected services" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Your accounts" })).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Remove|Connect|Replace/ })).toHaveCount(0);
  }
});
