import { expect, test } from "@playwright/test";
import { as } from "./open";

// WhatsApp (#178) is a way alerts reach a person (#142): its column in Notifications, the live demo under it, and the dealership's
// number and use in Connected services. The old page sends each role to where it now lives.
const tryIt = async (page: import("@playwright/test").Page) => {
  await page.goto("/settings?section=emails");
  await page.getByText("Try WhatsApp", { exact: true }).click();
  return page.getByRole("region", { name: "Your WhatsApp" });
};

test("the old WhatsApp page sends owners to Connected services and Sales to their notifications; it is gone from the menu", async ({ page, context }) => {
  await page.goto("/whatsapp");
  await expect(page).toHaveURL(/section=services/);
  await expect(page.getByRole("region", { name: "WhatsApp", exact: true })).toContainText("Connected");
  await expect(page.locator("aside").getByRole("link", { name: "WhatsApp", exact: true })).toHaveCount(0);
  await as(context, "Sales");
  await page.goto("/whatsapp");
  await expect(page).toHaveURL(/section=emails/);
});

test("the conversation shows under Notifications, with the buttons under an alert", async ({ page }) => {
  const phone = await tryIt(page);
  await expect(phone.getByText(/wants (to sell their car|a price for a trade-in)/).first()).toBeVisible();
  await expect(phone.getByRole("button", { name: "Reply with a price" })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Yes, it's available" }).first()).toBeVisible();
});

test("reply with a price: the lead gets the offer, and the buyer answers", async ({ page }) => {
  const phone = await tryIt(page);
  await phone.getByRole("button", { name: "Reply with a price" }).click();
  await expect(phone.getByText(/What price do you want to offer/)).toBeVisible();
  await phone.getByLabel("Message").fill("nonsense");
  await phone.getByRole("button", { name: "Send" }).click();
  await expect(phone.getByText(/could not read that as a price/)).toBeVisible();
  await phone.getByLabel("Message").fill("€8.5k");
  await phone.getByRole("button", { name: "Send" }).click();
  await expect(phone.getByText(/I sent .* your offer of €8,500 by WhatsApp/)).toBeVisible();
  const buyer = page.getByRole("region", { name: "The buyer's WhatsApp" });
  await expect(buyer.getByText(/can offer you €8,500/)).toBeVisible();
  // The answer comes back a few seconds later, on both phones.
  await expect(buyer.getByText(/That sounds good/)).toBeVisible({ timeout: 20_000 });
  await expect(phone.getByText(/replied: "That sounds good/)).toBeVisible({ timeout: 20_000 });
  await phone.getByRole("link", { name: "Open" }).last().click();
  await expect(page.getByText("Offer sent by WhatsApp: €8,500").first()).toBeVisible();
});

test("Finance has no WhatsApp: no column and no demo", async ({ page, context }) => {
  await as(context, "Finance");
  await page.goto("/settings?section=emails");
  await expect(page.getByText("Try WhatsApp", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "What reaches you" })).not.toContainText("WhatsApp");
});
