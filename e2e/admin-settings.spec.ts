import { expect, test } from "@playwright/test";
import { as } from "./open";

test("a target is checked, saved, and changes what the overview calls late", async ({ page }) => {
  await page.goto("/settings?section=targets");
  await page.locator('input[name="leadSlaHours"]').fill("0");
  await page.locator("form").filter({ has: page.locator('input[name="leadSlaHours"]') }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("At least 1 hour")).toBeVisible();
  await page.locator('input[name="leadSlaHours"]').fill("2");
  await page.locator("form").filter({ has: page.locator('input[name="leadSlaHours"]') }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("list", { name: "To do" }).getByRole("link", { name: /^Open .*'s lead$/ }).first()).toBeVisible();
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
  await expect(page.getByRole("region", { name: "Who has it" }).getByRole("button", { name })).toHaveCount(1);
});

test("the sections are one at a time; services say what is connected and how to ask for the rest, and the business details are shown", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("main").getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Checkwork Motors"); // the business details, not the menu
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
  // The website keys are for a web developer: folded until asked for.
  await expect(page.getByRole("region", { name: "Website connection" })).toBeHidden();
  await page.getByText("For your web developer").click();
  await expect(page.getByRole("region", { name: "Website connection" })).toBeVisible();
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
