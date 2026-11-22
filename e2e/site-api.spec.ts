import { expect, test, type APIRequestContext } from "@playwright/test";
import { driveTimes } from "../src/lib/leads/constants";
import { DEMO_PROFILE } from "../src/lib/tenancy/profile";
import { openDay } from "./days";

// The site API (docs/site-api.md) as a dealer's website calls it, with the demo dealer's key, which only the in-memory directory of this
// run has. What the website's forms used to show in the dashboard (checkwork-demo's leads.spec and contact-guided.spec) is checked here
// as the lead the website sends.
// DEMO_SITE_KEY in src/lib/tenancy/directory.ts: the in-memory directory's only key, never on a deploy.
const DEMO_SITE_KEY = "cw_site_demo-key-for-next-dev-and-e2e-not-a-secret0";
const auth = (key = DEMO_SITE_KEY) => ({ Authorization: `Bearer ${key}` });
const who = (what: string) => `${what} ${Date.now() % 1_000_000}`;
const lead = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  clientRef: crypto.randomUUID(),
  type: "general",
  carId: null,
  carSlug: null,
  carTitle: null,
  carPriceEur: null,
  sourcePath: "/contact",
  name: "Nobody",
  phone: "087 123 4567",
  email: null,
  message: null,
  details: {},
  consentAt: Date.now(),
  consentVersion: "2026-11-10",
  createdAt: Date.now(),
  ...over,
});
const send = (request: APIRequestContext, l: object, key?: string) => request.post("/api/site/v1/leads", { headers: auth(key), data: { lead: l, emailed: true, photoCount: 0 } });

