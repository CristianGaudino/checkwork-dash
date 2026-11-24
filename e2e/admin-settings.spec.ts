import { expect, test } from "@playwright/test";
import { as } from "./open";

test("a target is checked, saved, and changes what the overview calls late", async ({ page }) => {
  await page.goto("/settings?section=targets");
  // Read first, changed in the house dialog.
  await page.getByRole("button", { name: "Edit timings" }).click();
  const dialog = page.getByRole("dialog", { name: "Timings" });
  await dialog.locator('input[name="leadSlaHours"]').fill("0");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("At least 1 hour")).toBeVisible(); // a refused save keeps it open, the error by its field
  await dialog.locator('input[name="leadSlaHours"]').fill("2");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Saved. It works from now on")).toBeVisible();
  await expect(page.getByText("2 hours", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("list", { name: "To do" }).getByText(/^(Reply to|Follow up with) /).first()).toBeVisible();
});

test("a team member is added, shows in the lead owner choices, and cannot be added twice", async ({ page }) => {
  const name = `Tester ${Date.now() % 100000}`;
  await page.goto("/settings?section=team");
  const add = page.locator("form").filter({ has: page.locator('input[name="email"]') });
  await add.locator('input[name="name"]').fill(name);
  await add.locator('input[name="email"]').fill("tester@example.com");
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("cell", { name })).toBeVisible();
  await add.locator('input[name="name"]').fill(name);
  await add.locator('input[name="email"]').fill("tester@example.com");
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("already on the team")).toBeVisible();
  await add.locator('input[name="email"]').fill("tester2@example.com"); // an edit clears the old answer
  await expect(page.getByText("already on the team")).toHaveCount(0);
  await page.goto("/leads");
  await page.getByRole("row").nth(1).getByRole("link").first().click();
  await page.getByRole("combobox", { name: "Who has it" }).click(); // a drop-down of the team (#135)
  await expect(page.getByRole("option", { name })).toHaveCount(1);
});

test("the sections are one at a time; services say what is connected and how to ask for the rest, and the business details are shown", async ({ page }) => {
  await page.goto("/settings");
  // The business details are read first, and changed in the house dialog (#141).
  const details = page.getByRole("region", { name: "Business details" });
  await expect(details).toContainText("Checkwork Motors");
  await details.getByRole("button", { name: "Edit business details" }).click();
  await expect(page.getByRole("dialog", { name: "Business details" }).getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Checkwork Motors");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Team" })).toHaveCount(0); // one section at a time
  await expect(page.getByRole("region", { name: "Your plan" })).toHaveCount(0); // in Billing now, with a link
  await expect(page.getByRole("main").getByRole("link", { name: "Billing", exact: true })).toHaveAttribute("href", "/billing");
  await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Connected services", exact: true }).click();
  await expect(page).toHaveURL(/section=services/);
  const social = page.getByRole("row", { name: /Facebook and Instagram posting/ });
  // The three outward services are simulated on the demo, so they read as connected; lead email shows its true state.
  await expect(social).toContainText("Connected");
  await expect(social).toContainText("@checkworkmotors");
  await expect(page.getByRole("row", { name: /Lead email/ })).toContainText("Not connected");
  // Website keys are Checkwork's, made through the owner API (#118): nothing about them here.
  await expect(page.getByText("For your web developer")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Website connection" })).toHaveCount(0);
});

test("on a phone the tab row opens scrolled to the open section", async ({ page }) => {
  await page.goto("/settings?section=services");
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Connected services", exact: true })).toBeInViewport({ ratio: 1 });
});

test("the plan's rules we set are in Billing", async ({ page }) => {
  await page.goto("/billing");
  await expect(page.getByRole("region", { name: "What we set for you" })).toContainText("Old stock after");
});

test("without the settings permission only Notifications for their own device show: nothing else to see or save", async ({ page, context }) => {
  await as(context, "Sales");
  for (const section of ["", "?section=targets", "?section=team", "?section=emails", "?section=marketing", "?section=services", "?section=demo"]) {
    await page.goto(`/settings${section}`);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Notifications on this device" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Settings" })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("region")).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  }
});
