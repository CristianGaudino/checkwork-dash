import { expect, test, type Page } from "@playwright/test";
import { bookDrive, openDay } from "./days";
import { driveTimes } from "../src/lib/leads/constants";
import { DEMO_PROFILE } from "../src/lib/tenancy/profile";

// Every action shows it is working (#204): while a server action is out, the button pressed says so (aria-busy, the house BUSY look), and
// the delete question moves as every other dialog does. Server action POSTs carry a Next-Action header; these hold them for a second.
const hold = (page: Page) =>
  page.route("**/*", async (route) => {
    const r = route.request();
    if (r.method() === "POST" && (await r.headerValue("next-action"))) await new Promise((ok) => setTimeout(ok, 1000));
    await route.fallback();
  });

test("a follow-up's Clear says it is working while it sends", async ({ page }) => {
  await page.goto("/leads/lead-2000"); // an open seeded lead no other spec changes
  const panel = page.getByRole("group", { name: "Follow up" });
  const dialog = page.getByRole("dialog");
  await panel.getByRole("button", { name: /^(Schedule follow-up|Edit the follow-up)$/ }).click();
  await dialog.getByRole("button", { name: /^Tomorrow/ }).click();
  await expect(dialog).toBeHidden();
  await hold(page);
  await panel.getByRole("button", { name: "Edit the follow-up" }).click();
  const clear = dialog.getByRole("button", { name: "Clear" });
  await clear.click();
  await expect(clear).toHaveAttribute("aria-busy", "true");
  await expect(panel.getByRole("button", { name: "Schedule follow-up" })).toBeVisible();
});

test("Book test drive says it is working while it sends", async ({ page }) => {
  const day = openDay(Date.now() + 13);
  await hold(page);
  await bookDrive(page, { car: 4, day, time: driveTimes(day, DEMO_PROFILE.hours).at(-2)!, name: "Busy Booker", phone: "+353 83 000 4321" });
  const book = page.getByRole("button", { name: "Booking" });
  await expect(book).toHaveAttribute("aria-busy", "true");
  await expect(page).toHaveURL(/\/test-drives\/drive-/);
});

test("Write with AI says it is working, and so does the box it writes into, until the draft lands", async ({ page }) => {
  await page.goto("/leads/lead-1000");
  await hold(page);
  await page.getByRole("button", { name: "Write with AI" }).click();
  const button = page.getByRole("button", { name: "Writing" });
  const reply = page.getByRole("textbox", { name: "Reply draft" });
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(reply).toHaveAttribute("aria-busy", "true");
  await expect(reply).toHaveValue(/^Hi /);
  await expect(reply).not.toHaveAttribute("aria-busy");
  await expect(page.getByRole("button", { name: "Write again" })).not.toHaveAttribute("aria-busy");
});

test("a row's delete question is the house dialog: it fades, starts on Cancel, and Escape or Cancel leaves the row (RowMenu)", async ({ page }) => {
  await page.goto("/settings?section=team");
  const member = page.getByRole("row").filter({ has: page.getByRole("button", { name: /^More for / }) }).first();
  const more = member.getByRole("button", { name: /^More for / });
  const dialog = page.getByRole("dialog");
  await more.click();
  await member.getByRole("button", { name: "Remove" }).click(); // the menu closes; the question still opens
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => getComputedStyle(d).transitionProperty)).toContain("opacity");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Asked again, the same dialog opens again (it stays mounted after the first ask, so its exit can play).
  await more.click();
  await member.getByRole("button", { name: "Remove" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(more).toBeVisible();
});

test("a confirm asked from inside a dialog closes alone: Cancel leaves the reply dialog open", async ({ page }) => {
  await page.goto("/reviews");
  await page.getByText(/^(Reply|Edit reply)$/).first().click();
  const reply = page.getByRole("dialog").filter({ has: page.getByRole("textbox", { name: /^Reply to / }) });
  await reply.getByRole("textbox", { name: /^Reply to / }).fill("Thanks for coming in.");
  await reply.getByRole("button", { name: /^(Post|Update) reply$/ }).click();
  const ask = page.getByRole("dialog", { name: /on Google\?$/ });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toBeHidden();
  await expect(reply).toBeVisible();
  // Escape too, which the house dialog handles itself (cancel), closes only the question.
  await reply.getByRole("button", { name: /^(Post|Update) reply$/ }).click();
  await expect(ask).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ask).toBeHidden();
  await expect(reply).toBeVisible();
});

test.describe("sign in", () => {
  const CLOSED = `http://localhost:${Number(process.env.PORT ?? 3000) + 2}`; // the closed server with our sign-in (playwright.config.ts)
  test.skip(!!process.env.E2E_BASE_URL, "needs the run's own closed server");
  test.use({ serviceWorkers: "block" });

  test("Email me a code and Sign in say they are working while they send", async ({ page }) => {
    await page.route("https://challenges.cloudflare.com/**", (route) =>
      route.fulfill({ contentType: "text/javascript", body: `window.turnstile = { render(el, o) { setTimeout(() => o.callback("e2e-token")); return "w1"; }, reset() {}, remove() {} };` }),
    );
    await hold(page);
    await page.goto(`${CLOSED}/sign-in`);
    await page.getByLabel("Email").fill("nobody@example.com");
    const send = page.getByRole("button", { name: "Email me a code" });
    await send.click();
    await expect(send).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await page.getByLabel("Code").fill("000000");
    const signIn = page.getByRole("button", { name: "Sign in" });
    await signIn.click();
    await expect(signIn).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("form").getByRole("alert")).toBeVisible();
    await expect(signIn).not.toHaveAttribute("aria-busy");
  });
});
