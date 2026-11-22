import { expect, test } from "@playwright/test";

// The inbox shows made-up leads only (never the real lead table), filters through the URL, and a lead can be worked.
test("filters by status and search, and keeps the filter in the link", async ({ page }) => {
  await page.goto("/leads");
  // How many the list holds, from its footer (a page shows 25 at most).
  const total = async () => Number((await page.getByText(/^Showing 1 to /).textContent())!.match(/of ([\d,]+)$/)![1].replace(/,/g, ""));
  const all = await total();
  expect(all).toBeGreaterThan(10);
  await page.getByRole("link", { name: /^Won/ }).click();
  await expect(page).toHaveURL(/status=won/);
  await expect.poll(total).toBeLessThan(all);
  await page.getByLabel("Search leads").fill("zzzz-nobody");
  await page.getByLabel("Search leads").press("Enter");
  await expect(page.getByText("No leads match")).toBeVisible();
  await expect(page).toHaveURL(/status=won/);
});

test("open a lead, change who has it and its status, add a note", async ({ page }) => {
  await page.goto("/leads?status=new");
  await page.getByRole("row").nth(1).getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Mark contacted" }).click();
  await expect(page.getByRole("button", { name: "Mark contacted" })).toHaveAttribute("aria-pressed", "true");
  const person = page.getByRole("region", { name: "Who has it" }).getByRole("button").nth(1);
  await person.click();
  await expect(person).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Add a note").fill("Called, will visit on Saturday.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Called, will visit on Saturday.")).toBeVisible();
});

test("an unknown lead is a 404, and bad filters are ignored", async ({ page }) => {
  expect((await page.goto("/leads/not-a-lead"))!.status()).toBe(404);
  await page.goto("/leads?status=hacked&type=nope");
  expect((await page.getByRole("row").count()) - 1).toBeGreaterThan(10);
});

test("the list opens with what to answer now, and a lead moves on a step from its row, with Undo", async ({ page, context }) => {
  // A 1280 laptop less a 17px Windows scrollbar. On a phone the row keeps one button (Call); the step is on the lead.
  await page.setViewportSize({ width: 1263, height: 900 });
  await page.goto("/leads");
  // The table fits: the flexible columns give way, never the row's buttons.
  expect(await page.locator("table").evaluate((t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth)).toBeLessThanOrEqual(0);
  const todo = page.getByRole("region", { name: /^To answer now/ });
  const first = todo.getByRole("listitem").first();
  await expect(first.getByRole("link", { name: /^(Call|Email|WhatsApp)/ })).toBeVisible();
  const href = (await first.locator('a[href^="/leads/lead-"]').first().getAttribute("href"))!;
  const mark = first.getByRole("button", { name: /^Mark / });
  const to = (await mark.textContent())!.trim().replace(/^Mark /, "");
  // The lead's own page, in a second tab: "Where it stands" is what the store holds.
  const lead = await context.newPage();
  const status = () => lead.getByRole("group", { name: "Status" }).getByText(/^Where it stands/);
  await lead.goto(href);
  const before = (await status().textContent())!.trim();
  await mark.click();
  await expect(page.getByTestId("toast")).toContainText(new RegExp(to, "i"));
  await lead.reload();
  await expect(status()).toHaveText(new RegExp(`Where it stands\\s*${to}$`, "i"));
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await lead.reload(), (await status().textContent())?.trim())).toBe(before);
});

test("a lead marked spam from To answer now leaves the panel and the Overview count, and Undo brings it back (#56)", async ({ page, context }) => {
  await page.setViewportSize({ width: 1263, height: 900 });
  await page.goto("/leads");
  const todo = page.getByRole("region", { name: /^To answer now/ });
  // The last row shown, as the other tests work the first.
  const href = (await todo.getByRole("listitem").last().locator('a[href^="/leads/lead-"]').first().getAttribute("href"))!;
  const row = todo.getByRole("listitem").filter({ has: page.locator(`a[href="${href}"]`) });
  // The Overview's count of leads to answer (its Reply to leads button), in a second tab, so the toast's Undo stays on the first. Other
  // specs move leads meanwhile, so the count is only checked to drop.
  const other = await context.newPage();
  const toAnswer = async () => (await other.goto("/?mine=0"), Number(/(\d+) leads? to answer/.exec((await other.getByRole("navigation", { name: "Quick actions" }).getByRole("link", { name: /^Reply to leads/ }).textContent()) ?? "")?.[1] ?? 0));
  const before = await toAnswer();

  await row.getByRole("button", { name: /^More for / }).click();
  await row.getByRole("button", { name: /^Spam: / }).click();
  await expect(page.getByTestId("toast")).toContainText(": Spam");
  await expect(row).toHaveCount(0);
  await expect.poll(toAnswer).toBeLessThan(before);
  // The lead says so. (That no count or report has it is reports.test.ts's and the others'.)
  await other.goto(href);
  await expect(other.getByText("Marked as spam. Left out of every list and report.")).toBeVisible();

  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await page.reload(), row.count())).toBe(1);
});

test("a closed lead says why, and Reopen puts back the status it had (#55)", async ({ page }) => {
  await page.goto("/leads/lead-4002"); // a lead already answered, which no other spec changes
  const status = page.getByRole("group", { name: "Status" }).getByText(/^Where it stands/);
  await expect(status).toHaveText(/Contacted$/);
  await page.getByRole("button", { name: /^More for / }).click();
  await page.getByRole("button", { name: /^Close: Duplicate/ }).click();
  await expect(page.getByText("Closed: Duplicate. Not counted as a lost sale.")).toBeVisible();
  await expect(status).toHaveText(/Closed$/);
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(status).toHaveText(/Contacted$/);
});

test("Book a test drive on a lead fills in their name and number", async ({ page }) => {
  await page.goto("/leads/lead-4000");
  await page.getByRole("link", { name: "Book a test drive" }).click();
  await expect(page).toHaveURL(/test-drives\/new\?lead=lead-4000/);
  await page.getByRole("main").locator("li > button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Fiona Byrne");
});

test("a phone lead's main button is Call, and Book a test drive is not filled", async ({ page }) => {
  await page.goto("/leads/lead-2004"); // came in by phone, and no other spec changes it
  const filled = /(^|\s)bg-accent(\s|$)/;
  await expect(page.getByRole("link", { name: "Call", exact: true })).toHaveClass(filled);
  await expect(page.getByRole("link", { name: "Book a test drive" })).not.toHaveClass(filled);
});

test("Draft a reply opens on the press, so a write that fails still leaves a box to type in", async ({ page }) => {
  await page.goto("/leads/lead-1000");
  const box = page.getByRole("textbox", { name: "Reply draft" });
  await expect(box).toHaveCount(0);
  // The write never reaches the server (a server action is a POST to the page), as when the AI is down.
  await page.route("**/leads/lead-1000", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
  await page.getByRole("button", { name: "Write with AI" }).click();
  await expect(page.getByText(/^Couldn't write that/)).toBeVisible();
  await expect(box).toBeFocused();
  await box.fill("Hi, it is still here.");
  await expect(box).toHaveValue("Hi, it is still here.");
});
