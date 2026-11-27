import { expect, test, type Locator, type Page } from "@playwright/test";
import { as } from "./open";

// A tapped tab, switch half or nav item takes the chosen look at the tap, while the server is still answering (#201, LinkPending):
// the navigation's RSC request is held, so nothing here can come from the next page.
async function holdNavigation(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/*", async (route) => {
    if (route.request().headers()["rsc"]) await gate;
    await route.continue().catch(() => {}); // a superseded request may be gone by then
  });
  return release;
}

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test("a status tile is chosen at the tap, and the last tap wins", async ({ page }) => {
  await page.goto("/leads");
  const tabs = page.getByRole("navigation", { name: "Lead status" });
  const all = tabs.getByRole("link", { name: /^All/ });
  const won = tabs.getByRole("link", { name: /^Won/ });
  const fresh = tabs.getByRole("link", { name: /^New/ });
  await expect(all).toHaveAttribute("aria-current", "true");
  const [on, off] = [await css(all, "border-color"), await css(won, "border-color")];
  const release = await holdNavigation(page);

  await won.click();
  await expect(won.locator("[data-pending]")).toHaveCount(1, { timeout: 1000 });
  await expect(won).toHaveCSS("border-color", on, { timeout: 1000 });
  await expect(all).toHaveCSS("border-color", off, { timeout: 1000 });
  // A second tap before the first lands: only it is pending, the first gives the look back.
  await fresh.click();
  await expect(fresh).toHaveCSS("border-color", on, { timeout: 1000 });
  await expect(won.locator("[data-pending]")).toHaveCount(0);
  await expect(won).toHaveCSS("border-color", off);
  await expect(all).toHaveCSS("border-color", off);
  await expect(page).toHaveURL(/\/leads$/); // still held: none of this came from the server
  await expect(all).toHaveAttribute("aria-current", "true");

  release();
  await expect(page).toHaveURL(/status=new/);
  await expect(fresh).toHaveAttribute("aria-current", "true");
  await expect(tabs.locator("[data-pending]")).toHaveCount(0);
  await expect(fresh).toHaveCSS("border-color", on);
  await expect(won).toHaveCSS("border-color", off);
});

test("tapping the tile already chosen leaves it chosen, and nothing stays pending", async ({ page }) => {
  await page.goto("/leads?status=won");
  const tabs = page.getByRole("navigation", { name: "Lead status" });
  const won = tabs.getByRole("link", { name: /^Won/ });
  await expect(won).toHaveAttribute("aria-current", "true");
  const on = await css(won, "border-color");
  const release = await holdNavigation(page);
  await won.click();
  await expect(won).toHaveCSS("border-color", on);
  release();
  await expect(tabs.locator("[data-pending]")).toHaveCount(0);
  await expect(won).toHaveAttribute("aria-current", "true");
  await expect(won).toHaveCSS("border-color", on);
});

test("the Whose switch's thumb moves at the tap, without a slide under reduced motion", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await as(context, "Sales");
  await page.goto("/");
  const whose = page.getByRole("navigation", { name: "Whose to-dos" });
  const everyone = whose.getByRole("link", { name: "Everyone" });
  const thumb = whose.locator("span[aria-hidden]").first();
  // Where the thumb sits in the track: 0 is under Everyone, about half the track under For me.
  const at = () => thumb.evaluate((el) => el.getBoundingClientRect().left - el.parentElement!.getBoundingClientRect().left);
  await expect(whose.getByRole("link", { name: "For me" })).toHaveAttribute("aria-current", "page");
  expect(await at()).toBeGreaterThan(20);
  const release = await holdNavigation(page);

  await everyone.click();
  await expect(everyone.locator("[data-pending]")).toHaveCount(1, { timeout: 1000 });
  await expect.poll(at, { timeout: 1000 }).toBeLessThan(5);

  release();
  await expect(page).toHaveURL(/mine=0/);
  await expect(everyone).toHaveAttribute("aria-current", "page");
  await expect(whose.locator("[data-pending]")).toHaveCount(0);
  expect(await at()).toBeLessThan(5);
});

test("the tab bar marks the tapped place at the tap", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByRole("navigation", { name: "Dealer dashboard" }).filter({ visible: true });
  const overview = bar.getByRole("link", { name: "Overview" });
  const leads = bar.getByRole("link", { name: "Leads" });
  await expect(overview).toHaveAttribute("aria-current", "page");
  const [on, off] = [await css(overview, "color"), await css(leads, "color")];
  const release = await holdNavigation(page);

  await leads.click();
  await expect(leads).toHaveCSS("color", on, { timeout: 1000 });
  await expect(overview).toHaveCSS("color", off, { timeout: 1000 });

  release();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(leads).toHaveAttribute("aria-current", "page");
  await expect(bar.locator("[data-pending]")).toHaveCount(0);
});

test("the sidebar marks the tapped place at the tap", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const side = page.getByRole("navigation", { name: "Dealer dashboard" }).filter({ visible: true });
  const overview = side.getByRole("link", { name: "Overview" });
  const leads = side.getByRole("link", { name: "Leads" });
  await expect(overview).toHaveAttribute("aria-current", "page");
  const [on, off] = [await css(overview, "background-color"), await css(leads, "background-color")];
  const release = await holdNavigation(page);

  await leads.click();
  await expect(leads).toHaveCSS("background-color", on, { timeout: 1000 });
  await expect(overview).toHaveCSS("background-color", off, { timeout: 1000 });

  release();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(leads).toHaveAttribute("aria-current", "page");
  await expect(side.locator("[data-pending]")).toHaveCount(0);
});
