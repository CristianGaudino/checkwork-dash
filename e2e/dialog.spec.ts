import { expect, test } from "@playwright/test";

// The house dialog (src/components/admin/Dialog.tsx), on the Timings edit. Nothing here saves.

test("the dialog takes focus, gives it back, and asks before losing changes", async ({ page }) => {
  await page.goto("/settings?section=targets");
  const edit = page.getByRole("button", { name: "Edit timings" });
  const dialog = page.getByRole("dialog", { name: "Timings" });
  const hours = dialog.locator('input[name="driveSlotMinutes"]');
  await edit.click();
  await expect(dialog).toBeFocused();
  // No changes: Escape closes it at once and focus is back on Edit.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(edit).toBeFocused();
  // Changes: Cancel asks; No keeps it open with what was typed, Yes closes it and the next opening starts afresh.
  await edit.click();
  const was = await hours.inputValue();
  await hours.fill("99");
  page.once("dialog", (d) => d.dismiss());
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeVisible();
  await expect(hours).toHaveValue("99");
  page.once("dialog", (d) => d.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await edit.click();
  await expect(hours).toHaveValue(was);
});

test("on a phone it is a sheet at the foot of the screen, the actions on the right", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/settings?section=targets");
  await page.getByRole("button", { name: "Edit timings" }).click();
  const dialog = page.getByRole("dialog", { name: "Timings" });
  await expect(async () => {
    const box = (await dialog.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(780);
    expect(box.width).toBe(360);
  }).toPass();
  const save = (await dialog.getByRole("button", { name: "Save" }).boundingBox())!;
  const cancel = (await dialog.getByRole("button", { name: "Cancel" }).boundingBox())!;
  expect(save.x).toBeGreaterThan(cancel.x);
  expect(Math.round(save.x + save.width)).toBe(360 - 20);
});
