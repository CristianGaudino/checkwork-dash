import { expect, test } from "@playwright/test";
import { as, notForRole } from "./open";
import { SHOW_PRICING } from "@/lib/billing/rules";

// Last month: the seed always holds its bill (src/lib/billing/bills.ts).
const lastMonth = (() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); })();

// Billing is for the owner and manager; Help is for everyone. The demo bar's role is a cookie (see admin-margins.spec.ts).

test("the owner sees the plan, sets a limit and an alert, and opens a bill", async ({ page }) => {
  test.skip(!SHOW_PRICING, "pricing is hidden for now (SHOW_PRICING)");
  await page.goto("/billing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Billing");
  await expect(page.getByText("Group plan").first()).toBeVisible();
  await expect(page.getByText("Estimate").first()).toBeVisible();

  await page.getByRole("link", { name: "Limits", exact: true }).click();
  // Read first; Edit opens the limits in the house dialog (#141).
  const limits = page.getByRole("dialog", { name: "Monthly limits" });
  const edit = async () => (await page.getByRole("button", { name: "Edit monthly limits" }).click(), limits);
  // WhatsApp: the other specs' alerts are inside the allowance, so a limit here never stops them on the same server.
  await (await edit()).getByLabel("WhatsApp limit (€ a month)").fill("12.50");
  await limits.getByRole("button", { name: "Save" }).click();
  await expect(limits).toBeHidden();
  await expect(page.getByTestId("toast")).toContainText("Limits saved");
  await page.reload();
  await expect((await edit()).getByLabel("WhatsApp limit (€ a month)")).toHaveValue("12.5");
  // Never above ours: EUR 15 of lookups by default.
  await limits.getByLabel("Registration lookup limit (€ a month)").fill("16");
  await limits.getByRole("button", { name: "Save" }).click();
  await expect(limits.getByText("Our limit for your account is €15")).toBeVisible();
  await limits.getByLabel("Registration lookup limit (€ a month)").fill("");
  await limits.getByLabel("All usage limit (€ a month)").fill("151");
  await limits.getByRole("button", { name: "Save" }).click();
  await expect(limits.getByText("Our limit for your account is €150")).toBeVisible();
  page.once("dialog", (d) => d.accept()); // the changes not saved: leave them
  await limits.getByRole("button", { name: "Cancel" }).click();
  await expect(limits).toBeHidden();

  await page.getByRole("button", { name: "Add an alert" }).click();
  const alert = page.getByRole("dialog", { name: "Add an alert" });
  await alert.getByLabel("passes (€)").fill("33");
  await alert.getByRole("button", { name: "Add alert" }).click();
  await expect(page.getByText("passes €33")).toBeVisible();

  await page.goto("/billing?section=bills");
  await expect(page.getByText("Invoices are emailed as PDFs when each bill is issued.")).toBeVisible();
  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
  // This month comes first, as an estimate; last month is the latest bill.
  await expect(page.getByRole("table").getByText("Estimate")).toBeVisible();
  await page.getByRole("table").getByRole("link").nth(1).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bill for");
  await expect(page.getByText("VAT at 23%")).toBeVisible();
});

test("with our prices hidden, the owner still has Billing: the plan and its modules, AI writing and the details, and no euro anywhere", async ({ page }) => {
  test.skip(SHOW_PRICING, "only while pricing is hidden");
  await page.goto("/billing");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: /^Your plan: / })).toBeVisible();
  await expect(main.getByRole("button", { name: "Premium" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Billing details" })).toBeVisible();
  await expect(main).not.toContainText("€");
  expect((await page.request.get(`/billing/${lastMonth}`)).status()).toBe(404);
});

test("sales has no Billing page: it says who it is for", async ({ page, context }) => {
  await as(context, "Sales");
  await notForRole(page, "/billing", "Your plan, this month");
  expect((await page.request.get(`/billing/${lastMonth}`)).status()).toBe(404); // a bill is hidden for now (SHOW_PRICING)
});

test("a help request is sent and shows in the list with its page", async ({ page, context }) => {
  await as(context, "Sales");
  // A link from a page (as Billing's) says which page it came from; the menu's Help says none.
  await page.goto("/help?from=%2Fstock");
  await expect(page.getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:+35319060099");
  const text = `Where do I change a price ${Date.now()}`;
  await page.getByLabel("Your message").fill(text);
  await page.getByRole("button", { name: "Send" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Sent" })).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: text });
  await expect(item).toContainText("Received");
  await expect(item).toContainText("From Stock");
});

// Help's how-to (#143): one topic per job, closed until opened, a #link opens its topic, and each role sees only its own.
test("help topics open on their own and from a link, and only the role's own are there", async ({ page, context }) => {
  await page.goto("/help#whatsapp-alerts");
  const alerts = page.locator("details#whatsapp-alerts");
  await expect(alerts).toHaveAttribute("open", "");
  await expect(alerts.getByText(/^A car \d+ days in stock:/)).toBeVisible(); // the dealer's days, not "{days}"
  const lead = page.locator("details#answer-lead");
  await expect(lead.getByText("Set the status to Contacted so the team knows.")).toBeHidden();
  await lead.getByText("Answer a new lead").click();
  await expect(lead.getByText("Set the status to Contacted so the team knows.")).toBeVisible();
  await expect(page.getByText("Your plan and bills")).toBeVisible();

  await as(context, "Sales");
  await page.goto("/help");
  await expect(page.getByText("Get new leads on WhatsApp")).toBeVisible();
  for (const t of ["See what each car makes", "Add someone to your team", "Your plan and bills"]) await expect(page.getByText(t)).toHaveCount(0);

  await as(context, "Finance");
  await page.goto("/help");
  await expect(page.getByText("See what each car makes")).toBeVisible();
  for (const t of ["Answer a new lead", "Your plan and bills", "Get new leads on WhatsApp"]) await expect(page.getByText(t)).toHaveCount(0); // no WhatsApp for Finance (#142)

  await page.goto("/help#%zz"); // a broken #link is ignored, not an error page
  await expect(page.getByText("See what each car makes")).toBeVisible();
});
