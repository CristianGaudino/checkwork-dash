import { expect, test } from "@playwright/test";
import { as } from "./open";
import { sideLink } from "./admin-menu";

// Reports: the whole dealership's for the margins roles, a salesperson's own (counts only) for sales. Prep costs on a car, margins only.

test("owners, managers and finance see the full report with profit; the period filter narrows it", async ({ page, context }) => {
  for (const role of ["Owner", "Manager", "Finance"]) {
    await as(context, role);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reports");
    await expect(page.getByText("Profit", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "By salesperson" })).toBeVisible();
  }
  await page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "3 months" }).click();
  await expect(page).toHaveURL(/period=3$/);
  await page.getByText("Sales each month", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Sales by month" }).getByRole("table").last().getByRole("row")).toHaveCount(4); // a header and three months (the first table is the chart's, for screen readers)
  expect((await page.request.get("/reports?period=7")).status()).toBe(200); // a bad period falls back
});

test("a tile shows a rounded figure with the exact one in its title, and the table under the chart the full figure (#206)", async ({ page }) => {
  await page.goto("/reports");
  const sales = page.getByRole("main").locator("p.font-display[title]").first(); // the Sales tile's figure
  await expect(sales).toHaveText(/^€\d+(\.\d)?[km]$/);
  await expect(sales).toHaveAttribute("title", /^€\d{1,3}(,\d{3})+$/);
  await page.getByText("Sales each month", { exact: true }).click();
  const month = page.getByRole("region", { name: "Sales by month" }).getByRole("table").last().getByRole("row").nth(1);
  await expect(month.getByRole("cell", { name: /^€/ }).first()).toHaveText(/^€[\d,]+$/); // never "k" or "m"
});

test("the monthly report is Reports' Monthly view: one menu entry, marked on both, and the menu's way in without Reports", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/reports");
  await page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "Monthly" }).click();
  await expect(page).toHaveURL(/\/monthly-report$/);
  await expect(page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "Monthly" })).toHaveAttribute("aria-current", "page");
  await expect(await sideLink(page, "Reports")).toHaveAttribute("aria-current", "page");
  await expect((await sideLink(page, "Reports")).locator("xpath=..").getByRole("link")).toHaveText(["Reports", "Analytics", "Margins"]);
  // Without the Margins module there is no /reports: the same entry opens the monthly report, with no views to switch to.
  await context.addCookies([{ name: "checkwork-demo-modules", value: "dashboard", url: baseURL! }]);
  await page.goto("/");
  await (await sideLink(page, "Reports")).click();
  await expect(page).toHaveURL(/\/monthly-report$/);
  await expect(page.getByRole("navigation", { name: "Period" })).toHaveCount(0);
});

test("a salesperson sees only their own counts: no money, no one else", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); // the sidebar; the phone tab bar has its own test (admin-shell)
  await as(context, "Sales");
  await page.goto("/");
  await (await sideLink(page, "Reports")).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reports");
  await expect(page.getByText("Your own figures, the last 12 months")).toBeVisible();
  const main = page.locator("main");
  await expect(main).not.toContainText("€");
  await expect(main).not.toContainText("Profit");
  await expect(main).not.toContainText("Aoife");
});

test("prep costs: margins roles add, change and remove a line on a car, in the house dialog and the row's menu; sales never see them", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await as(context, "Finance");
  await page.goto("/stock/4710005");
  const panel = page.getByRole("region", { name: "Prep costs" });
  const dialog = page.getByRole("dialog", { name: "Add a prep cost" });
  const note = `Scratch ${Date.now()}`;
  await panel.getByRole("button", { name: "Add a prep cost" }).click();
  await dialog.getByLabel("For").click();
  await page.getByRole("listbox").getByRole("option", { name: "Bodywork" }).click();
  await dialog.getByLabel("Amount (€)").fill("275");
  await dialog.getByLabel("Note (optional)").fill(note);
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog).toBeHidden();
  const line = panel.getByRole("listitem").filter({ hasText: note });
  await expect(line).toContainText("€275");
  await line.getByRole("button", { name: "More for Bodywork, €275" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const change = page.getByRole("dialog", { name: "Change prep cost" });
  await expect(change.getByLabel("Amount (€)")).toHaveValue("275");
  await change.getByLabel("Amount (€)").fill("300");
  await change.getByRole("button", { name: "Save" }).click();
  await expect(change).toBeHidden();
  await expect(line).toContainText("€300");
  await line.getByRole("button", { name: "More for Bodywork, €300" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(line).toHaveCount(0);
  await as(context, "Sales");
  await page.reload();
  await expect(page.getByRole("region", { name: "Prep costs" })).toHaveCount(0);
});
