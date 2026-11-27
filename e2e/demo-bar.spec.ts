import { expect, test } from "@playwright/test";
import { demoBar } from "./open";

test("on a phone the demo bar is a small pill: the role is on it, the rest opens above it and closes again", async ({ page }) => {
  await page.goto("/");
  const bar = page.locator("[data-demo-bar]");
  const role = bar.getByRole("combobox", { name: "Role" });
  const sync = bar.getByRole("button", { name: /sync/ });
  await expect(role).toBeVisible();
  await expect(sync).toBeHidden();
  await demoBar(page);
  await expect(sync).toBeVisible();
  await expect(role).toHaveCount(1); // the open panel holds no second role select
  await page.keyboard.press("Escape");
  await expect(sync).toBeHidden();
  await expect(role).toBeVisible();
});

// One system (#212): the bar switches the role and the stock source, never a plan.
test("the demo bar has no plan switch, on the narrowest phone or the slim bar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const bar = await demoBar(page);
  await expect(bar.getByRole("button", { name: /sync/ })).toBeInViewport({ ratio: 1 });
  await expect(bar.getByRole("button", { name: /^(Plan|Dashboard|Website)/ })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(bar.getByRole("combobox", { name: "Role" })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^(Plan|Dashboard|Website)/ })).toHaveCount(0);
});

test("light is the default, dark is a choice that sticks and does not flash", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", "dark");
  await expect(html).toHaveCSS("background-color", "rgb(244, 246, 251)");
  await (await demoBar(page)).getByRole("button", { name: "Light" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(html).toHaveCSS("background-color", "rgb(11, 15, 31)");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await (await demoBar(page)).getByRole("button", { name: "Dark" }).click();
  await expect(html).not.toHaveAttribute("data-theme", "dark");
});