test("a lead sent with the website's key reaches the inbox once, and a wrong key is turned away", async ({ page, request }) => {
  const name = who("Site lead");
  const l = lead({ name, message: "Is the blue Golf still there?", details: { channel: "Facebook" } });
  const first = await send(request, l);
  expect(first.status()).toBe(201);
  const again = await send(request, l);
  expect(again.status()).toBe(200);
  expect((await again.json()).id).toBe((await first.json()).id);
  expect((await send(request, lead({ name: who("Nobody") }), "cw_site_wrong")).status()).toBe(401);
  expect((await request.post("/api/site/v1/leads", { data: { lead: l, emailed: true, photoCount: 0 } })).status()).toBe(401);
  await page.goto(`/leads?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("Website, from Facebook");
});

// #59: the message is only what they wrote. The form's taps are tags, the channel is the source, and the other answers a list: never
// "About: Buying a car. Hoping to buy: This month." run into their words.
test("a guided form's lead shows their words as the message and the answers as a list, never run together", async ({ page, request }) => {
  const name = who("Guided buyer");
  const words = "Something small and cheap to insure for my daughter.";
  const sent = lead({ name, message: words, details: { topic: "buying", timing: "this-month", contactVia: "call", contactWhen: "evening", channel: "Google" } });
  expect((await send(request, sent)).status()).toBe(201);
  const runOn = /Hoping to buy|Came from|About:|Reach by:|Best time:/;

  await page.goto(`/leads?q=${encodeURIComponent(name)}`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(words);
  await expect(row).toContainText("This month"); // the tap answer, as a tag
  await expect(row).not.toContainText(runOn);

  await row.getByRole("link", { name, exact: true }).click();
  await expect(page.locator("blockquote")).toHaveText(words);
  const answers = page.getByRole("definition").filter({ hasText: "Evening" });
  await expect(answers).toBeVisible();
  await expect(page.getByLabel("Their answers")).toContainText("Best time");
  await expect(page.getByLabel("Their answers")).toContainText("Call me");
  await expect(page.getByText("Website, from Google").first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText(runOn);
});

test("the spam check: clear spam goes to the Spam tab only; a possible one is flagged, and Not spam clears it (#56)", async ({ page, request }) => {
  const spam = who("Spam check");
  expect((await send(request, lead({ name: spam, message: "Cheap backlinks [url=https://linkfarm.example.top]here[/url]" }))).status()).toBe(201);
  await page.goto(`/leads?q=${encodeURIComponent(spam)}`);
  await expect(page.getByText("No leads match")).toBeVisible();
  await page.goto(`/leads?status=spam&q=${encodeURIComponent(spam)}`);
  await expect(page.getByRole("row").filter({ hasText: spam })).toHaveCount(1);
  // The All tab counts what its list shows: no spam.
  await page.goto("/leads");
  const allTab = await page.getByRole("navigation", { name: "Lead status" }).getByRole("link").first().locator("span").nth(1).textContent();
  const listed = (await page.getByText(/^Showing 1 to /).textContent())!.match(/of ([\d,]+)$/)![1];
  expect(allTab).toBe(listed);

  const maybe = who("Maybe spam");
  expect((await send(request, lead({ name: maybe, message: "Photos of my car: https://myphotos.example.org/x1y2z3" }))).status()).toBe(201);
  await page.goto(`/leads?q=${encodeURIComponent(maybe)}`);
  const row = page.getByRole("row").filter({ hasText: maybe });
  await expect(row).toContainText("Possible spam");
  await row.getByRole("link").first().click();
  await page.getByRole("button", { name: /^Not spam/ }).click();
  await expect(page.getByText("Possible spam")).toHaveCount(0);
  await page.goto(`/leads?q=${encodeURIComponent(maybe)}`);
  await expect(page.getByRole("row").filter({ hasText: maybe })).not.toContainText("Possible spam");
});

test("the website reads its cars: on the site only, public fields only", async ({ request }) => {
  const res = await request.get("/api/site/v1/stock", { headers: auth() });
  expect(res.status()).toBe(200);
  const { cars } = (await res.json()) as { cars: Record<string, unknown>[] };
  expect(cars.length).toBeGreaterThan(10);
  expect(cars.some((c) => "listing" in c || "takenDownAt" in c)).toBe(false);
  expect((await request.get("/api/site/v1/stock")).status()).toBe(401);
});

test("the demo's photos stay the paths its website has its own copies of", async ({ request }) => {
  const { cars } = (await (await request.get("/api/site/v1/stock", { headers: auth() })).json()) as { cars: { photos: { src: string }[] }[] };
  const srcs = cars.flatMap((c) => c.photos.map((p) => p.src)).filter((s) => !s.startsWith("data:"));
  expect(srcs.length).toBeGreaterThan(0);
  expect(srcs.every((s) => /^\/stock\/[^/]+\/[^/]+$/.test(s))).toBe(true);
});

test("a test drive booking, a price alert and a claim on a car bought here each land where the dealer works them", async ({ page, request }) => {
  const { cars } = (await (await request.get("/api/site/v1/stock", { headers: auth() })).json()) as { cars: { id: string; slug: string; year: number; make: string; model: string; priceEur: number; soldAt?: string; reserved?: boolean }[] };
  const car = cars.find((c) => !c.soldAt && !c.reserved)!;
  const snap = { carId: car.id, carSlug: car.slug, carTitle: `${car.year} ${car.make} ${car.model}`, carPriceEur: car.priceEur };
  const day = openDay(Date.now());

  const booker = who("Drive booker");
  expect((await send(request, lead({ type: "test_drive", ...snap, name: booker, sourcePath: `/cars/${car.slug}`, details: { driveDate: day, driveTime: driveTimes(day, DEMO_PROFILE.hours)[0] } }))).status()).toBe(201);
  const email = `alert.${Date.now() % 1_000_000}@example.com`;
  expect((await send(request, lead({ type: "alert", ...snap, name: "Stock alert", phone: null, email, sourcePath: `/cars/${car.slug}`, details: { alertKind: "price-drop" } }))).status()).toBe(201);
  const claimer = who("Claim");
  expect((await send(request, lead({ name: claimer, sourcePath: "/contact", details: { topic: "bought", reg: "191-KY-1234", boughtWhen: "month", concern: "fault", urgency: "cant-drive" } }))).status()).toBe(201);

  await page.goto(`/test-drives?view=list&status=requested&q=${encodeURIComponent(booker)}`);
  await expect(page.getByText(booker).first()).toBeVisible();
  await page.goto("/customers?tab=alerts");
  await expect(page.getByText(email).first()).toBeVisible();
  await page.goto("/aftersales");
  await expect(page.getByRole("table")).toContainText(claimer);
});

test("Settings makes a website key, shows it once, and revokes it", async ({ page }) => {
  const name = who("Site");
  await page.goto("/settings?section=services");
  await page.getByText("For your web developer").click();
  const panel = page.getByRole("region", { name: "Website connection" });
  // No SITE_PHOTO_SECRET in this run (playwright.config.ts): the panel says so, in the dealer's words.
  await expect(panel).toContainText("Photos added here can't show on your website yet.");
  await expect(panel.getByRole("link", { name: "Ask us to connect it" })).toBeVisible();
  await panel.getByRole("textbox", { name: "Name" }).fill(name);
  await panel.getByRole("button", { name: "Make a key" }).click();
  const shown = panel.getByRole("textbox", { name: "New website key" });
  await expect(shown).toHaveValue(/^cw_site_[A-Za-z0-9_-]{43}$/);
  const row = panel.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Not yet");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "New website key" })).toHaveCount(0); // shown once
  await page.getByText("For your web developer").click(); // folded again after the reload
  await row.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(row).toContainText("Revoked");
});
