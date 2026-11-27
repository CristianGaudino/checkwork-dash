import { expect, test, type Page } from "@playwright/test";

// One headline, then rows (#213, docs/dashboard-polish.md rule 12). A group of figures is one panel: the headline first and large, the
// other figures as rows with no card of their own. Summary tabs are one segmented bar whose every tab can be reached. The page's jobs sit in
// its header. None of it scrolls the page sideways, at any width or with large text.
// [page, the headline's label]
const HEADLINES = [
  ["/", "New leads"],
  ["/analytics", "Leads"],
  ["/margins", "Expected margin on stock"],
  ["/reports", "Profit"],
  ["/monthly-report", "Leads"],
] as const;

const overflow = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });

// CDP sets the browser's own font size, as Chrome's setting does (as e2e/large-text.spec.ts).
async function textAt(page: Page, scale: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: Math.round(16 * scale), fixed: Math.round(13 * scale) } });
}

// The panel around a headline: its figure's size against the rows' values, whether it comes before them, and how many cards are inside it.
const shape = (page: Page, label: string) =>
  page
    .getByRole("main")
    .locator("[data-lead]")
    .filter({ hasText: label })
    .first()
    .evaluate((lead) => {
      const panel = lead.closest("section")!;
      const rows = [...panel.querySelectorAll("[data-figure]")];
      const size = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
      return {
        rows: rows.length,
        first: rows.every((r) => lead.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING),
        lead: size(lead.querySelector(".font-display")),
        row: Math.max(...rows.map((r) => size(r.querySelector("[title], .text-heading")))),
        cardsInside: [...panel.querySelectorAll("*")].filter((el) => getComputedStyle(el).boxShadow !== "none").length,
      };
    });

for (const width of [360, 700, 900, 1280]) {
  test(`each page's headline comes first and large, its other figures as rows, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, label] of HEADLINES) {
      await page.goto(path);
      await expect(page.getByRole("main").locator("[data-lead]").filter({ hasText: label }).first()).toBeVisible();
      // The Overview's website figures arrive after the first paint: measure once they are in.
      await expect(async () => {
        const m = await shape(page, label);
        expect(m.rows, `${path}: rows beside the headline`).toBeGreaterThan(0);
        expect(m.first, `${path}: the headline comes first`).toBe(true);
        expect(m.lead, `${path}: the headline is the large figure`).toBeGreaterThan(m.row * 1.5);
        expect(m.cardsInside, `${path}: no card for each figure`).toBe(0);
      }).toPass();
      expect(await overflow(page), `${path} @${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("the figures stay on screen with large text", async ({ page }) => {
  for (const [width, scale] of [[360, 1.5], [1280, 2]] as const) {
    await textAt(page, scale);
    await page.setViewportSize({ width, height: 900 });
    for (const [path] of HEADLINES) {
      await page.goto(path);
      expect(await overflow(page), `${path} @${width}px, text ${scale * 100}%`).toBeLessThanOrEqual(0);
    }
  }
});

// The Overview's website figures stream in after the first paint. With scripts off their bones stay, as on a slow connection: rows in the
// rows' place, said once as "Loading", and the headline still first.
test.describe("while the Overview's website figures load", () => {
  test.use({ javaScriptEnabled: false });
  test("the bones are rows under the headline", async ({ page }) => {
    await page.goto("/");
    const week = page.getByRole("region", { name: "This week" });
    await expect(week.locator("[data-lead]")).toContainText("New leads");
    const bones = week.locator("[data-skeleton]");
    if ((await bones.count()) > 0) await expect(bones).toHaveText("Loading");
    // No animation frames without scripts: measured at once.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

// The segmented bar: on a phone it scrolls, and every tab can be scrolled to; on a laptop (a mouse does not scroll a row sideways) every tab
// is in view at once.
const BARS = [["/leads", "Lead status"], ["/stock", "Stock views"]] as const;
test("every tab of a segmented bar can be reached on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const [path, name] of BARS) {
    await page.goto(path);
    const bar = page.getByRole("navigation", { name });
    for (const tab of await bar.getByRole("link").all()) {
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeInViewport({ ratio: 0.9 });
    }
    expect(await overflow(page), path).toBeLessThanOrEqual(0);
  }
});

for (const width of [1024, 1263]) {
  test(`every tab on Leads and Stock is in view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, name] of BARS) {
      await page.goto(path);
      const bar = page.getByRole("navigation", { name });
      await expect(bar.getByRole("link").first()).toBeVisible();
      const out = await bar.evaluate((nav) => {
        const n = nav.getBoundingClientRect();
        return [...nav.querySelectorAll("a")].filter((a) => a.getBoundingClientRect().left < n.left - 1 || a.getBoundingClientRect().right > n.right + 1).map((a) => a.textContent);
      });
      expect(out, `${path} @${width}px: tabs out of view`).toEqual([]);
    }
  });
}

test("a segmented bar filters, and the tab acted on first is marked by its count, not its size", async ({ page }) => {
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
  // The lead is no wider than the widest of the others.
  const widths = await tabs.getByRole("link").evaluateAll((as) => as.map((a) => [a.hasAttribute("data-lead"), a.getBoundingClientRect().width] as const));
  const lead = widths.find(([l]) => l)![1];
  expect(lead).toBeLessThanOrEqual(Math.max(...widths.filter(([l]) => !l).map(([, w]) => w)) + 1);
});

// The page's jobs, and a person's ways to reach them, are in the page's header, not in a box beside a column.
const HEADER_ACTIONS = [
  ["/", ["Add a car", "Book a test drive", "New post"]],
  ["/leads/lead-4000", ["Call", "Email", "WhatsApp"]],
  ["/customers/cust-300", ["Call", "Email", "WhatsApp"]],
  ["/test-drives/drive-232", ["Call", "Email", "WhatsApp"]],
  ["/help", ["Call", "Email", "WhatsApp"]],
  ["/billing", ["Ask about my bill"]],
] as const;
for (const width of [360, 1280]) {
  test(`each page's jobs are in its header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, names] of HEADER_ACTIONS) {
      await page.goto(path);
      const header = page.getByRole("main").locator("header").first();
      for (const name of names) await expect(header.getByRole("link", { name: new RegExp(`^${name}`) }).first(), `${path}: ${name}`).toBeVisible();
      expect(await overflow(page), `${path} @${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

// A lead reads as one balanced page from 1280px: what they asked and the next step side by side and level at the top, their visit straight
// under what they asked (no gap left by the taller next step), the notes under the next step. On a phone one column, in that reading order.
test("a lead's page is two balanced columns on a laptop, one in reading order on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/leads/lead-4000");
  const box = async (name: string) => (await page.getByRole("region", { name, exact: true }).boundingBox())!;
  const [asked, next, visit, notes] = [await box("What they asked"), await box("Next step"), await box("This visit"), await box("Notes")];
  expect(Math.abs(asked.y - next.y), "level at the top").toBeLessThanOrEqual(1);
  expect(next.x, "the next step on the right").toBeGreaterThan(asked.x + asked.width);
  expect(visit.y - (asked.y + asked.height), "the visit straight under what they asked").toBeLessThanOrEqual(25);
  expect(Math.abs(notes.x - next.x), "the notes under the next step").toBeLessThanOrEqual(1);
  expect(notes.y).toBeGreaterThan(next.y + next.height);

  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  const order = [await box("What they asked"), await box("Next step"), await box("Notes"), await box("This visit")].map((b) => b.y);
  expect(order, "what they asked, the next step, the notes, the visit").toEqual([...order].sort((a, b) => a - b));
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
