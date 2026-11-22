import { expect, test, type APIRequestContext } from "@playwright/test";

// A lead sent with its visit note (#34, docs/site-api.md): This visit on the lead, folded on a phone and open on a desk, and Prepare me
// writing the AI brief (the demo's writer). The demo dealer's key: DEMO_SITE_KEY in src/lib/tenancy/directory.ts, never on a deploy.
const auth = { Authorization: "Bearer cw_site_demo-key-for-next-dev-and-e2e-not-a-secret0" };
type StockCar = { id: string; slug: string; year: number; make: string; makeSlug: string; model: string; priceEur: number; bodySlug?: string; soldAt?: string; reserved?: boolean };

async function sendWithVisit(request: APIRequestContext, journey: boolean) {
  const { cars } = (await (await request.get("/api/site/v1/stock", { headers: auth })).json()) as { cars: StockCar[] };
  const forSale = cars.filter((c) => !c.soldAt && !c.reserved);
  const car = forSale[0]!;
  const others = forSale.filter((c) => c.id !== car.id && c.bodySlug === car.bodySlug).slice(0, 2);
  const name = `Visit lead ${Date.now() % 1_000_000}`;
  const lead = {
    id: crypto.randomUUID(), clientRef: crypto.randomUUID(), type: "enquiry", carId: car.id, carSlug: car.slug, carTitle: `${car.year} ${car.make} ${car.model}`, carPriceEur: car.priceEur,
    sourcePath: `/cars/${car.slug}`, name, phone: "087 123 4567", email: null, message: "Is it still there?", details: { channel: "Google" }, consentAt: Date.now(), consentVersion: "2026-11-10", createdAt: Date.now(),
  };
  const visit = {
    v: 1, minutes: 14,
    cars: [{ id: car.id, views: 3 }, ...others.map((c) => ({ id: c.id, views: 1 })), { id: "999999999", views: 1 }],
    searches: [{ make: car.makeSlug, ...(car.bodySlug && { body: car.bodySlug }), gearbox: "automatic" }],
    tools: { finance: { monthlyEur: 320 }, tradeIn: true, saved: 2 },
  };
  const res = await request.post("/api/site/v1/leads", { headers: auth, data: { lead, emailed: true, photoCount: 0, ...(journey && { journey: visit }) } });
  expect(res.status()).toBe(201);
  return { id: `real-${(await res.json()).id}`, car, opened: visit.cars.length };
}

test("a lead sent with its visit shows This visit, folded on a phone, and it fits at 390px", async ({ page, request }) => {
  const { id, car, opened } = await sendWithVisit(request, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/leads/${id}`);
  const fold = page.getByRole("region", { name: "This visit" });
  await expect(fold).toContainText(`14 minutes · ${opened} cars · from Google`);
  await expect(fold.getByText("Cars they opened")).toBeHidden();
  const toggle = fold.getByRole("button", { name: "This visit" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const cars = fold.getByRole("region", { name: "Cars they opened" });
  await expect(cars.getByRole("listitem").first()).toContainText(`${car.year} ${car.make} ${car.model}`);
  await expect(cars.getByRole("listitem").first()).toContainText("Asked about");
  await expect(cars.getByRole("listitem").first()).toContainText("Opened 3 times");
  await expect(cars).toContainText("A car no longer in stock");
  await expect(fold.getByRole("region", { name: "Searches" })).toContainText(car.make);
  await expect(fold.getByRole("region", { name: "Also used" })).toContainText("Tried the finance calculator: €320 a month");
  await expect(fold.getByRole("region", { name: "Also used" })).toContainText("Started a trade-in");
  await expect(fold.getByRole("region", { name: "Also used" })).toContainText("Saved 2 cars");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const box = await fold.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test("Prepare me writes a brief on the demo, open on a desk", async ({ page, request }) => {
  const { id, car } = await sendWithVisit(request, true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/leads/${id}`);
  const fold = page.getByRole("region", { name: "This visit" });
  await expect(fold.getByText("Cars they opened")).toBeVisible(); // open without a tap
  await expect(fold.getByRole("button", { name: "This visit" })).toBeHidden(); // and nothing to fold it with
  await fold.getByRole("button", { name: "Prepare me" }).click();
  const brief = fold.getByLabel("Brief");
  await expect(brief).toContainText(`asked about the ${car.year} ${car.make} ${car.model}`);
  await expect(brief).toContainText("Have ready:");
  await expect(brief).toContainText('Open with: "');
  await expect(fold.getByText("AI brief")).toBeVisible();
  await expect(fold.getByRole("button", { name: "Prepare again" })).toBeVisible();
});

test("a lead sent without its visit shows no visit panel", async ({ page, request }) => {
  const { id } = await sendWithVisit(request, false);
  await page.goto(`/leads/${id}`);
  await expect(page.getByRole("heading", { name: "What they asked" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This visit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Prepare me" })).toHaveCount(0);
});
