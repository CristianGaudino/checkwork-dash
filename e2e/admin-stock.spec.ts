import { expect, test } from "@playwright/test";
import { choose } from "./combo";
import { as } from "./open";

// The dealer adds, edits, sells and deletes a car. One made-up make, so no other test sees it, and it is
// deleted at the end whatever happens.
const MAKE = "Zztest";

// The row buttons (Edit, Mark sold) are a desktop table's; on a phone the row itself opens the car.
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

test.afterEach(async ({ page }) => {
  await page.goto("/stock?status=all&q=" + MAKE);
  const row = page.getByRole("row", { name: new RegExp(MAKE) });
  while ((await row.count()) > 0) {
    await row.first().getByRole("link").first().click();
    await page.getByRole("button", { name: /^Delete / }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/deleted=1/);
    await page.goto("/stock?status=all&q=" + MAKE);
  }
});

test("the form checks the car, says what is wrong, and keeps what was typed", async ({ page }) => {
  await page.goto("/stock/new");
  await page.getByLabel("Model", { exact: true }).fill("Roadster");
  await page.getByLabel("Year", { exact: true }).fill("1850");
  await page.getByLabel("Price (€)", { exact: true }).fill("19950");
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByText("Enter the make")).toBeVisible();
  await expect(page.getByText("Enter a year from 1980")).toBeVisible();
  await expect(page).toHaveURL(/\/stock\/new$/);
  // A refused save never throws away the rest of the form.
  await expect(page.getByLabel("Model", { exact: true })).toHaveValue("Roadster");
  await expect(page.getByLabel("Price (€)", { exact: true })).toHaveValue("19950");
  await expect(page.locator("input[name=year]")).toHaveValue("1850");
});

test("a car keeps its registration: on the list, found by a search however it is typed, and changed on its page", async ({ page }) => {
  await page.goto("/stock/new");
  await page.getByRole("textbox", { name: /^Registration/ }).fill("191-ww-48213");
  await page.getByLabel("Make", { exact: true }).fill(MAKE);
  await page.getByLabel("Model", { exact: true }).fill("Roadster");
  await page.getByLabel("Year", { exact: true }).fill("2019");
  await page.getByLabel("Price (€)", { exact: true }).fill("19950");
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByRole("status")).toContainText("Saved 2019 Zztest Roadster");

  await page.goto("/stock?q=191ww48213");
  const row = page.getByRole("row", { name: new RegExp(MAKE) });
  await expect(row).toContainText("191-WW-48213");
  await row.getByRole("link").first().click();
  await expect(page.getByRole("region", { name: "This car", exact: true })).toContainText("191-WW-48213");
  await page.getByLabel("Registration", { exact: true }).fill("192-D-7");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/saved=/);
  await page.goto("/stock?q=" + MAKE);
  await expect(page.getByRole("row", { name: new RegExp(MAKE) })).toContainText("192-D-7");
});

test("add a car, change its price to a drop, mark it sold, delete it", async ({ page }) => {
  await page.goto("/stock/new");
  await page.getByLabel("Make", { exact: true }).fill(MAKE);
  await page.getByLabel("Model", { exact: true }).fill("Roadster");
  await page.getByLabel("Year", { exact: true }).fill("2022");
  await page.getByLabel("Price (€)", { exact: true }).fill("19950");
  await choose(page.getByLabel("VAT"), /excludes/);
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByRole("status")).toContainText("Saved 2022 Zztest Roadster");

  // Edit: a lower price with the old one as the earlier price.
  await page.goto("/stock?q=" + MAKE);
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("link").first().click();
  await page.getByLabel("Price (€)", { exact: true }).fill("18500");
  await page.locator('[name="wasPriceEur"]').fill("19950");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/saved=/);
  await page.goto("/stock?q=" + MAKE);
  await expect(page.getByRole("row", { name: new RegExp(MAKE) })).toContainText("was €19,950");

  // Sold: Mark sold records the sale (price, day, salesperson, a new customer), then the car is out of "For sale" and in "Sold".
  await page.goto("/stock?q=" + MAKE);
  await page.getByRole("link", { name: "Mark sold" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mark sold");
  await page.getByLabel("Sale price (€)").fill("18000");
  await page.getByLabel("Name", { exact: true }).fill("Pat Byrne");
  await page.getByLabel("Phone", { exact: true }).fill("+353 83 000 4321");
  await page.getByRole("button", { name: "Mark sold" }).click();
  await expect(page.getByRole("status")).toContainText(/Sale recorded for/);
  await page.goto("/stock?q=" + MAKE);
  await expect(page.getByRole("row", { name: new RegExp(MAKE) })).toHaveCount(0);
  await page.goto("/stock?view=sold&q=" + MAKE);
  const sold = page.getByRole("row", { name: new RegExp(MAKE) });
  await expect(sold).toContainText("sold for €18,000");
  await sold.getByRole("button", { name: /^More for/ }).click();
  await expect(sold.getByRole("link", { name: "Undo sale" })).toBeVisible(); // a recorded sale is undone, never thrown away

  // Delete, from the car's own page, asks first: Cancel keeps it; Delete takes it from the dealer's list and the site.
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("link").first().click();
  await page.getByRole("button", { name: /^Delete / }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: /^Delete / }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("status")).toHaveText("Car deleted.");
  await expect(page.getByRole("row", { name: new RegExp(MAKE) })).toHaveCount(0);
});

