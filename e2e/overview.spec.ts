import { expect, test, type Page } from "@playwright/test";
import { as } from "./open";

// The overview is where the day starts: the main jobs as big buttons, and a to-do list whose buttons do the job in place.
test("the overview opens with the main jobs, and a test drive is confirmed from the to-do list, with Undo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const jobs = page.getByRole("navigation", { name: "Quick actions" });
  for (const job of ["Add a car", "Book a test drive", "New post", "Reply to leads"]) await expect(jobs.getByRole("link", { name: new RegExp(`^${job}`) })).toBeVisible();
  await page.goto("/to-do"); // every row: the test drives may be below the Overview's top few
  const todo = page.getByRole("list", { name: "To do" });
  const confirm = todo.getByRole("button", { name: /^Confirm: .+$/ }).first();
  const name = (await confirm.getAttribute("aria-label"))!.replace(/^Confirm: (.+)$/, "$1");
  await confirm.click();
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(`${name}: Confirmed`);
  await expect(todo.getByRole("button", { name: `Confirm: ${name}` })).toHaveCount(0);
  await toast.getByRole("button", { name: "Undo" }).click(); // back as it was, for the other specs
  await expect(todo.getByRole("button", { name: `Confirm: ${name}` })).toBeVisible();
});

test("a new lead is called or answered from its row in To do", async ({ page }) => {
  await page.goto("/");
  const leads = page.getByRole("list", { name: "To do" });
  // A follow-up's row: Call, and Open under the row's menu (#95).
  const row = leads.getByRole("listitem").filter({ has: page.getByRole("link", { name: /^Call / }) }).first();
  await expect(row.getByRole("link", { name: /^Call / })).toHaveAttribute("href", /^tel:/);
  await row.getByRole("button", { name: /^More for / }).click();
  await row.getByRole("link", { name: /^Open .*'s lead$/ }).click();
  await expect(page).toHaveURL(/\/leads\/[^/]+$/);
});

// One count (#38): To do and the To do page its See all opens say the same number, and the Reply to leads button the same as Leads'
// To answer now.
const count = (text: string | null, re: RegExp) => Number(re.exec(text ?? "")?.[1] ?? 0); // none: "All answered";
// To do's See all (Test drives has one too).
const seeAll = (page: Page) => page.locator('a[href^="/to-do"]', { hasText: "See all" });
async function counts(page: Page) {
  await page.goto("/");
  const toDo = count(await page.getByRole("heading", { level: 2, name: /^To do/ }).textContent(), /^To do(\d+)/);
  await page.goto((await seeAll(page).getAttribute("href"))!); // hidden from 640px when To do shows every row
  const headline = count(await page.getByText(/^\d+ to-dos?$/).textContent(), /^(\d+) to-dos?$/);
  await page.goto("/");
  const tile = page.getByRole("navigation", { name: "Quick actions" }).getByRole("link", { name: /^Reply to leads/ });
  const leads = count(await tile.textContent(), /(\d+) leads? to answer/);
  await tile.click();
  const answer = count(await page.getByRole("heading", { level: 2, name: /^To answer now/ }).textContent(), /^To answer now(\d+)/);
  return { headline, toDo, leads, answer };
}

test("the overview counts what needs doing once, and To do shows the top rows then See all", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Other specs change leads while this runs: read all four again until one look agrees.
  await expect(async () => {
    const c = await counts(page);
    expect(c.toDo).toBe(c.headline);
    expect(c.leads).toBe(c.answer);
  }).toPass();
  await page.goto("/");
  const todo = page.getByRole("list", { name: "To do" });
  await expect(todo.getByRole("listitem")).toHaveCount(8);
  await seeAll(page).click();
  await expect(page).toHaveURL(/\/to-do\?mine=0$/); // its own page: the Overview never grows
  expect(await todo.getByRole("listitem").count()).toBeGreaterThan(8);
});

test("Sales sees only their own to-dos by default, and can switch to the whole team's", async ({ page, context }) => {
  await as(context, "Sales");
  await page.goto("/");
  const whose = page.getByRole("navigation", { name: "Whose to-dos" });
  const mine = whose.getByRole("link", { name: "For me" });
  await expect(mine).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Quick actions" }).getByRole("link", { name: /^Reply to leads/ })).toHaveAttribute("href", /mine=1/);
  await expect(async () => {
    const c = await counts(page);
    expect(c.toDo).toBe(c.headline);
    expect(c.leads).toBe(c.answer);
  }).toPass();
  await page.goto("/");
  await whose.getByRole("link", { name: "Everyone" }).click();
  await expect(page).toHaveURL(/mine=0/);
  await expect(mine).not.toHaveAttribute("aria-current", "page");
});

test("Leads: Who has it wins over For me, so a colleague's waiting leads still show", async ({ page, context }) => {
  await as(context, "Sales");
  const answer = async (url: string) => {
    await page.goto(url);
    return count(await page.getByRole("heading", { level: 2, name: /^To answer now/ }).textContent(), /^To answer now(\d+)/);
  };
  const theirs = await answer("/leads?with=Aoife%20Brennan");
  expect(theirs).toBeGreaterThan(0); // a colleague with work waiting, so an empty panel would show
  expect(await answer("/leads?mine=1&with=Aoife%20Brennan")).toBe(theirs);
  await expect(page.getByRole("navigation", { name: "Whose leads" })).toHaveCount(0);
});
