import { expect, test } from "@playwright/test";
import { openDay, pickDay } from "./days";

test("a request is confirmed from the list, and Undo puts it back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/test-drives");
  await expect(page.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("aria-current", "page");
  const waiting = page.getByRole("region", { name: /^Still to confirm/ });
  const first = waiting.getByRole("listitem").first();
  const who = (await first.locator("[data-name]").textContent())!.trim();
  // Cancel is not beside Confirm in a row: it is under More.
  await expect(first.getByRole("button", { name: `Cancel test drive: ${who}` })).toHaveCount(0);
  await first.getByRole("button", { name: `More for ${who}` }).click();
  await expect(page.getByRole("button", { name: `Cancel test drive: ${who}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await first.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(`${who}: Confirmed`)).toBeVisible();
  await expect(waiting.getByText(who, { exact: true })).toHaveCount(0);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(waiting.getByText(who, { exact: true })).toBeVisible();
});

test("a request's row has one strong button, Confirm; on its own page Confirm is the filled one and Cancel is in view", async ({ page }) => {
  await page.goto("/test-drives");
  // Every row on Today (today's, the requests, the next few days) has at most one strong (tonal) button. Today's confirmed rows (Call
  // and Mark done) are only there on an open day with one booked, so this covers them when they are.
  const strong = await page.locator("li:has([data-name])").evaluateAll((rows) => rows.map((r) => r.querySelectorAll('[class~="bg-accent-soft"]').length));
  expect(strong.length).toBeGreaterThan(0);
  expect(Math.max(...strong)).toBeLessThanOrEqual(1);
  // A seeded request, the last: the test above confirms (and puts back) the first, and one sent from the site (site-api) is a real-… id.
  const row = page.getByRole("region", { name: /^Still to confirm/ }).getByRole("listitem").filter({ has: page.locator('a[href*="/test-drives/drive-"]') }).last();
  const who = (await row.locator("[data-name]").textContent())!.trim();
  // Whole class names: rowButton has hover:bg-accent-soft, rowButtonStrong has bg-accent-soft itself.
  await expect(row.getByRole("link", { name: `Call ${who}` })).not.toHaveClass(/(^|\s)bg-accent-soft(\s|$)/);
  await expect(row.getByRole("button", { name: `Confirm: ${who}` })).toHaveClass(/(^|\s)bg-accent-soft(\s|$)/);
  await row.locator("[data-name]").click();
  await expect(page).toHaveURL(/\/test-drives\/drive-/);
  const status = page.getByRole("region", { name: "Status" });
  await expect(status.getByRole("button", { name: `Cancel test drive: ${who}` })).toBeVisible();
  // Filled (bg-accent), not tonal (bg-accent-soft).
  await expect(status.getByRole("button", { name: `Confirm: ${who}` })).toHaveClass(/(^|\s)bg-accent(\s|$)/);
});

test("the list filters, Only mine keeps the bookings given to me, and a booking opens on its own page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/test-drives?view=list");
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("radio", { name: "Completed" }).check();
  await expect(page).toHaveURL(/status=completed/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows.nth(1)).toContainText("Completed");
  await page.getByRole("link", { name: "Only mine" }).click();
  await expect(page).toHaveURL(/mine=1/);
  const me = "Aoife Brennan"; // the demo's owner, the role the tests run as
  for (const row of await rows.all().then((r) => r.slice(1))) await expect(row).toContainText(me);
  await rows.nth(1).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/test-drives\/drive-/);
  await expect(page.getByRole("region", { name: "Taking them out" }).getByRole("button", { name: me })).toHaveAttribute("aria-pressed", "true");
});

test("the week shows seven days, and a phone gets a strip of days", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/test-drives?view=week");
  await expect(page.getByRole("heading", { level: 2, name: / to / })).toBeVisible();
  await expect(page.locator("section[aria-label]").filter({ has: page.getByRole("heading", { level: 3 }) })).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Day" }).getByRole("link")).toHaveCount(7);
});

test("a booking is made in steps, and the same car's time is then taken", async ({ page }) => {
  // A different day each run, so a retry against the same server never meets the booking of the first try.
  const day = openDay(Date.now());
  const book = async () => {
    await page.goto("/test-drives/new");
    await page.getByRole("list").getByRole("button").nth(1).click(); // the second car
    await expect(page.getByRole("heading", { name: /Step 2 of 3/ })).toBeFocused();
    await pickDay(page, day);
  };
  await book();
  await page.getByRole("button", { name: "11:00" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Book test drive" }).click();
  await expect(page.getByText("Enter a name")).toBeVisible(); // what is missing, on the step it belongs to
  await page.getByRole("textbox", { name: /^Name/ }).fill("Test booker"); // its name now carries the error too
  await page.getByLabel("Phone").fill("+353 83 000 1234");
  await page.getByRole("button", { name: "Book test drive" }).click();
  await expect(page.getByText("Booked Test booker for")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`view=week&day=${day}`));
  await book();
  await expect(page.getByRole("button", { name: "11:00" })).toBeDisabled(); // that car is out then
  await expect(page.getByRole("button", { name: "12:00" })).toBeEnabled();
});

test("the picker opens on the car's first free time, never on a day with nothing left (#238)", async ({ page }) => {
  await page.goto("/test-drives/new");
  await page.getByRole("main").locator("li > button[aria-pressed]").first().click();
  // A time is chosen already, so Next works at once.
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await expect(page.getByText("No time left that day.")).toHaveCount(0);
});
