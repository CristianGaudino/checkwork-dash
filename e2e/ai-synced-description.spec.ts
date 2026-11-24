import { expect, test, type Dialog } from "@playwright/test";
import { BASE } from "./open";

// A synced car can't be edited here, so AI improves its description to paste into DoneDeal (#225).
test("a synced car's description is improved with AI and copied for DoneDeal", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await context.addCookies([{ name: "checkwork-demo-stock", value: "donedeal", url: BASE }]);
  await page.goto("/stock");
  // With AI on, a synced car opens here rather than on the site.
  await page.locator('tbody a[href^="/stock/"]').first().click();
  // Read first: the text, set and scrolling; Edit opens the house dialog with the writer.
  const panel = page.getByRole("region", { name: "Description", exact: true });
  const shown = panel.getByRole("region", { name: "Description text" });
  const was = await shown.innerText();
  await expect(panel.getByRole("textbox")).toHaveCount(0);
  // The live region is there, empty, before anything changes: a screen reader reads it when it fills.
  await expect(panel.getByRole("status")).toBeEmpty();
  await panel.getByRole("button", { name: "Edit description" }).click();
  const dialog = page.getByRole("dialog", { name: "Description" });
  const box = dialog.getByRole("textbox", { name: "Description" });
  await dialog.getByRole("button", { name: "Write with AI" }).click();
  await expect(dialog.getByText("AI draft", { exact: true })).toBeVisible();
  const first = await box.inputValue();
  await dialog.getByRole("button", { name: "Shorter" }).click();
  await expect(box).not.toHaveValue(first);
  const text = await box.inputValue();
  expect(text).not.toMatch(/[—–]/);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  // Done keeps it on the page, says the website and DoneDeal still have the old text, and copies it for the ad.
  expect((await shown.innerText()).trim()).not.toBe(was.trim());
  const notice = panel.getByRole("status");
  await expect(notice).toContainText("Not on DoneDeal yet");
  await notice.getByRole("button", { name: "Copy for DoneDeal" }).click();
  await expect(notice.getByRole("button", { name: "Copied" })).toBeVisible();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r/g, "")).toBe(text); // Windows reads it back with CRLF
  // Copied text is on its way to DoneDeal, so leaving asks nothing.
  const url = page.url();
  let askedAfterCopy = false;
  const onDialog = (d: Dialog) => ((askedAfterCopy = true), d.dismiss());
  page.on("dialog", onDialog);
  await page.getByRole("link", { name: "Leads", exact: true }).first().click();
  await expect(page).toHaveURL(/\/leads/);
  page.off("dialog", onDialog);
  expect(askedAfterCopy).toBe(false);
  await page.goto(url);
  // Back on the car, the text is the listing site's again (nothing was stored): make the change again and copy it.
  await panel.getByRole("button", { name: "Edit description" }).click();
  await box.fill(text);
  await dialog.getByRole("button", { name: "Done" }).click();
  await notice.getByRole("button", { name: "Copy for DoneDeal" }).click();
  await expect(notice.getByRole("button", { name: "Copied" })).toBeVisible();
  // An edit since is not what was copied.
  await panel.getByRole("button", { name: "Edit description" }).click();
  await box.press("End");
  await box.pressSequentially(" Ask about finance.");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(notice.getByRole("button", { name: "Copy for DoneDeal" })).toBeVisible();
  // The new text lives on this page only, so leaving asks first; No stays.
  const asked = page.waitForEvent("dialog").then(async (d) => (await d.dismiss(), d.message()));
  await page.getByRole("link", { name: "Leads", exact: true }).first().click();
  expect(await asked).toContain("Leave without saving");
  await expect(page).toHaveURL(/\/stock\/[^/]+$/);
  await expect(shown).toBeVisible();
});
