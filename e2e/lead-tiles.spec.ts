import { expect, test, type Locator, type Page } from "@playwright/test";

// The one that matters leads (#208): on each page with a row of tiles, figures or head buttons, the lead is first (second after All on a
// row of tabs, so the reading order stays the same), wider than the others, and the row has no gaps and no sideways scroll.
// [page, the lead's label, its place in the row]
const LEADS = [
  ["/", "Reply to leads", 0],
  ["/", "Leads this week", 0],
  ["/analytics", "Leads", 0],
  ["/margins", "Expected margin on stock", 0],
  ["/reports", "Profit", 0],
  ["/monthly-report", "Leads", 0],
  ["/leads", "New", 1],
  ["/stock", "For sale", 0],
  ["/reviews", "Needs a reply", 1],
  ["/aftersales", "Requests", 0],
] as const;

// The lead's place among the tiles beside it, its width, the widths of the tiles that share a row (an odd last tile fills its row, as wide
// as the lead, by design), the widest of all, and the rows that do not reach both edges (gaps). A row of tabs that scrolls sideways on a
// phone is one row by design: its edges are not measured.
const measure = (lead: Locator) =>
  lead.evaluate((el) => {
    const row = el.parentElement!;
    const tiles = [...row.children].filter((c) => c.getBoundingClientRect().width > 0);
    const box = row.getBoundingClientRect();
    const css = getComputedStyle(row);
    const [left, right] = [box.left + parseFloat(css.paddingLeft), box.right - parseFloat(css.paddingRight)];
    const rows = new Map<number, Element[]>();
    for (const t of tiles) rows.set(Math.round(t.getBoundingClientRect().top), [...(rows.get(Math.round(t.getBoundingClientRect().top)) ?? []), t]);
    const rect = (t: Element) => t.getBoundingClientRect();
    const scrolls = row.scrollWidth > row.clientWidth + 1;
    const gaps = scrolls ? 0 : [...rows.values()].filter((ts) => Math.min(...ts.map((t) => rect(t).left)) > left + 1 || Math.max(...ts.map((t) => rect(t).right)) < right - 1).length;
    const others = tiles.filter((t) => t !== el);
    return {
      index: tiles.indexOf(el),
      lead: rect(el).width,
      paired: others.filter((t) => rows.get(Math.round(rect(t).top))!.length > 1).map((t) => rect(t).width),
      widest: Math.max(...others.map((t) => rect(t).width)),
      gaps,
    };
  });

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [360, 1280]) {
  test(`each page's lead tile comes first and wider, with no gaps, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, label, index] of LEADS) {
      await page.goto(path);
      const lead = page.getByRole("main").locator("[data-lead]").filter({ hasText: label }).first();
      await expect(lead).toBeVisible();
      // The Overview's website tiles and the reports' figures arrive after the first paint: measure once they are in.
      await expect(async () => {
        const m = await measure(lead);
        expect(m.index, `${path} ${label}: place`).toBe(index);
        expect(m.paired.length, `${path} ${label}: tiles beside it`).toBeGreaterThan(0);
        expect(m.lead, `${path} ${label}: wider than the others`).toBeGreaterThan(Math.max(...m.paired) + 1);
        expect(m.lead, `${path} ${label}: none wider`).toBeGreaterThanOrEqual(m.widest - 1);
        expect(m.gaps, `${path} ${label}: rows with a gap`).toBe(0);
      }).toPass();
      expect(await overflow(page), `${path} @${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("the tabs with a lead still filter, and the lead keeps the chosen look when picked", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/leads");
  const tabs = page.getByRole("navigation", { name: "Lead status" });
  await expect(tabs.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "true");
  await tabs.getByRole("link", { name: /^Contacted/ }).click();
  await expect(page).toHaveURL(/status=contacted/);
  await expect(tabs.getByRole("link", { name: /^Contacted/ })).toHaveAttribute("aria-current", "true");
  await tabs.getByRole("link", { name: /^New/ }).click();
  await expect(page).toHaveURL(/status=new/);
  await expect(tabs.getByRole("link", { name: /^New/ })).toHaveAttribute("aria-current", "true");
  await expect(tabs.getByRole("link", { name: /^Contacted/ })).not.toHaveAttribute("aria-current");
});

test("the Reply to leads button says its count in its name, large on screen", async ({ page }) => {
  await page.goto("/");
  const reply = page.getByRole("navigation", { name: "Quick actions" }).getByRole("link", { name: /^Reply to leads \d+ leads? to answer$/ });
  await expect(reply).toBeVisible();
  const size = await reply.locator(".font-display").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThan(32);
});
