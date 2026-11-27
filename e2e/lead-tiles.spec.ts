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
    // A wrapper with display: contents (a loading fallback) lays its children out as the row's own: measure those.
    const flat = (cs: Element[]): Element[] => cs.flatMap((c) => (getComputedStyle(c).display === "contents" ? flat([...c.children]) : [c]));
    const tiles = flat([...row.children]).filter((c) => c.getBoundingClientRect().width > 0);
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

// 700 and 900: a tab row between 640px and the sidebar, and the Overview's Numbers full width under the To do list (wider than 48rem).
const WIDTHS = [360, 700, 900, 1280];
for (const width of WIDTHS) {
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

// The Overview's website tiles stream in after the first paint. With scripts off the loading tiles stay, as on a slow connection: they
// take the places of the tiles they stand for, with no gap and none stacked under another. If the tiles were ready before the first HTML
// went out there are no bones, and the loaded row is held to the same rules.
test.describe("while the Overview's website tiles load", () => {
  test.use({ javaScriptEnabled: false });
  for (const width of WIDTHS) {
    test(`the loading tiles leave no gap at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const lead = page.getByRole("main").locator("[data-lead]").filter({ hasText: "Leads this week" });
      const bones = page.getByRole("main").locator("[data-skeleton]");
      if ((await bones.count()) > 0) await expect(bones).toHaveText("Loading"); // one region, said once
      const m = await measure(lead);
      expect(m.index).toBe(0);
      expect(m.lead, "wider than the others").toBeGreaterThan(Math.max(...m.paired) + 1);
      expect(m.lead, "none wider").toBeGreaterThanOrEqual(m.widest - 1);
      expect(m.gaps, "rows with a gap").toBe(0);
    });
  }
});

// On a laptop the tab rows shrink their tabs to fit before they scroll: at 1024px, and at 1263px (a 1280px window less a 17px scrollbar),
// every tab on Leads and Stock is wholly in view.
for (const width of [1024, 1263]) {
  test(`every tab on Leads and Stock is in view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, name] of [["/leads", "Lead status"], ["/stock", "Stock views"]]) {
      await page.goto(path);
      const row = page.getByRole("navigation", { name });
      await expect(row.getByRole("link").first()).toBeVisible();
      const out = await row.evaluate((nav) => {
        // Inside the row's padding, where its edge fades when it scrolls.
        const [n, css] = [nav.getBoundingClientRect(), getComputedStyle(nav)];
        const [left, right] = [n.left + parseFloat(css.paddingLeft), n.right - parseFloat(css.paddingRight)];
        return [...nav.querySelectorAll("a")].filter((a) => a.getBoundingClientRect().left < left - 1 || a.getBoundingClientRect().right > right + 1).map((a) => a.textContent);
      });
      expect(out, `${path} @${width}px: tabs out of view`).toEqual([]);
    }
  });
}

// A full row: Closed shows as a seventh tab once it is open (as it does for a dealer with a closed lead). The lead stays the widest tab
// when the row is crowded, and at 1263px every count on the row sits level (a label that wrapped pushed its count a line down).
for (const width of [1024, 1263]) {
  test(`on a full Leads row the lead stays the widest tab, and the counts level, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/leads", "/leads?status=closed"]) {
      await page.goto(path);
      const row = page.getByRole("navigation", { name: "Lead status" });
      await expect(row.getByRole("link").first()).toBeVisible();
      const m = await row.evaluate((nav) => {
        const tabs = [...nav.querySelectorAll("a")];
        const lead = tabs.find((a) => a.hasAttribute("data-lead"))!;
        return {
          tabs: tabs.length,
          lead: lead.getBoundingClientRect().width,
          widest: Math.max(...tabs.filter((a) => a !== lead).map((a) => a.getBoundingClientRect().width)),
          counts: tabs.map((a) => a.querySelector(":scope > span.tabular-nums")!.getBoundingClientRect().top),
        };
      });
      if (path.includes("closed")) expect(m.tabs, "Closed shows").toBeGreaterThanOrEqual(7); // and Spam, when another spec has marked one
      expect(m.lead, `${path} @${width}px: the lead is the widest`).toBeGreaterThanOrEqual(m.widest - 1);
      if (width === 1263) expect(Math.max(...m.counts) - Math.min(...m.counts), `${path}: counts level`).toBeLessThanOrEqual(1);
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
