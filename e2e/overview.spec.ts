import { expect, test, type Page } from "@playwright/test";
import { as } from "./open";

// The overview is where the day starts: the main jobs as big buttons, and a to-do list whose buttons do the job in place.
test("the overview opens with the main jobs, and a test drive is confirmed from the to-do list, with Undo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?todo=all"); // To do shows its top rows; the test drives may be below them
  const jobs = page.getByRole("navigation", { name: "Quick actions" });
  for (const job of ["Add a car", "Book a test drive", "New post", "Reply to leads"]) await expect(jobs.getByRole("link", { name: new RegExp(`^${job}`) })).toBeVisible();
  const todo = page.getByRole("list", { name: "To do" });
  const confirm = todo.getByRole("button", { name: /^Confirm .+'s test drive$/ }).first();
  const name = (await confirm.getAttribute("aria-label"))!.replace(/^Confirm (.+)'s test drive$/, "$1");
  await confirm.click();
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(`${name}: Confirmed`);
  await expect(todo.getByRole("button", { name: `Confirm ${name}'s test drive` })).toHaveCount(0);
  await toast.getByRole("button", { name: "Undo" }).click(); // back as it was, for the other specs
  await expect(todo.getByRole("button", { name: `Confirm ${name}'s test drive` })).toBeVisible();
});

test("a new lead is called or answered from its row in To do", async ({ page }) => {
  await page.goto("/");
  const leads = page.getByRole("list", { name: "To do" });
  await expect(leads.getByRole("link", { name: /^Call / }).first()).toHaveAttribute("href", /^tel:/);
  await leads.getByRole("link", { name: /^Open .*'s lead$/ }).first().click();
  await expect(page).toHaveURL(/\/leads\/[^/]+$/);
});

// One count (#38): the headline and To do say the same number, and the Reply to leads button the same as Leads' To answer now.
const count = (text: string | null, re: RegExp) => Number(re.exec(text ?? "")?.[1] ?? 0); // none: "Nothing urgent", "All answered";
async function counts(page: Page) {
  await page.goto("/");
  const headline = count(await page.getByText(/ need(s)? you\.$/).textContent(), /(\d+) things? needs? you/);
  const toDo = count(await page.getByRole("heading", { level: 2, name: /^To do/ }).textContent(), /^To do(\d+)/);
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
  await page.getByRole("link", { name: /^See all \d+$/ }).click();
  await expect(page).toHaveURL(/todo=all/);
  expect(await todo.getByRole("listitem").count()).toBeGreaterThan(8);
});

test("Sales sees only their own to-dos by default, and can switch to the whole team's", async ({ page, context }) => {
  await as(context, "Sales");
  await page.goto("/");
  const mine = page.getByRole("link", { name: "Only mine" });
  await expect(mine).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("navigation", { name: "Quick actions" }).getByRole("link", { name: /^Reply to leads/ })).toHaveAttribute("href", /mine=1/);
  await expect(async () => {
    const c = await counts(page);
    expect(c.toDo).toBe(c.headline);
    expect(c.leads).toBe(c.answer);
  }).toPass();
  await page.goto("/");
  await mine.click();
  await expect(page).toHaveURL(/mine=0/);
  await expect(mine).not.toHaveAttribute("aria-current", "true");
});

test("Leads: Who has it wins over Only mine, so a colleague's waiting leads still show", async ({ page, context }) => {
  await as(context, "Sales");
  const answer = async (url: string) => {
    await page.goto(url);
    return count(await page.getByRole("heading", { level: 2, name: /^To answer now/ }).textContent(), /^To answer now(\d+)/);
  };
  const theirs = await answer("/leads?with=Aoife%20Brennan");
  expect(theirs).toBeGreaterThan(0); // a colleague with work waiting, so an empty panel would show
  expect(await answer("/leads?mine=1&with=Aoife%20Brennan")).toBe(theirs);
  await expect(page.getByRole("link", { name: "Only mine" })).toHaveCount(0);
});
