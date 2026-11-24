import { expect, test } from "@playwright/test";
import { sideMenu } from "./admin-menu";

// Each dealer's name, logo, website and plan come from their profile in the directory (src/lib/tenancy/profile.ts). The open app's person is
// at both seeded dealers: the demo (every module, its logo and website) and Test Motors (plain defaults: the dashboard alone, no logo,
// no website). The dealer cookie picks one, as Switch dealer does; the demo bar's switches count for the demo dealer only.
const at = (dealer: string, baseURL: string) => [{ name: "checkwork-dealer", value: dealer, url: baseURL }];
const DEMO_SWITCHES = (baseURL: string) => [
  { name: "checkwork-demo-modules", value: "all", url: baseURL },
  { name: "checkwork-demo-role", value: "Sales", url: baseURL },
];

test("Test Motors shows its own name and its plan's smaller menu, and the demo bar's switches change nothing for it", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); // the sidebar
  await context.addCookies([...at("test-motors", baseURL!), ...DEMO_SWITCHES(baseURL!)]);
  await page.goto("/");
  const side = sideMenu(page);
  await expect(page.locator("aside").getByText("Test Motors", { exact: true }).first()).toBeVisible(); // no logo yet: the name
  await expect(page.locator("aside").getByRole("img", { name: "Test Motors" })).toHaveCount(0);
  await expect(page.locator("aside").getByRole("link", { name: /View your website/ })).toHaveCount(0); // no website set
  await expect(side.getByRole("link", { name: "Leads", exact: true })).toBeVisible();
  for (const label of ["Test drives", "Marketing", "WhatsApp"]) await expect(side.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  // A module's page answers as not in the plan, whatever the plan cookie says.
  await page.goto("/test-drives");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not in your plan");
  // The role is the directory's (an owner here), not the cookie's Sales; the demo bar has the theme only.
  await page.goto("/settings?section=business");
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: /^Business/ })).toBeVisible(); // the dealership's sections, not only Sales's own account
  const bar = page.locator("[data-demo-bar]");
  await expect(bar.getByRole("combobox", { name: "Role" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: /^Plan/ })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: /^(Light|Dark)$/ })).toBeVisible();
  // Its own facts are its owner's to change, here.
  await page.getByRole("button", { name: "Edit business details" }).click();
  const dialog = page.getByRole("dialog", { name: "Business details" });
  await dialog.getByRole("textbox", { name: "Phone", exact: true }).fill("01 555 0101");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("toast")).toContainText("Saved");
  await page.reload();
  await expect(page.getByRole("region", { name: "Business details" })).toContainText("01 555 0101");
});

test("the demo dealer still shows everything: its logo, its website and every module", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.addCookies(at("checkwork-motors", baseURL!));
  await page.goto("/");
  const side = sideMenu(page);
  await expect(page.locator("aside").getByRole("img", { name: "Checkwork Motors" }).first()).toBeAttached();
  await expect(page.locator("aside").getByRole("link", { name: /View your website/ })).toHaveAttribute("href", "https://www.demo.checkwork.ie");
  for (const label of ["Leads", "Test drives", "Marketing"]) await expect(side.getByRole("link", { name: label, exact: true })).toBeVisible();
  await expect(page.locator("[data-demo-bar]").getByRole("combobox", { name: "Role" })).toBeVisible();
});
