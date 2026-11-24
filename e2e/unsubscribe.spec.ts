import { expect, test } from "@playwright/test";
import { unsubscribeLink } from "../src/lib/unsubscribe";

// The public unsubscribe (#70): a link from the sender's helper, opened with no sign-in. The oldest seeded stock alert, so admin-customers
// (which stops the newest) never meets it. The server's UNSUBSCRIBE_SECRET is the run's (playwright.config.ts).
const SUB = { id: "alert-413", email: "orla.murphy@example.com" };
const row = "/customers?tab=alerts&q=orla.murphy";

test("a person opens the alert's link, confirms, and the alert is stopped in the dashboard", async ({ page, baseURL }) => {
  process.env.UNSUBSCRIBE_SECRET = "e2e-unsubscribe-secret";
  const link = await unsubscribeLink("checkwork-motors", "alert", SUB.id, baseURL);

  await page.goto(row);
  await expect(page.getByRole("row").filter({ hasText: SUB.email })).toContainText("Active");

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Stop these stock alerts?" })).toBeVisible();
  await page.goto(row); // opening the link changed nothing
  await expect(page.getByRole("row").filter({ hasText: SUB.email })).toContainText("Active");

  await page.goto(link);
  await page.getByRole("button", { name: "Stop these stock alerts" }).click();
  await expect(page.getByRole("heading", { name: "You won't get these emails again" })).toBeVisible();

  await page.goto(row);
  await expect(page.getByRole("row").filter({ hasText: SUB.email })).toContainText("Stopped");
});

test("a link that is wrong in any way says only that it is not valid", async ({ page, request, baseURL }) => {
  process.env.UNSUBSCRIBE_SECRET = "e2e-unsubscribe-secret";
  const link = await unsubscribeLink("checkwork-motors", "alert", "alert-412", baseURL);
  await page.goto(link.replace(/sig=(.)/, (_m, c) => `sig=${c === "A" ? "B" : "A"}`));
  await expect(page.getByRole("heading", { name: "This link isn't valid any more" })).toBeVisible();
  expect((await request.post(link.replace("alert-412", "alert-411"))).status()).toBe(404);
});

// The Access-only closed server (playwright.config.ts): every page is a 404 there, but the public unsubscribe answers with its own page.
test("needs no Access token: the closed server still answers the link, and still closes the pages", async ({ request }) => {
  const closed = `http://localhost:${Number(process.env.PORT ?? 3000) + 3}`;
  expect(await (await request.get(`${closed}/api/site/unsubscribe`)).text()).toContain("This link isn&#39;t valid any more");
  expect(await (await request.get(`${closed}/leads`)).text()).not.toContain("This link isn&#39;t valid any more");
});