test("a draft is published, its website link opens the dealer's site in a new tab, and hiding can be undone", async ({ page }) => {
  await page.goto("/stock/new");
  await page.getByLabel("Make", { exact: true }).fill(MAKE);
  await page.getByLabel("Model", { exact: true }).fill("Draft");
  await page.getByLabel("Year", { exact: true }).fill("2020");
  await page.getByLabel("Price (€)", { exact: true }).fill("15000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Saved 2020 Zztest Draft");

  // Publish from the Drafts view: on the website, with its own page there.
  await page.goto("/stock?view=drafts&q=" + MAKE);
  const row = page.getByRole("row", { name: new RegExp(MAKE) });
  await row.getByRole("button", { name: /^More for/ }).click();
  await row.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("toast")).toContainText("Published 2020 Zztest Draft");
  await page.goto("/stock?q=" + MAKE);
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("link").first().click();
  const site = page.getByRole("link", { name: /^View on the website/ });
  await expect(site).toHaveAttribute("href", /^https:\/\/www\.demo\.checkwork\.ie\/used-cars\/zztest-draft-/); // the dealer's site (their profile's website), not a page here
  await expect(site).toHaveAttribute("target", "_blank");

  // Hide. Undo in the toast puts it back.
  await page.goto("/stock?q=" + MAKE);
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("button", { name: /^More for/ }).click();
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("button", { name: "Hide" }).click();
  await expect(page.getByTestId("toast")).toContainText("Hid 2020 Zztest Draft");
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("button", { name: /^More for/ }).click();
  await expect(page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("button", { name: "Hide" })).toBeVisible();
});

