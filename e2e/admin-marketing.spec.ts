import { expect, test, type Page } from "@playwright/test";

// Posts and ads are written in one composer on the dashboard's own records. The outward services are simulated for a demo dealer
// (src/lib/integrations.ts), so publishing, starting and sending succeed without leaving the dashboard. For a real dealer without keys
// they say not connected: src/lib/admin/publishers.test.ts.
// The composer's first step: the second car's card. Picking it moves on to Where.
async function startPost(page: Page) {
  await page.goto("/marketing/new");
  await page.getByRole("main").locator("li > button[aria-pressed]").nth(1).click();
  await expect(page.getByRole("heading", { name: /Step 2 of 4/ })).toBeFocused();
}
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true }).click(); // exact: not "Open Next.js Dev Tools" on `next dev`

test("the composer goes car, where, text, when: it suggests text for the car, shows a preview, and publishing posts it", async ({ page }) => {
  await startPost(page);
  await page.getByRole("radio", { name: "Instagram" }).click();
  await next(page);
  await expect(page.getByLabel("Text")).toHaveValue(/Link in bio/);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("radio", { name: "Facebook" }).click();
  await next(page);
  await expect(page.getByLabel("Text")).toHaveValue(/Just in: /);
  await page.getByLabel("Text").fill("Just in, come and see it.");
  await next(page);
  const preview = page.getByRole("figure", { name: "Preview" });
  await expect(preview).toContainText("Facebook");
  await expect(preview).toContainText("Just in, come and see it.");
  await page.getByRole("button", { name: "Post now", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Post published");
  await expect(page).toHaveURL(/\/marketing\?tab=posts/);
});

test("the car step shows the first few cars, Show all the rest, and a search finds any; the header goes back", async ({ page }) => {
  await page.goto("/marketing/new");
  const cards = page.getByRole("main").locator("li > button[aria-pressed]");
  await expect(cards).toHaveCount(8);
  const all = page.getByRole("button", { name: /^Show all \d+ cars$/ });
  const n = Number((await all.textContent())!.match(/\d+/)![0]);
  await all.click();
  await expect(cards).toHaveCount(n);
  await page.getByRole("searchbox", { name: "Search cars" }).fill("zzzz");
  await expect(page.getByText("No car for sale matches.")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Marketing", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing$/);
});

test("a post for a car can be scheduled, and is kept as a draft with Save draft", async ({ page }) => {
  await startPost(page);
  await next(page);
  await expect(page.getByLabel("Text")).not.toHaveValue(""); // the suggested text arrives once the car loads; an empty post is refused
  await next(page);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await startPost(page);
  await next(page);
  await expect(page.getByLabel("Text")).not.toHaveValue("");
  await next(page);
  await page.getByRole("radio", { name: "Schedule post" }).click();
  await page.getByLabel("Date and time").fill("2031-01-01T10:00");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Post scheduled");
});

test("a time in the past cannot be scheduled", async ({ page }) => {
  await startPost(page);
  await next(page);
  await expect(page.getByLabel("Text")).not.toHaveValue("");
  await next(page);
  await page.getByRole("radio", { name: "Schedule post" }).click();
  const when = page.getByLabel("Date and time");
  await when.fill("2020-01-01T10:00");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  expect(await when.evaluate((e: HTMLInputElement) => e.validity.rangeUnderflow)).toBe(true); // the browser stops it before it is sent
  await expect(page).toHaveURL(/\/marketing\/new/);
});

test("the ad switch adds a budget, and publishing starts the ad with the post", async ({ page }) => {
  await startPost(page);
  await next(page);
  await expect(page.getByLabel("Text")).not.toHaveValue("");
  await next(page);
  await expect(page.getByLabel("Budget (€)")).toHaveCount(0);
  await page.getByLabel("Also run it as an ad").check();
  await page.getByLabel("Budget (€)").fill("150");
  await page.getByRole("button", { name: "Post now", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Post published and ad started");
  await expect(page.getByRole("listitem").filter({ hasText: "Facebook and Instagram ad" }).filter({ hasText: "Running" }).filter({ hasText: "€150" }).first()).toBeVisible();
});

test("an idea starts the composer on its car, and the list filters to ads", async ({ page }) => {
  await page.goto("/marketing");
  await page.getByRole("link", { name: /^Posts and ads/ }).waitFor(); // the tabs and ideas stream in after the header (#200)
  const idea = page.getByRole("link", { name: "Write a post" }).first();
  if (await idea.count()) {
    await idea.click();
    await expect(page).toHaveURL(/\/marketing\/new\?car=/);
    await expect(page.getByRole("heading", { name: /Step 2 of 4/ })).toBeVisible();
    await page.goto("/marketing");
  }
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("radio", { name: "Ads", exact: true }).check();
  await expect(page).toHaveURL(/show=ad/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("list", { name: "Posts and ads" }).getByRole("listitem").first()).toContainText(" ad");
});

test("a post draft opens from the list on its words, and a change saved is kept on the same post", async ({ page }) => {
  await startPost(page);
  await next(page);
  await expect(page.getByLabel("Text")).not.toHaveValue("");
  const words = `Come and see it ${Date.now()}`;
  await page.getByLabel("Text").fill(words);
  await next(page);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  // Drafts wait on you; the list shows them when asked, newest first, each row a link to the post.
  await page.goto("/marketing?status=draft");
  const row = page.getByRole("list", { name: "Posts and ads" }).getByRole("listitem").filter({ hasText: words });
  await row.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/marketing\/posts\/post-/);
  await expect(page.getByRole("heading", { name: /Step 3 of 4/ })).toBeVisible();
  await expect(page.getByLabel("Text")).toHaveValue(words);
  const edited = `${words}, changed`;
  await page.getByLabel("Text").fill(edited);
  await next(page);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.goto("/marketing?status=draft");
  const list = page.getByRole("list", { name: "Posts and ads" });
  await expect(list.getByRole("listitem").filter({ hasText: words })).toHaveCount(1);
  await expect(list.getByRole("listitem").filter({ hasText: edited })).toHaveCount(1);
});

test("an unknown notice code shows nothing", async ({ page }) => {
  await page.goto("/marketing?notice=<script>alert(1)</script>");
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("what waits on you is at the top with its next step in the row; the list below is what went out; a chosen car can be changed", async ({ page }) => {
  await page.goto("/marketing");
  const waiting = page.getByRole("region", { name: "Waiting on you" });
  await expect(waiting.getByRole("button", { name: /^(Post now|Finish post|Start ad)/ }).or(waiting.getByRole("link", { name: /^Edit / })).first()).toBeVisible(); // the demo seeds drafts and a scheduled post
  await expect(page.getByRole("list", { name: "Posts and ads" }).getByText("Draft", { exact: true })).toHaveCount(0);
  // Delete is in More, not a red button in every row, and still asks first. Cancel keeps it.
  await expect(waiting.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  await waiting.getByRole("button", { name: /^More for/ }).first().click();
  await page.getByRole("button", { name: /^Delete the / }).first().click();
  await expect(page.getByRole("dialog")).toContainText(/Delete this (post|ad)\?/);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await startPost(page);
  await page.getByRole("button", { name: "Change car" }).click();
  await expect(page.getByRole("heading", { name: /Step 1 of 4/ })).toBeVisible();
});
