import { expect, test } from "@playwright/test";

// An owner connects an outside service at a dealer that is not the demo (Test Motors; the run sets DEALER_SECRETS_KEY): it says Saved,
// the value is never in the page, and the demo dealer has no such panel (#26).
const TOKEN = "EAAB-e2e-secret-token-9f3a";

test("an owner saves a service's keys, they are never shown again, and the demo has no panel", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "checkwork-dealer", value: "test-motors", url: baseURL! }]);
  await page.goto("/settings?section=services");
  const panel = page.getByRole("region", { name: "Your accounts" });
  const row = panel.getByRole("listitem").filter({ hasText: "Facebook and Instagram posting" });
  await row.locator('input[name="META_PAGE_ID"]').fill("1234");
  await row.locator('input[name="META_PAGE_ACCESS_TOKEN"]').fill(TOKEN);
  await row.locator('input[name="META_INSTAGRAM_ID"]').fill("5678");
  await row.getByRole("button", { name: "Connect" }).click();
  await expect(row.getByText("Saved", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Remove" })).toBeVisible();
  expect(await page.content()).not.toContain(TOKEN);
  await page.reload();
  await expect(row.getByText("Saved", { exact: true })).toBeVisible();
  expect(await page.content()).not.toContain(TOKEN);
  await page.goto("/activity");
  await expect(page.getByText("Connected Facebook and Instagram posting").first()).toBeVisible();
  expect(await page.content()).not.toContain(TOKEN);
  // Remove it again, so a rerun starts clean.
  await page.goto("/settings?section=services");
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(row.getByRole("button", { name: "Connect" })).toBeVisible();

  await context.addCookies([{ name: "checkwork-dealer", value: "checkwork-motors", url: baseURL! }]);
  await page.goto("/settings?section=services");
  await expect(page.getByRole("region", { name: "Your accounts" })).toHaveCount(0);
});
