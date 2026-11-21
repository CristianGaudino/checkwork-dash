import { expect, test } from "@playwright/test";
import { choose } from "./combo";

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("leaving a car form with changes asks first, and No keeps the edits", async ({ page }) => {
    await page.goto("/stock/new");
    await page.getByLabel("Year", { exact: true }).fill("2019");
    const asked: string[] = [];
    page.once("dialog", (d) => {
      asked.push(d.message());
      void d.dismiss();
    });
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect.poll(() => asked).toEqual(["Leave without saving? Your changes will be lost."]);
    await expect(page).toHaveURL(/\/stock\/new$/);
    await expect(page.getByLabel("Year", { exact: true })).toHaveValue("2019");
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("link", { name: "Cancel" }).click();
    await page.waitForURL(/\/stock$/);
  });

  test("a change made only in a dropdown asks too; a form left as it opened does not", async ({ page }) => {
    await page.goto("/stock/new");
    let asked = 0;
    page.on("dialog", (d) => {
      asked++;
      void d.dismiss();
    });
    await choose(page.getByRole("combobox", { name: "Fuel" }), 1);
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect.poll(() => asked).toBe(1);
    await expect(page).toHaveURL(/\/stock\/new$/);
    // A new tab: this one still holds the change, so the browser rightly asks before it reloads.
    const fresh = await page.context().newPage();
    fresh.on("dialog", (d) => {
      asked++;
      void d.dismiss();
    });
    await fresh.goto("/stock/new");
    await fresh.getByRole("link", { name: "Cancel" }).click();
    await fresh.waitForURL(/\/stock$/);
    expect(asked).toBe(1);
  });
});
