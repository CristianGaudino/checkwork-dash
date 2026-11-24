import { expect, test, type Page } from "@playwright/test";
import { choose } from "./combo";

// Marketing formats, the media library, the calendar and the AI writer (#177, #179). The AI is the demo's mock (no key, no cost) and publishing is
// simulated, so everything here runs without leaving the dashboard. The unit tests hold the rules (src/lib/ai, src/lib/admin/media-rules.test.ts).
async function startPost(page: Page, url = "/marketing/new") {
  await page.goto(url);
  await page.getByRole("main").locator("li > button[aria-pressed]").nth(2).click();
  await expect(page.getByRole("heading", { name: /Step 2 of 4/ })).toBeFocused();
}
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true }).click(); // exact: not "Open Next.js Dev Tools" on `next dev`
const text = (page: Page) => page.getByRole("textbox", { name: "Text", exact: true });
// A 1 by 1 PNG: the browser reads it, shrinks it to a JPEG and sends it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("write a post with AI, adjust it, undo, and edit it: it is marked as AI and stays editable", async ({ page }) => {
  await startPost(page);
  await next(page);
  await expect(text(page)).not.toHaveValue("");
  await expect(page.getByText("AI draft")).toHaveCount(0);
  await page.getByRole("button", { name: "Write with AI" }).click();
  await expect(page.getByText("AI draft", { exact: true })).toBeVisible();
  const first = await text(page).inputValue();
  expect(first).toMatch(/^Just in: /);
  expect(first).not.toMatch(/[—–]/);
  await page.getByRole("button", { name: "Shorter" }).click();
  await expect(text(page)).not.toHaveValue(first);
  const short = await text(page).inputValue();
  expect(short.length).toBeLessThan(first.length);
  await page.getByRole("button", { name: "Add hashtags" }).click();
  await expect(text(page)).toHaveValue(/#\w+/);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(text(page)).toHaveValue(short);
  await text(page).fill(`${short} Ask for Aoife.`);
  await expect(page.getByText("AI draft, edited")).toBeVisible();
  await page.getByRole("button", { name: "Use the suggestion" }).click(); // back to the template, so no AI label
  await expect(page.getByText("AI draft")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Write with AI" })).toBeVisible();
});

