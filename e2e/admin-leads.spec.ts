import { expect, test } from "@playwright/test";

// The inbox shows made-up leads only (never the real lead table), filters through the URL, and a lead can be worked.
test("filters by status and search, and keeps the filter in the link", async ({ page }) => {
  await page.goto("/leads");
  // How many the list holds, from its footer (a page shows 25 at most).
  const total = async () => Number((await page.getByText(/^Showing 1 to /).textContent())!.match(/of ([\d,]+)$/)![1].replace(/,/g, ""));
  const all = await total();
  expect(all).toBeGreaterThan(10);
  await page.getByRole("link", { name: /^Won/ }).click(); // one tap, even as the page hydrates: TabRow leaves a swiped row where it is
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
  // Where it stands and Who has it are drop-downs (#135, #136); a note is written in the house dialog (#138).
  const stage = page.getByLabel("Where it stands");
  await stage.click();
  await page.getByRole("option", { name: "Contacted", exact: true }).click();
  await expect(stage).toHaveValue("Contacted");
  await expect(page.getByTestId("toast")).toContainText(": Contacted");
  const who = page.getByRole("combobox", { name: "Who has it" });
  await who.click();
  await page.getByRole("listbox").getByRole("option").nth(1).click(); // the list's, not the demo bar's select
  await expect(who).not.toHaveValue("Not taken");
  await page.getByRole("button", { name: "Add note" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a note" });
  await dialog.getByLabel("Note").fill("Called, will visit on Saturday.");
  await dialog.getByRole("button", { name: "Add note" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Called, will visit on Saturday.")).toBeVisible();
});

test("an unknown lead is a 404, and bad filters are ignored", async ({ page }) => {
  expect((await page.goto("/leads/not-a-lead"))!.status()).toBe(404);
  await page.goto("/leads?status=hacked&type=nope");
  await expect.poll(async () => (await page.getByRole("row").count()) - 1).toBeGreaterThan(10); // the table streams in after the page
});

test("the list opens with what to answer now, and a lead moves on a step from its row, stays there done, with Undo (#94)", async ({ page, context }) => {
  // A 1280 laptop less a 17px Windows scrollbar. A row shows its next action (Call, Email or WhatsApp) and its menu, with the step in it.
  await page.setViewportSize({ width: 1263, height: 900 });
  await page.goto("/leads");
  // The table fits: the flexible columns give way, never the row's buttons.
  expect(await page.locator("table").evaluate((t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth)).toBeLessThanOrEqual(0);
  const todo = page.getByRole("region", { name: /^To answer now/ });
  await expect(todo.getByRole("listitem").first().getByRole("link", { name: /^(Call|Email|WhatsApp)/ })).toBeVisible();
  // A row whose step takes it off the list (Mark contacted; an appointment set stays, to be followed up), clear of the first and last rows,
  // which other specs work at the same time.
  let href = "";
  for (const r of (await todo.getByRole("listitem").all()).slice(1, -1)) {
    await r.getByRole("button", { name: /^More for / }).click();
    if (await r.getByRole("button", { name: /^Mark contacted/ }).count()) {
      href = (await r.locator('a[href^="/leads/lead-"]').first().getAttribute("href"))!;
      break;
    }
    await page.keyboard.press("Escape");
  }
  expect(href).not.toBe("");
  const row = todo.getByRole("listitem").filter({ has: page.locator(`a[href="${href}"]`) });
  const more = row.getByRole("button", { name: /^More for / });
  const mark = row.getByRole("button", { name: /^Mark contacted/ });
  const to = (await mark.textContent())!.trim().replace(/^Mark /, "");
  // The lead's own page, in a second tab: its stage is what the store holds.
  const lead = await context.newPage();
  const status = () => lead.getByLabel("Where it stands");
  await lead.goto(href);
  const before = await status().inputValue();
  await mark.click();
  await expect(page.getByTestId("toast")).toContainText(new RegExp(to, "i"));
  await page.getByTestId("toast").hover(); // held, as a person does, so its six seconds cannot run out before Undo
  await lead.reload();
  await expect(status()).toHaveValue(new RegExp(`^${to}$`, "i"));
  // The step takes it off the list: the row stays where it was, saying what it became, its buttons gone.
  await expect(row.getByText(new RegExp(`^${to}$`, "i"))).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
  // The pressed button went with them: the word keeps the focus, so the next Tab goes on from this row, not the top of the page.
  await expect(row.locator("[data-held]")).toBeFocused();
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await lead.reload(), await status().inputValue())).toBe(before);
  await expect(more).toBeVisible(); // back to normal
});

test("a step pressed on a lead someone moved already is refused, and the row is not held as done (#94)", async ({ page, context }) => {
  await page.goto("/leads");
  const todo = page.getByRole("region", { name: /^To answer now/ });
  // The fourth row, clear of the rows other specs work at the same time.
  const href = (await todo.getByRole("listitem").nth(3).locator('a[href^="/leads/lead-"]').first().getAttribute("href"))!;
  const row = todo.getByRole("listitem").filter({ has: page.locator(`a[href="${href}"]`) });
  await row.getByRole("button", { name: /^More for / }).click();
  // Meanwhile a colleague marks it lost on its own page.
  const lead = await context.newPage();
  await lead.goto(href);
  const stage = lead.getByLabel("Where it stands");
  const before = await stage.inputValue();
  await stage.click();
  await lead.getByRole("option", { name: "Lost", exact: true }).click();
  await expect(stage).toHaveValue("Lost");
  await expect(lead.getByLabel("Why was it lost?")).toBeVisible(); // the page has the saved stage, so the next pick is not stale
  await row.getByRole("button", { name: /^Mark / }).click();
  await expect(page.getByTestId("toast")).toContainText("Someone changed this already");
  // The refresh takes it off the list as lost; it is not held as done, which it is not.
  await expect(row).toHaveCount(0);
  // Put it back by its stage, not the toast's Undo, which may have closed by now under a loaded run.
  await stage.click();
  await lead.getByRole("option", { name: before, exact: true }).click();
  await expect.poll(async () => (await lead.reload(), await stage.inputValue())).toBe(before);
});

test("a lead marked spam from To answer now stays in place as Spam until reload, leaves the Overview count, and Undo brings it back (#56, #94)", async ({ page, context }) => {
  await page.setViewportSize({ width: 1263, height: 900 });
  await page.goto("/leads");
  const todo = page.getByRole("region", { name: /^To answer now/ });
  // The last row shown, as the other tests work the first.
  const href = (await todo.getByRole("listitem").last().locator('a[href^="/leads/lead-"]').first().getAttribute("href"))!;
  const row = todo.getByRole("listitem").filter({ has: page.locator(`a[href="${href}"]`) });
  // A second tab, so the toast's Undo stays on the first.
  const other = await context.newPage();

  await row.getByRole("button", { name: /^More for / }).click();
  await row.getByRole("button", { name: /^Spam: / }).click();
  await expect(page.getByTestId("toast")).toContainText(": Spam");
  // It stays where it was, saying Spam, with no buttons, until the page is loaded again.
  await expect(row.getByText("Spam", { exact: true })).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
  // Gone from the Overview's to-dos (all of them, on To do's own page). A count is no check: other specs add leads at the same time.
  await expect.poll(async () => (await other.goto("/to-do?mine=0"), other.locator(`main a[href="${href}"]`).count())).toBe(0);
  await other.goto("/leads");
  await expect(other.getByRole("region", { name: /^To answer now/ }).locator(`a[href="${href}"]`)).toHaveCount(0);
  // The lead says so. (That no count or report has it is reports.test.ts's and the others'.)
  await other.goto(href);
  await expect(other.getByText("Marked as spam. Left out of every list and report.")).toBeVisible();

  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(row.getByRole("button", { name: /^More for / })).toBeVisible(); // live again, in place
  await expect.poll(async () => (await page.reload(), row.count())).toBe(1);
});

test("a closed lead says why, and Reopen puts back the status it had (#55)", async ({ page }) => {
  await page.goto("/leads/lead-4002"); // a lead already answered, which no other spec changes
  const group = page.getByRole("group", { name: "Status" });
  const stage = page.getByLabel("Where it stands");
  await expect(stage).toHaveValue("Contacted");
  await page.getByRole("button", { name: /^More for / }).click();
  await page.getByRole("button", { name: /^Close: Duplicate/ }).click();
  await expect(page.getByText("Closed: Duplicate. Not counted as a lost sale.")).toBeVisible();
  await expect(group.getByText(/^Where it stands/)).toHaveText(/Closed$/);
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(stage).toHaveValue("Contacted");
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