test("a deposit reserves a car; ending it puts it back; a sale brought back is undone and kept", async ({ page }) => {
  await page.goto("/stock/new");
  await page.getByLabel("Make", { exact: true }).fill(MAKE);
  await page.getByLabel("Model", { exact: true }).fill("Deposit");
  await page.getByLabel("Year", { exact: true }).fill("2019");
  await page.getByLabel("Price (€)", { exact: true }).fill("14000");
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByRole("status")).toContainText("Saved 2019 Zztest Deposit");

  // Take a deposit: the car is Reserved.
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("button", { name: /^More for/ }).click();
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("link", { name: "Reserve" }).click();
  await page.getByLabel("Deposit (€)").fill("500");
  await page.getByLabel("Held until").fill(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  await page.getByLabel("Name", { exact: true }).fill("Sam Reid");
  await page.getByLabel("Phone", { exact: true }).fill("+353 83 000 5555");
  await page.getByRole("button", { name: "Reserve" }).click();
  await expect(page.getByRole("status")).toContainText("Deposit taken");

  // End it, refunded: back on sale.
  await page.goto("/stock?view=reserved&q=" + MAKE);
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("button", { name: /^More for/ }).click();
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("link", { name: "Deposit", exact: true }).click();
  await page.getByRole("button", { name: "End reservation" }).click(); // opens the house dialog (#141)
  await page.getByRole("dialog", { name: "End the reservation?" }).getByRole("button", { name: "End reservation" }).click();
  await page.waitForURL(/\/stock$/);

  // Sell it, then the buyer brings it back: the sale is undone, kept on the car's page, and the car is hidden for a look over.
  await page.goto("/stock?q=" + MAKE);
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("link", { name: "Mark sold" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mark sold");
  await page.getByLabel("Name", { exact: true }).fill("Sam Reid");
  await page.getByLabel("Phone", { exact: true }).fill("+353 83 000 5555");
  await page.getByRole("button", { name: "Mark sold" }).click();
  await expect(page.getByRole("status")).toContainText(/Sale recorded for/);
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("button", { name: /^More for/ }).click();
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("link", { name: "Undo sale" }).click();
  await expect(page.getByText(/within 30 days of the sale/)).toBeVisible();
  await page.getByLabel("Refunded (€)").fill("14000");
  await page.getByLabel("Why it came back").fill("Gearbox fault");
  await page.getByRole("button", { name: "Take it back" }).click();
  await expect(page.getByRole("status")).toContainText("Sale undone for 2019 Zztest Deposit");
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("link").first().click();
  const history = page.getByRole("region", { name: "Deposits and undone sales" });
  await expect(history).toContainText("€14,000 refunded: Gearbox fault");
  await expect(history).toContainText("ended, €500 refunded");
});

test("with the margins permission the cost is saved with the car and shows on the Margins screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 }); // the demo opens as the owner, who has margins
  await page.goto("/stock/new");
  await page.getByLabel("Make", { exact: true }).fill(MAKE);
  await page.getByLabel("Model", { exact: true }).fill("Margin");
  await page.getByLabel("Year", { exact: true }).fill("2021");
  await page.getByLabel("Price (€)", { exact: true }).fill("20000");
  await page.getByLabel("Cost price (€)").fill("16500");
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page).toHaveURL(/\/stock\?saved=/);
  await page.goto("/margins");
  const row = page.getByRole("row", { name: new RegExp(MAKE) });
  await expect(row).toContainText("€16,500");
  await expect(row).toContainText("€3,500"); // 20,000 less 16,500
});


// Add a made-up car and come back to the list (the afterEach deletes it).
async function addCar(page: import("@playwright/test").Page, model: string, price: string) {
  await page.goto("/stock/new");
  await page.getByLabel("Make", { exact: true }).fill(MAKE);
  await page.getByLabel("Model", { exact: true }).fill(model);
  await page.getByLabel("Year", { exact: true }).fill("2021");
  await page.getByLabel("Price (€)", { exact: true }).fill(price);
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByRole("status")).toContainText(`Saved 2021 ${MAKE} ${model}`);
}

test("tick several cars: drop their price at once, then delete them", async ({ page }) => {
  await addCar(page, "Alpha", "10000");
  await addCar(page, "Beta", "20000");
  await page.goto("/stock?q=" + MAKE);
  await page.getByLabel(`Select 2021 ${MAKE} Alpha`).check();
  await page.getByLabel(`Select 2021 ${MAKE} Beta`).check();
  await expect(page.getByText("2 cars selected")).toBeVisible();
  await page.getByRole("button", { name: "Drop the price" }).first().click();
  await page.getByLabel("Drop by").fill("10");
  await page.getByRole("button", { name: "%", exact: true }).click();
  await page.locator("#stock-bulk").getByRole("button", { name: "Drop the price" }).last().click();
  await expect(page.getByRole("dialog")).toContainText("Drop the price of 2 cars by 10%?");
  await page.getByRole("dialog").getByRole("button", { name: "Drop the price" }).click();
  await expect(page.getByText("Price dropped on 2 cars")).toBeVisible();
  await expect(page.getByRole("row", { name: /Alpha/ })).toContainText("€9,000");
  await expect(page.getByRole("row", { name: /Beta/ })).toContainText("was €20,000");

  await page.getByLabel(`Select 2021 ${MAKE} Alpha`).check();
  await page.getByLabel(`Select 2021 ${MAKE} Beta`).check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Deleted 2 cars")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(MAKE) })).toHaveCount(0);
});

// The demo's oldest cars are past its old stock days. Only looked at: applying it would change prices other tests read.
test("old stock: owners see a suggested price and Drop to; sales see neither", async ({ page, context }) => {
  await page.goto("/stock?view=old");
  const drop = page.getByRole("button", { name: /^Drop .+ to €[\d,]+$/ });
  await expect(drop.first()).toBeVisible();
  await expect(page.getByRole("row").filter({ has: drop.first() })).toContainText(/suggested €[\d,]+/);
  await as(context, "Sales");
  await page.goto("/stock?view=old");
  await expect(page.getByRole("row").nth(1)).toBeVisible();
  await expect(drop).toHaveCount(0);
  await expect(page.getByText(/suggested €/)).toHaveCount(0);
});