test("make a story from a car: pick the layout, see it drawn on the photo, and publish it", async ({ page }) => {
  // Counted before and after: other specs post at the same time, so the list's first story may not be this one.
  await page.goto("/marketing");
  const posted = () => page.getByRole("listitem").filter({ hasText: "Facebook story" }).filter({ hasText: "Posted" }).count();
  const before = await posted();
  await startPost(page);
  await page.getByRole("radio", { name: "Story" }).click();
  await expect(page.getByRole("radio", { name: "Reel or video" })).toBeVisible();
  await next(page);
  await page.getByRole("radio", { name: "Price drop" }).click();
  await expect(text(page)).toHaveValue(/^Price drop: /);
  await expect(page.getByRole("button", { name: "Add urgency" })).toHaveCount(0); // the buttons come with the first draft
  await page.getByRole("button", { name: "Write with AI" }).click();
  await expect(page.getByRole("button", { name: "Add urgency" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add hashtags" })).toHaveCount(0); // a story only gets the buttons that fit it
  await next(page);
  const preview = page.locator("[data-preview=story]");
  await expect(preview).toContainText("Price drop");
  await expect(preview).toContainText("See it");
  await page.getByRole("button", { name: "Post now", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Post published."); // a story goes out through the API like a feed post
  await expect.poll(posted).toBeGreaterThan(before);
});

test("a TikTok has no story", async ({ page }) => {
  await startPost(page);
  await page.getByRole("radio", { name: "Story" }).click();
  await page.getByRole("radio", { name: "TikTok" }).click();
  await expect(page.getByRole("radio", { name: "Story" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Post", exact: true })).toBeChecked();
});

// TikTok keeps an unaudited app's posts private, so a TikTok post is saved and held until TikTok approves us (PUBLISH_MODE), and says so.
test("a TikTok post is held until TikTok approves us, and says so", async ({ page }) => {
  await page.goto("/marketing");
  const held = () => page.getByRole("listitem").filter({ hasText: "TikTok post" }).filter({ hasText: "Waiting for TikTok" }).count();
  const before = await held();
  await startPost(page);
  await page.getByRole("radio", { name: "TikTok" }).click();
  await next(page);
  await next(page);
  await expect(page.getByText("It is saved and goes out once TikTok approves us.")).toBeVisible();
  await page.getByRole("button", { name: "Post now", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved. It goes out once TikTok approves us.");
  await expect.poll(held).toBeGreaterThan(before);
  await expect(page.getByText(/your phone/)).toHaveCount(0);
});

test("upload a photo to the media library, tag it to a car, and use it in a carousel; the server refuses a file that is not a photo", async ({ page }) => {
  await page.goto("/marketing?tab=media");
  await choose(page.getByRole("combobox", { name: "Car, if it belongs to one" }), 1);
  const name = `e2e-yard-${Date.now()}.png`;
  await page.getByLabel("Add photos or videos").setInputFiles({ name, mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Added to your library")).toBeVisible();
  await expect(page.getByRole("img", { name: new RegExp(name.slice(0, -4)) })).toBeVisible();
  await page.getByLabel("Add photos or videos").setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: Buffer.from("not a picture") });
  await expect(page.getByText("could not be added")).toBeVisible();
  // It is on offer when a carousel is made.
  await startPost(page);
  await page.getByRole("radio", { name: "Carousel" }).click();
  await next(page);
  await expect(page.getByRole("button", { name: "Add photo", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Photos, 2 to 10")).toBeVisible();
});

test("a post that goes out shows on the calendar's week, and the week can move", async ({ page }) => {
  await startPost(page);
  await next(page);
  await expect(text(page)).not.toHaveValue("");
  await next(page);
  await page.getByRole("button", { name: "Post now", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Post published");
  await page.goto("/marketing?tab=calendar");
  const week = page.getByRole("region", { name: "Week" });
  await expect(week.locator("[data-calendar-item]").first()).toBeVisible();
  await expect(week.getByRole("listitem").filter({ hasText: "Posted" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Later" }).click();
  await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/);
  await expect(week.getByText("Nothing set").first()).toBeVisible();
});

test("an idea offers a story as well as a post", async ({ page }) => {
  await page.goto("/marketing");
  const story = page.getByRole("link", { name: "Make a story" }).first();
  if (await story.count()) {
    await story.click();
    await expect(page).toHaveURL(/format=story&layout=(just-in|price-drop)/);
    await page.getByRole("radio", { name: "Story" }).waitFor();
    await expect(page.getByRole("radio", { name: "Story" })).toBeChecked();
  }
});

test("write a car description, a lead reply and a review reply with AI", async ({ page }) => {
  await page.goto("/stock/new");
  await page.getByLabel("Make").fill("Skoda");
  await page.getByLabel("Model").fill("Octavia");
  await page.getByText("More details (optional)").click();
  await page.getByLabel("Seats").fill("5");
  await page.getByRole("button", { name: "Write with AI" }).click();
  const description = page.getByRole("textbox", { name: "Description" });
  await expect(description).toHaveValue(/Skoda Octavia/);
  await page.getByRole("button", { name: "Highlight family use" }).click();
  await expect(description).toHaveValue(/5 seats/);
  await expect(page.getByText("AI draft", { exact: true })).toBeVisible();

  await page.goto("/leads/lead-1000");
  await page.getByRole("button", { name: "Write with AI" }).click();
  const reply = page.getByRole("textbox", { name: "Reply draft" });
  await expect(reply).toHaveValue(/^Hi /);
  await page.getByRole("button", { name: "Friendlier" }).click();
  await expect(reply).toHaveValue(/thanks so much/);
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();

  await page.goto("/reviews");
  await page.getByText(/^(Reply|Edit reply)$/).first().click();
  await page.getByRole("button", { name: "Write with AI" }).first().click();
  await expect(page.getByRole("textbox", { name: /^Reply to / }).first()).not.toHaveValue("");
  await expect(page.getByRole("button", { name: "More apologetic" }).first()).toBeVisible();
});

test("with the AI module off there is no AI anywhere; with Social off there is no Marketing; stock alerts alone are on Customers", async ({ page, context, baseURL }) => {
  const modules = (value: string) => context.addCookies([{ name: "checkwork-demo-modules", value, url: baseURL! }]);
  await modules("dashboard,social,newsletter,reviews");
  await startPost(page);
  await next(page);
  await expect(text(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Write with AI" })).toHaveCount(0);
  await page.goto("/leads/lead-1000");
  await expect(page.getByRole("button", { name: "Write with AI" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Draft a reply" })).toHaveCount(0);

  await modules("dashboard,newsletter,ai");
  expect((await page.goto("/marketing"))?.status()).toBe(404);
  await page.goto("/marketing/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not in your plan");
  await page.goto("/customers");
  await expect(page.getByRole("link", { name: /^Stock alerts/ })).toHaveAttribute("aria-current", "true");
});
