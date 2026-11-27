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

// The motion of the popovers and the toast (#203). Only that it moves, and that what leaves goes; how it feels is a look in a browser.
test("on a phone the filters open as a sheet that slides", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/stock");
  await page.getByRole("button", { name: "Filters" }).click();
  const panel = page.locator('[popover][aria-label="Filters"]');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((p) => getComputedStyle(p).transitionProperty)).toContain("translate");
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test.describe(`${reducedMotion} motion`, () => {
    test.use({ reducedMotion });
    test("a toast fades out before it goes", async ({ page }) => {
      // The demo's history check on a car in stock (history-check.spec.ts): the toast says it was checked, or already was.
      await page.setViewportSize({ width: 1280, height: 800 }); // a phone's demo pill sits over the toast's cross
      await page.goto("/stock/4710001");
      await page.getByRole("region", { name: "History check" }).getByRole("button", { name: /^Check (history|again)$/ }).click();
      const toast = page.getByTestId("toast");
      await expect(toast).toContainText(/History checked|Already checked/);
      await toast.getByRole("button", { name: "Dismiss" }).click();
      await expect(toast).toHaveAttribute("data-leaving", "true");
      await expect(toast).toHaveCount(0); // under reduced motion too: its fade still ends
    });
  });
}

// The search runs as the list's request is held: the table is dimmed while it waits (the dim itself is globals.css, #199).
async function searchHeld(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/stock");
  await expect(page.locator("main table")).toBeVisible();
  await page.route("**/stock?*", (route) => (route.request().headers()["rsc"] ? new Promise(() => {}) : route.continue()));
  await page.getByRole("textbox", { name: "Search stock" }).fill("zzz");
}

test("a search waiting on the list says so", async ({ page }) => {
  await searchHeld(page);
  await expect(page.locator("main [data-list-busy]")).toHaveCount(1);
});

test("a search waiting on the list dims the table", async ({ page }) => {
  await searchHeld(page);
  await expect.poll(() => page.locator("main table").evaluate((t) => getComputedStyle(t).opacity)).toBe("0.6");
});
