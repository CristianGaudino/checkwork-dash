import { expect, test } from "@playwright/test";
import { openDay, pickDay } from "./days";

test("a request is confirmed from the list, and Undo puts it back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/test-drives");
  await expect(page.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("aria-current", "page");
  const waiting = page.getByRole("region", { name: /^Still to confirm/ });
  const first = waiting.getByRole("listitem").first();
  const who = (await first.locator("[data-name]").textContent())!.trim();
  // Cancel is not beside Confirm in a row: it is under the row's menu.
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
  // Every row on Today (today's, the requests, the next few days) has at most one strong (tonal) button, its next step (#95). Call is
  // under the row's menu.
  const strong = await page.locator("li:has([data-name])").evaluateAll((rows) => rows.map((r) => r.querySelectorAll('[class~="bg-accent-soft"]').length));
  expect(strong.length).toBeGreaterThan(0);
  expect(Math.max(...strong)).toBeLessThanOrEqual(1);
  // A seeded request, the last: the test above confirms (and puts back) the first, and one sent from the site (site-api) is a real-… id.
  const row = page.getByRole("region", { name: /^Still to confirm/ }).getByRole("listitem").filter({ has: page.locator('a[href*="/test-drives/drive-"]') }).last();
  const who = (await row.locator("[data-name]").textContent())!.trim();
  // Whole class names: rowButton has hover:bg-accent-soft, rowButtonStrong has bg-accent-soft itself.
  await expect(row.getByRole("link", { name: `Call ${who}` })).toHaveCount(0);
  await row.getByRole("button", { name: `More for ${who}` }).click();
  await expect(row.getByRole("link", { name: `Call ${who}` })).toHaveAttribute("href", /^tel:/);
  await page.keyboard.press("Escape");
  await expect(row.getByRole("button", { name: `Confirm: ${who}` })).toHaveClass(/(^|\s)bg-accent-soft(\s|$)/);
  await row.locator("[data-name]").click();
  await expect(page).toHaveURL(/\/test-drives\/drive-/);
  const status = page.getByRole("region", { name: "Status" });
  // Cancel asks first; the dialog's Cancel changes nothing.
  await status.getByRole("button", { name: `Cancel test drive: ${who}` }).click();
  const ask = page.getByRole("dialog", { name: `Cancel ${who}'s test drive?` });
  await ask.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(ask).toHaveCount(0); // and Confirm is still there below: the status is unchanged
  // Filled (bg-accent), not tonal (bg-accent-soft).
  await expect(status.getByRole("button", { name: `Confirm: ${who}` })).toHaveClass(/(^|\s)bg-accent(\s|$)/);
});

test("the list filters, For me keeps the bookings given to me or nobody yet, and a booking opens on its own page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/test-drives?view=list");
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("radio", { name: "Completed" }).check();
  await expect(page).toHaveURL(/status=completed/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows.nth(1)).toContainText("Completed");
  await page.getByRole("link", { name: "For me" }).click();
  await expect(page).toHaveURL(/mine=1/);
  for (const row of await rows.all().then((r) => r.slice(1))) await expect(row).toContainText(/You|Not taken/);
  await rows.filter({ hasText: "You" }).first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/test-drives\/drive-/);
  // The PersonPicker (#135) names the signed-in person (the demo's owner, the role the tests run as) You.
  await expect(page.getByRole("combobox", { name: "Taking them out" })).toHaveValue("You");
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
  await expect(page.getByText("Enter a name")).toHaveCount(0); // checked again as it is typed, so the fixed error goes
  await page.getByLabel("Phone").fill("+353 83 000 1234");
  await page.getByRole("button", { name: "Book test drive" }).click();
  await expect(page.getByText("Booked Test booker for")).toBeVisible();
  await expect(page).toHaveURL(/\/test-drives\/drive-/); // the booking opens on its own page
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

test("a confirmed drive still to come has no Mark done; a booking that is over is rebooked with its customer filled in", async ({ page }) => {
  await page.goto("/test-drives");
  // The next few days hold confirmed drives that have not started: only the menu, never Mark done or No show.
  const coming = page.getByRole("region", { name: /^Next few days/ }).getByRole("listitem").first();
  const who = (await coming.locator("[data-name]").textContent())!.trim();
  await expect(coming.getByRole("button", { name: `Mark done: ${who}` })).toHaveCount(0);
  await coming.getByRole("button", { name: `More for ${who}` }).click();
  await expect(coming.getByRole("button", { name: `Mark done: ${who}` })).toHaveCount(0);
  await expect(coming.getByRole("button", { name: `Cancel test drive: ${who}` })).toBeVisible();
  await page.keyboard.press("Escape");
  // A completed booking: Rebook on its page opens Book a test drive with them filled in.
  await page.goto("/test-drives?view=list&status=completed");
  await page.getByRole("table").getByRole("row").nth(1).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/test-drives\/drive-/);
  const name = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  await page.getByRole("region", { name: "Status" }).getByRole("link", { name: `Rebook ${name}` }).click();
  await expect(page).toHaveURL(/\/test-drives\/new\?rebook=/);
  await expect(page.locator('input[name="name"]')).toHaveValue(name); // on the last step, hidden until then
});
