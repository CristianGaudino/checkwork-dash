import { expect, test, type Page } from "@playwright/test";
import { as } from "./open";

// Loading (#109). The slow part of a page streams in under a <Suspense> inside it, never a route loading.tsx: a page that streams from the
// top answers 200 even when it ends in notFound(), and a tap on a link inside a part still streaming started no navigation. So: unknown
// records stay 404s, and the header comes in the first chunk with the tabs, where a tap at once always goes. Marketing, activity and
// customers stream their tabs with the list (their counts are the records), and a tap on those goes as soon as they are there.

test("an unknown record answers 404, and sign-in answers as before", async ({ request }) => {
  for (const path of ["/leads/no-such-lead", "/stock/no-such-car", "/test-drives/no-such-booking", "/customers/no-such-customer", "/aftersales/no-such-claim", "/billing/1999-01"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  }
  // The open server has no sign-in page (e2e/sign-in.spec.ts).
  expect((await request.get("/sign-in", { maxRedirects: 0 })).status()).toBe(404);
});

// Each page that streams, and a tab or view link in its first chunk. The page is opened fresh (a new context per test) and the link tapped
// as soon as it is there: no waiting for the load event or the network to go quiet.
const TAPS: [path: string, link: (page: Page) => ReturnType<Page["getByRole"]>, to: RegExp][] = [
  ["/", (page) => page.getByRole("link", { name: /Reply to leads/ }), /\/leads/],
  ["/analytics", (page) => page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "7 days" }), /range=7$/],
  ["/reports", (page) => page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "6 months" }), /period=6$/],
  ["/monthly-report", (page) => page.getByRole("link", { name: "Previous month" }), /month=\d{4}-\d{2}$/],
  ["/stock", (page) => page.getByRole("navigation", { name: "Stock views" }).getByRole("link", { name: /^Sold/ }), /view=sold/],
  ["/leads", (page) => page.getByRole("navigation", { name: "Lead status" }).getByRole("link", { name: /^Won/ }), /status=won/],
  // These stream their tabs too (#200): their counts are the records.
  ["/marketing", (page) => page.getByRole("navigation", { name: "Marketing" }).getByRole("link", { name: /^Calendar/ }), /tab=calendar$/],
  ["/activity", (page) => page.getByRole("navigation", { name: "When" }).getByRole("link", { name: "7 days" }), /period=7d$/],
  ["/customers", (page) => page.getByRole("navigation", { name: "Customer lists" }).getByRole("link", { name: /^Stock alerts/ }), /tab=alerts$/],
];

for (const [path, link, to] of TAPS) {
  test(`${path}: a tap on a tab at once, on a fresh load, goes`, async ({ page, context }) => {
    await as(context, "Owner"); // every streamed part shows, the website tiles on the Overview included
    await page.goto(path, { waitUntil: "commit" });
    await link(page).click();
    await expect(page).toHaveURL(to);
  });
}

// The bones are the shape of what replaces them (#200): at 1280px a new period on /reports moves nothing when its figures land, and the
// Sales by month bone is the panel's own box (it was full width over a two-column row). Every shift is summed, those just after the tap too.
test("a new period on /reports lands without moving the page", async ({ page, context }) => {
  await as(context, "Owner");
  await page.setViewportSize({ width: 1280, height: 900 });
  type Seen = { shift: number; bone?: { width: number; height: number } };
  await page.addInitScript(() => {
    const w = window as unknown as Seen;
    w.shift = 0;
    new PerformanceObserver((list) => list.getEntries().forEach((e) => (w.shift += (e as PerformanceEntry & { value: number }).value))).observe({ type: "layout-shift" });
    new MutationObserver(() => {
      const bone = [...document.querySelectorAll("[data-skeleton] section")].find((s) => s.querySelector("h2")?.textContent === "Sales by month");
      if (bone) w.bone = bone.getBoundingClientRect().toJSON();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/reports");
  await page.waitForLoadState("load");
  await page.evaluate(() => ((window as unknown as Seen).shift = 0));
  await page.getByRole("navigation", { name: "Period" }).getByRole("link", { name: "6 months" }).click();
  await expect(page).toHaveURL(/period=6$/);
  await expect(page.locator("[data-skeleton]")).toHaveCount(0);
  const panel = page.getByRole("region", { name: "Sales by month" });
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  const seen = await page.evaluate(() => new Promise<Seen>((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const { shift, bone } = window as unknown as Seen;
    done({ shift, bone });
  }))));
  expect(seen.shift).toBeLessThan(0.05);
  expect(seen.bone, "the bones showed").toBeDefined();
  expect(Math.abs(seen.bone!.width - box.width)).toBeLessThan(2);
  expect(Math.abs(seen.bone!.height - box.height)).toBeLessThan(2);
});