test("add a car with its photos and battery figures", async ({ page }) => {
  await page.goto("/stock/new");
  await page.getByLabel("Make", { exact: true }).fill(MAKE);
  await page.getByLabel("Model", { exact: true }).fill("Volt");
  await page.getByLabel("Year", { exact: true }).fill("2023");
  await page.getByLabel("Price (€)", { exact: true }).fill("24950");
  await page.getByText("More details (optional)").click(); // folded: the registration lookup fills most of them
  await page.getByLabel("CO2 (g/km)").fill("0");
  await page.getByLabel("Motor tax (€ a year)").fill("120");
  // The battery boxes are for a car with a plug only.
  await expect(page.getByLabel("Battery (kWh)")).toBeHidden();
  await choose(page.getByLabel("Fuel"), "Electric");
  await page.getByLabel("Range (km, WLTP)").fill("410");
  await page.getByLabel("Battery (kWh)").fill("58");
  await page.locator('input[type="file"]').setInputFiles(["public/stock/4710001/1-b1b37b33.webp", "public/stock/4710001/1-b1b37b33.webp"]);
  await expect(page.getByText("2 of 20")).toBeVisible();
  await expect(page.getByText("Main photo")).toBeVisible();
  await page.getByRole("button", { name: "Add car" }).click();
  await expect(page.getByRole("status")).toContainText(`Saved 2023 ${MAKE} Volt`);
  await expect(page.getByRole("link", { name: "Add its photos" })).toHaveCount(0); // it has them
});

test("a car's photos: add one, remove it", async ({ page }) => {
  await addCar(page, "Photo", "15000");
  await page.getByRole("link", { name: "Add its photos" }).click();
  await page.locator('#photos input[type="file"]').setInputFiles("public/stock/4710001/1-b1b37b33.webp");
  await expect(page.getByText("Photo added")).toBeVisible();
  await expect(page.locator("#photos").getByText("Main photo")).toBeVisible();
  // Editing replaces the photo in its place (#125): still one photo, still the main one.
  await page.getByRole("button", { name: "Crop and rotate photo 1" }).click();
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await page.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Photo saved")).toBeVisible();
  await expect(page.locator("#photos").getByText("Main photo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove photo 1" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Remove photo 2" })).toHaveCount(0);

  await page.goto("/stock?q=" + MAKE);
  await page.getByRole("row", { name: new RegExp(MAKE) }).getByRole("link").first().click();
  await page.getByRole("button", { name: "Remove photo 1" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("#photos").getByText("Main photo")).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });

  test("the stock list has photos and no tick boxes until Select; the car page opens on its price and Save follows a change", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByRole("link", { name: /Need photos/ })).toHaveCount(0); // To do links to it
    const first = page.getByRole("row").nth(1);
    await expect(first.locator("img")).toBeVisible();
    await expect(first.getByRole("checkbox")).toBeHidden();
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await first.getByRole("checkbox").check();
    await expect(page.getByText("1 car selected")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(first.getByRole("checkbox")).toBeHidden();
    await expect(page.getByText("1 car selected")).toBeHidden();

    await first.getByRole("link").first().click();
    await expect(page.locator("form section").first()).toContainText("Price (€)");
    await expect(page.getByLabel("Mileage (km)")).toBeHidden(); // folded under Details
    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).not.toBeInViewport();
    await page.getByLabel("Earlier price (€)").fill("1");
    await expect(save).toBeInViewport();

    // A message in a fold always shows: a bad mileage opens Details on Save, and again on the next Save after Details is closed.
    const details = page.locator("#details");
    await details.getByText("Details", { exact: true }).click();
    await page.getByLabel("Mileage (km)").fill("-5");
    await save.click();
    await expect(details.getByRole("alert")).toBeVisible();
    await details.getByText("Details", { exact: true }).click();
    await expect(details.getByRole("alert")).toBeHidden();
    await save.click();
    await expect(details.getByRole("alert")).toBeVisible();
  });
});
