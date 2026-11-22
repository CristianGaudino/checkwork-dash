import { expect, test, type Locator } from "@playwright/test";
import { NAV_COOKIE, openGroupsCookie } from "../src/lib/admin/nav";
import { BASE } from "./open";
import { sideMenu } from "./admin-menu";

// The shared parts (#43): tab rows that show there is more, tap targets of 44px on a phone, and the sidebar's top block on a laptop.

// The hit area, measured as a finger finds it: what a press lands on (the control, or the label that holds a tick box) is hit 21.5px
// above, below, left and right of its centre, so it is at least 43px each way (44 less rounding).
async function hitsAt44(control: Locator) {
  return control.evaluate((el) => {
    const t = el.closest("label") ?? el;
    t.scrollIntoView({ block: "center" }); // clear of the tab bar at the foot of the screen
    const r = t.getBoundingClientRect();
    const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
    return [[x, y - 21.5], [x, y + 21.5], [x - 21.5, y], [x + 21.5, y]].every(([px, py]) => t.contains(document.elementFromPoint(px, py)));
  });
}

test.describe("on a 390px phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a row of summary tabs fades where there is more, and its last tab can be reached", async ({ page }) => {
    await page.goto("/marketing");
    const row = page.getByRole("navigation", { name: "Marketing" });
    const last = row.getByRole("link", { name: /^Newsletters/ });
    const fade = () => row.evaluate((n) => [getComputedStyle(n).getPropertyValue("--fade-l").trim(), getComputedStyle(n).getPropertyValue("--fade-r").trim()]);
    expect(await row.evaluate((n) => getComputedStyle(n).maskImage)).toContain("gradient");
    await expect.poll(fade).toEqual(["0px", "2rem"]); // at the start: more to the right only
    await row.evaluate((n) => n.scrollTo({ left: n.scrollWidth }));
    await expect.poll(fade).toEqual(["2rem", "0px"]); // at the end: more to the left only
    const [r, l] = [(await row.boundingBox())!, (await last.boundingBox())!];
    expect(l.x + l.width).toBeLessThanOrEqual(r.x + r.width + 1); // the last tab wholly in view
    await last.click();
    await expect(page).toHaveURL(/tab=newsletters$/);
  });

  test("small controls have a 44px hit area: activity links, Set a limit, the reminder switch, the order's choices, the pager", async ({ page }) => {
    const controls: [string, (p: typeof page) => Locator][] = [
      ["/activity", (p) => p.locator("main section[aria-label='Changes'] li a").first()],
      ["/billing", (p) => p.getByRole("link", { name: "Set a limit" })],
      ["/settings?section=emails", (p) => p.locator('input[name="followUps"]')],
      ["/leads?per=10", (p) => p.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Next" })],
      ["/leads?per=10&page=2", (p) => p.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Previous" })],
    ];
    for (const [path, find] of controls) {
      await page.goto(path);
      expect(await hitsAt44(find(page)), path).toBe(true);
    }
    // An order's cancel form (a seeded order on its way, with a deposit): what happens to the deposit.
    await page.goto("/orders/order-s4");
    const radios = page.locator('input[name="outcome"][type="radio"]');
    await expect(radios).toHaveCount(2);
    for (const r of await radios.all()) expect(await hitsAt44(r)).toBe(true);
  });
});

test("on a 1280x800 laptop with every group open, Overview and Leads stay in view and only the groups scroll", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const [name, value] = openGroupsCookie(["Customers", "Results", "Settings and help"]).split(";")[0].split("=");
  expect(name).toBe(NAV_COOKIE);
  await context.addCookies([{ name, value, url: BASE }]);
  await page.goto("/data-requests"); // the menu's last entry, so the menu scrolls to it
  const side = sideMenu(page);
  await expect(side.getByRole("link", { name: "Data requests", exact: true })).toBeInViewport();
  for (const label of ["Overview", "Leads"]) await expect(side.getByRole("link", { name: label, exact: true })).toBeInViewport({ ratio: 1 });
  // Someone at two dealers has Switch dealer, with its own icon, not Overview's house.
  const icon = (label: string) => side.getByRole("link", { name: label, exact: true }).locator("svg").evaluate((s) => s.innerHTML);
  expect(await icon("Switch dealer")).not.toBe(await icon("Overview"));
});
