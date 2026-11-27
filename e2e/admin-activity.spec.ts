import { expect, test } from "@playwright/test";
import { as, notForRole } from "./open";
import { sideLink } from "./admin-menu";

// The activity history: owners and managers only (the demo bar's role, a cookie), every change, newest first.

test("sales and finance have no Activity page; owners and managers do", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); // the sidebar; the phone tab bar has its own test (admin-shell)
  for (const role of ["Sales", "Finance"]) {
    await as(context, role);
    await page.goto("/");
    await expect(await sideLink(page, "Activity")).toHaveCount(0);
    await notForRole(page, "/activity", "Every change in the dashboard");
  }
  for (const role of ["Manager", "Owner"]) {
    await as(context, role);
    await page.goto("/");
    await (await sideLink(page, "Activity")).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Activity");
    await expect.poll(() => page.getByRole("region", { name: "Changes" }).getByRole("listitem").count()).toBeGreaterThan(10); // the demo's history, not empty; it streams in under the header (#200)
  }
});

test("a change shows at the top, by the person who made it, and the filters narrow the list", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const name = `Activity test ${Date.now()}`; // its own record, so parallel specs never move it
  await page.goto("/settings?section=team");
  await page.getByRole("button", { name: "Add someone" }).click(); // the house dialog (#142)
  const add = page.getByRole("dialog", { name: "Add someone" });
  await add.getByLabel("Name", { exact: true }).fill(name);
  await add.getByLabel("Email", { exact: true }).fill(`${Date.now()}@example.com`);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: `Edit ${name}'s details` })).toBeVisible();

  await page.goto("/activity?area=settings");
  const row = page.getByRole("listitem").filter({ hasText: `Added ${name} to the team as Sales` });
  await expect(row).toContainText("Aoife Brennan");
  await expect(row.getByRole("link", { name })).toHaveAttribute("href", "/settings?section=team");
  await expect(page.getByRole("navigation", { name: "Area" }).getByRole("link", { name: /Settings/ })).toHaveAttribute("aria-current", "true");
  // Every row in the Settings view is a settings change.
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("radio", { name: "Conor Doyle" }).check();
  await expect(page).toHaveURL(/who=Conor/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("region", { name: "Changes" }).getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  // A bad filter is ignored, not an error.
  expect((await page.request.get("/activity?area=nope&who=nobody&period=x&page=999")).status()).toBe(200);

  await page.goto("/settings?section=team");
  const member = page.getByRole("row").filter({ hasText: name });
  await member.getByRole("button", { name: `More for ${name}` }).click(); // Remove is under the row's menu (#95)
  await member.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("a lead in the history is named from the lead itself, and links to it", async ({ page }) => {
  await page.goto("/activity?area=leads");
  const link = page.getByRole("region", { name: "Changes" }).getByRole("link").first();
  await expect(link).toHaveAttribute("href", /^\/leads\/lead-/);
  await link.click();
  await expect(page).toHaveURL(/\/leads\/lead-/);
});

test("the Activity page holds at 320px without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/activity");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});
