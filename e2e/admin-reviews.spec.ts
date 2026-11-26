import { expect, test } from "@playwright/test";

test("reviews show a rating summary, and a reply can be posted, then the review leaves Needs a reply", async ({ page }) => {
  await page.goto("/reviews");
  await expect(page.getByRole("img", { name: /out of 5 stars/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /^Needs a reply/ }).click();
  const first = page.locator("[data-review]").first();
  const author = await first.locator("[data-author]").textContent();
  // Reply opens the house dialog (#141), with the review above the box.
  await first.getByRole("button", { name: `Reply to ${author}` }).click();
  const box = page.getByRole("dialog", { name: `Reply to ${author}` });
  await box.getByRole("button", { name: "Post reply" }).click();
  await expect(box.getByRole("alert")).toHaveText("Write a reply first");
  await box.locator("textarea").fill("Thank you, we are glad it went well.");
  await box.getByRole("button", { name: "Post reply" }).click();
  // Public on Google, so it asks first and shows the text.
  const dialog = page.getByRole("dialog", { name: "Post this reply on Google?" });
  await expect(box).toBeVisible(); // still open behind the asking
  await expect(dialog).toContainText("Thank you, we are glad it went well.");
  await dialog.getByRole("button", { name: "Post reply" }).click();
  await expect(page.getByRole("status")).toHaveText("Reply posted on Google.");
  await page.goto("/reviews?filter=unreplied");
  await expect(page.getByText(author!, { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /^All/ }).click();
  // The posted reply on the page, not the edit box that now sits (closed) in the author line.
  await expect(page.getByText("Your reply: Thank you, we are glad it went well.").first()).toBeVisible();
});

test("a reply goes to Google first and says so; flags are gone, since Google cannot take them", async ({ page }) => {
  await page.goto("/reviews?filter=low");
  await expect(page.getByText(/Replies are posted on Google as/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Flag for review" })).toHaveCount(0);
  const first = page.locator("[data-review]").first();
  await first.getByRole("button", { name: /^(Reply|Edit reply) to / }).click();
  const box = page.getByRole("dialog", { name: /^(Reply to|Edit your reply)/ });
  await box.locator("textarea").fill(`Sorry to hear it. Please call us. ${Date.now()}`);
  await box.getByRole("button", { name: /^(Post|Update) reply$/ }).click();
  await page.getByRole("dialog", { name: /on Google\?$/ }).getByRole("button", { name: /^(Post|Update) reply$/ }).click();
  await expect(page.getByRole("status")).toHaveText("Reply posted on Google.");
});


test("the reviews waiting for a reply come first, each with Reply in place", async ({ page }) => {
  // All, since on Needs a reply the list has no title of its own (the tile says it).
  await page.goto("/reviews?filter=all");
  const first = page.locator("[data-review]").first();
  await expect(page.getByRole("region", { name: "Needs a reply" }).locator("[data-review]").first()).toHaveText((await first.textContent())!);
  await expect(first.getByRole("button", { name: /^Reply to / })).toBeVisible();
});
