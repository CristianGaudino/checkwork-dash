import { expect, test } from "@playwright/test";

// The owner API (#174) and the monthly report (#175). OWNER_API_TOKEN is set for this run in playwright.config.ts.
const auth = { authorization: "Bearer e2e-owner-token" };

test("the owner API answers 404 without the token, or with a wrong one, and counts with it, for the dealer named", async ({ request }) => {
  for (const path of ["summary", "usage", "dealers"]) {
    expect((await request.get(`/api/owner/v1/${path}?dealer=checkwork-motors`)).status()).toBe(404);
    expect((await request.get(`/api/owner/v1/${path}?dealer=checkwork-motors`, { headers: { authorization: "Bearer wrong" } })).status()).toBe(404);
  }
  expect((await (await request.get("/api/owner/v1/dealers", { headers: auth })).json()).dealers.map((d: { id: string }) => d.id)).toEqual(["checkwork-motors", "test-motors"]);
  expect((await request.get("/api/owner/v1/summary?from=2026-01-01&to=2026-01-31", { headers: auth })).status()).toBe(400); // no dealer
  expect((await request.get("/api/owner/v1/summary?dealer=nobody-motors", { headers: auth })).status()).toBe(404);
  const res = await request.get("/api/owner/v1/summary?dealer=checkwork-motors&from=2026-01-01&to=2026-01-31", { headers: auth });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ version: 1, range: { from: "2026-01-01", to: "2026-01-31" } });
  for (const key of ["leads", "replies", "stock", "sales", "reviews", "features", "dashboard", "plan", "listingSync", "usage", "appVersion"]) expect(body).toHaveProperty(key);
  expect(body.sales).not.toHaveProperty("valueEur"); // money is off without its own secret
  expect((await request.get("/api/owner/v1/summary?dealer=checkwork-motors&from=nope", { headers: auth })).status()).toBe(400);
  expect(body).not.toHaveProperty("modules"); // one system (#212): no modules, one plan
  expect(body.plan).toEqual({ label: "Checkwork plan", eur: 249 });
  expect((await request.get("/api/owner/v1/modules?dealer=checkwork-motors", { headers: auth })).status()).toBe(404); // the route is gone
  expect((await (await request.get("/api/owner/v1/usage?dealer=checkwork-motors&from=2026-01-01&to=2026-01-31", { headers: auth })).json()).months).toHaveLength(1);
});

test("the monthly report shows a section for each part of the dashboard", async ({ page }) => {
  await page.goto("/monthly-report");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Monthly report");
  for (const h of ["Leads", "Visitors", "Stock", "Sales", "Reviews"]) await expect(page.getByRole("heading", { level: 2, name: h, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Download/ })).toHaveCount(0);
});
