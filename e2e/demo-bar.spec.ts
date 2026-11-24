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

test("on the narrowest phone the dealer's module switches open inside the panel and can be used", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await demoBar(page);
  const bar = page.locator("[data-demo-bar]");
  const modules = bar.getByRole("button", { name: /^Plan/ });
  await expect(modules).toBeInViewport({ ratio: 1 });
  await modules.click();
  const dashboard = bar.getByRole("button", { name: /^Dashboard/ });
  await expect(dashboard).toBeInViewport({ ratio: 1 });
  await dashboard.click();
  await expect(modules).toContainText("Dashboard");
  await expect(modules).not.toContainText("Website"); // the dashboard alone, no longer Website + Dashboard
  await expect(dashboard).toHaveAttribute("aria-pressed", "true");
});

test("on the Website plan there is no dashboard: every page is not found, the dealer tools go, and the Plan switch brings it back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const bar = await demoBar(page);
  await bar.getByRole("button", { name: /^Plan/ }).click();
  await bar.getByRole("button", { name: /^Website\s?€/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await expect(bar.getByRole("combobox", { name: "Role" })).toHaveCount(0);
  // The page is not reloaded (no 404 now: the layout answers), so the plan list may still be open.
  const plan = bar.getByRole("button", { name: /^Plan/ });
  if ((await plan.getAttribute("aria-expanded")) !== "true") await plan.click();
  await bar.getByRole("button", { name: /^Website \+ Dashboard/ }).click();
  await expect(bar.getByRole("combobox", { name: "Role" })).toBeVisible(); // the dealer tools are back
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

// Without the dashboard module every page is the not found screen (the root layout decides per dealer, src/app/layout.tsx), with the bar
// still there to choose again. The proxy reads no directory, so the answer is the screen, not a 404 status.
test("the dashboard follows the modules: with none on, its pages are gone", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "checkwork-demo-modules", value: "none", url: baseURL! }]);
  for (const path of ["/", "/leads", "/test-drives"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveText("We couldn't find that page");
    await expect(page.getByRole("navigation", { name: "Dealer dashboard" }).getByRole("link"), path).toHaveCount(0);
  }
});
