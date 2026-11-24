import { expect, test } from "@playwright/test";
import { as, notForRole } from "./open";
import { sideLink } from "./admin-menu";

// Margins and cost prices are behind a permission that comes with the role. In this run the demo bar is on, so its role (a cookie) is
// what grants it: the owner by default, sales has none.

test("without the permission there is no Margins screen, no margin column or stat, and no cost box", async ({ page, context }) => {
  await as(context, "Sales");
  await page.goto("/");
  await expect(await sideLink(page, "Margins")).toHaveCount(0);
  await expect(page.getByText("Expected margin")).toHaveCount(0);
  await notForRole(page, "/margins", "Expected margin on stock");
  await page.goto("/stock");
  await expect(page.getByRole("columnheader", { name: "Margin" })).toHaveCount(0);
  await page.goto("/stock/new");
  await expect(page.getByLabel("Cost price (€)")).toHaveCount(0);
});

test("with the permission the Margins screen, the column, the stat and the cost box appear", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 }); // the margin columns are from 768px
  await as(context, "Finance");
  await page.goto("/");
  await (await sideLink(page, "Margins")).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Margins");
  await expect(page.getByRole("row").nth(1)).toContainText("€");
  await page.goto("/stock");
  await expect(page.getByRole("columnheader", { name: "Margin" }).first()).toBeVisible();
  await page.goto("/stock/new");
  await expect(page.getByLabel("Cost price (€)")).toBeVisible();
});

test("the demo bar's role decides what the dealer sees, the owner by default", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); // the sidebar, and the demo bar as one line
  await page.goto("/");
  const bar = page.locator("[data-demo-bar]");
  const role = bar.getByRole("combobox", { name: "Role" });
  await expect(role).toHaveValue("Owner");
  const margins = await sideLink(page, "Margins"); // opens its group, which stays open as the role changes
  await expect(margins).toBeVisible();
  await role.selectOption("Sales");
  await expect(margins).toHaveCount(0);
  await role.selectOption("Finance");
  await expect(margins).toBeVisible();
});

test("only an owner or manager changes the team and the settings; a manager cannot change an owner", async ({ page, context }) => {
  await as(context, "Sales");
  await page.goto("/settings?section=targets");
  await expect(page).toHaveURL(/\/settings$/); // the dealership's sections are not theirs: back to their own account
  await expect(page.getByRole("button", { name: "Edit timings" })).toHaveCount(0);
  await page.goto("/settings?section=team");
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await as(context, "Manager");
  await page.goto("/settings?section=targets");
  await page.getByRole("button", { name: "Edit timings" }).click();
  await expect(page.getByLabel("Reply to a new lead within (hours)")).toBeEnabled();
  await page.keyboard.press("Escape");
  await page.goto("/settings?section=team");
  await expect(page.getByRole("button", { name: "Edit Conor Doyle's details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Aoife Brennan's details" })).toHaveCount(0); // the owner: theirs to change, not a manager's
});

test("an owner changes a role in the person's dialog, and the team cannot be left without an owner", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const name = `Role test ${Date.now()}`; // its own person, so parallel specs never see a changed team
  await page.goto("/settings?section=team");
  await page.getByRole("button", { name: "Add someone" }).click();
  const add = page.getByRole("dialog", { name: "Add someone" });
  await add.getByLabel("Name", { exact: true }).fill(name);
  await add.getByLabel("Email", { exact: true }).fill(`${Date.now()}@example.com`);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  const member = page.getByRole("row").filter({ hasText: name });
  await expect(member).toContainText("Sales ·");
  await page.getByRole("button", { name: `Edit ${name}'s details` }).click();
  const person = page.getByRole("dialog", { name });
  await person.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("listbox").getByRole("option", { name: "Finance" }).click();
  await person.getByRole("button", { name: "Save" }).click();
  await expect(person).toBeHidden();
  await page.reload();
  await expect(member).toContainText("Finance ·");
  // The only owner cannot be demoted: it says why, keeps the dialog open, and stays an owner.
  await page.getByRole("button", { name: "Edit Aoife Brennan's details" }).click();
  const owner = page.getByRole("dialog", { name: "Aoife Brennan" });
  await owner.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("listbox").getByRole("option", { name: "Sales" }).click();
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByRole("alert").filter({ hasText: "Keep at least one owner on the team" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row").filter({ hasText: "Aoife Brennan" })).toContainText("Owner ·");
  await member.getByRole("button", { name: `More for ${name}` }).click(); // Remove is under the row's menu (#95)
  await member.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});

test("a bad cost stops the save and says why", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await as(context, "Owner");
  await page.goto("/stock/new");
  await page.getByLabel("Make", { exact: true }).fill("Skoda");
  await page.getByLabel("Model", { exact: true }).fill("Octavia");
  await page.getByLabel("Year", { exact: true }).fill("2021");
  await page.getByLabel("Price (€)", { exact: true }).fill("19950");
  await page.getByLabel("Cost price (€)").fill("-5");
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByText("Enter the cost in whole euros")).toBeVisible();
  await expect(page).toHaveURL(/\/stock\/new$/); // not saved, so nothing was added to the stock
});
