import { expect, test } from "@playwright/test";

// The vehicle history check (#170). On the demo it is simulated: 171-D-1384, a car in stock, is the demo plate for an import
// (src/lib/history-rules.ts, DEMO_HISTORY).
test("a car in stock has its history checked, and the page shows the summary", async ({ page }) => {
  await page.goto("/stock/4710001");
  const panel = page.getByRole("region", { name: "History check" });
  await panel.getByRole("button", { name: /^Check (history|again)$/ }).click(); // again on a retry: the check is kept
  await expect(panel.getByText("Imported from the UK")).toBeVisible();
  await expect(panel.getByText(/171-D-1384 · \d+ owners? · First registered .*Checked /)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Check again" })).toBeVisible();
});
