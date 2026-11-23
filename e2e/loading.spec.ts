import { expect, test, type Page } from "@playwright/test";
import { as } from "./open";

// Loading (#109). The slow part of a page streams in under a <Suspense> inside it, never a route loading.tsx: a page that streams from the
// top answers 200 even when it ends in notFound(), and a tap on a link inside a part still streaming started no navigation. So: unknown
// records stay 404s, and the header and the tabs come in the first chunk, where a tap at once always goes.

test("an unknown record answers 404, and sign-in answers as before", async ({ request }) => {
  for (const path of ["/leads/no-such-lead", "/stock/no-such-car", "/test-drives/no-such-booking", "/customers/no-such-customer", "/orders/no-such-order", "/aftersales/no-such-claim", "/billing/1999-01"]) {
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
];

for (const [path, link, to] of TAPS) {
  test(`${path}: a tap on a tab at once, on a fresh load, goes`, async ({ page, context }) => {
    await as(context, "Owner"); // every streamed part shows, the website tiles on the Overview included
    await page.goto(path, { waitUntil: "commit" });
    await link(page).click();
    await expect(page).toHaveURL(to);
  });
}
