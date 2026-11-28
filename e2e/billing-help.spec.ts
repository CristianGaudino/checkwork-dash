import { expect, test } from "@playwright/test";
import { as, notForRole } from "./open";

// Last month: the seed always holds its bill (src/lib/billing/bills.ts).
const lastMonth = (() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); })();

// Billing is for the owner and manager; Help is for everyone. The demo bar's role is a cookie (see admin-margins.spec.ts).

// Three plans (#212), each all-inclusive: the demo is on Website + Dashboard at EUR 249 a month, with its allowance and pay as you go past
// it. No add-ons, no setup fee. The limits are set in Settings.
test("the owner sees their plan, its allowance and pay as you go, and opens a bill", async ({ page }) => {
  await page.goto("/billing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Billing");
  const bill = page.getByRole("region", { name: "This month's bill" });
  await expect(bill.getByRole("term").filter({ hasText: /^Website \+ Dashboard plan$/ })).toBeVisible();
  await expect(bill.getByRole("definition").filter({ hasText: /^€249$/ })).toBeVisible();
  await expect(bill.getByText("Pay as you go, by month end")).toBeVisible();
  await expect(bill).toContainText("no setup fee");
  for (const old of ["Social and ads plan", "Ask us to add", "Add to my plan"]) await expect(page.getByText(old)).toHaveCount(0);
  await expect(page.getByText("Estimate").first()).toBeVisible();
  // Pay as you go: each paid service with what the plan includes; no AI writing price, no alerts.
  const payg = page.getByRole("region", { name: "Pay as you go" });
  await expect(payg.getByRole("row").filter({ hasText: "Registration lookup" })).toContainText("100 lookups included a month");
  await expect(payg.getByRole("row").filter({ hasText: "WhatsApp" })).toContainText("500 alerts included a month");
  await expect(payg.getByRole("row").filter({ hasText: "History check" })).not.toContainText("included");
  await expect(payg.getByRole("row").filter({ hasText: "AI writing" })).toHaveCount(0);
  await expect(page.getByText("80%")).toHaveCount(0);
  // The limits are not edited here: Change limits goes to Settings.
  await expect(page.getByRole("button", { name: "Edit monthly limits" })).toHaveCount(0);
  await expect(payg.getByRole("link", { name: "Change limits" })).toHaveAttribute("href", "/settings?section=limits");

  // The bills, on the same page: this month first, as an estimate; last month is the latest bill.
  const bills = page.getByRole("region", { name: "Bills" });
  await expect(bills.getByText("Invoices are emailed as PDFs when each bill is issued.")).toBeVisible();
  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
  await expect(bills.getByRole("table").getByText("Estimate")).toBeVisible();
  await bills.getByRole("table").getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bill for");
  await expect(page.getByText("Website + Dashboard plan")).toBeVisible();
  await expect(page.getByText("VAT at 23%")).toBeVisible();
});

test("the owner sets the monthly limits in Settings, never above ours, and Billing shows them", async ({ page }) => {
  await page.goto("/billing");
  await page.getByRole("region", { name: "Pay as you go" }).getByRole("link", { name: "Change limits" }).click();
  await expect(page).toHaveURL(/\/settings\?section=limits$/);
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Monthly limits", exact: true })).toHaveAttribute("aria-current", "page");
  // What the plan includes, in Billing's words: alerts, not every WhatsApp message.
  const panel = page.getByRole("region", { name: "Monthly limits" });
  await expect(panel.getByRole("row").filter({ hasText: "WhatsApp" })).toContainText("500 alerts included");
  await expect(panel.getByRole("row").filter({ hasText: "Registration lookup" })).toContainText("100 lookups included");
  // Read first; Edit opens the limits in the house dialog (#141).
  const limits = page.getByRole("dialog", { name: "Monthly limits" });
  const edit = async () => (await page.getByRole("button", { name: "Edit monthly limits" }).click(), limits);
  // WhatsApp: the other specs' alerts are inside the allowance, so a limit here never stops them on the same server.
  await (await edit()).getByLabel("WhatsApp limit (€ a month)").fill("12.50");
  await expect(limits.getByLabel("All usage limit (€ a month)")).toHaveCount(0);
  await expect(limits.getByLabel("AI writing limit (€ a month)")).toHaveCount(0);
  await limits.getByRole("button", { name: "Save" }).click();
  await expect(limits).toBeHidden();
  await expect(page.getByTestId("toast")).toContainText("Limits saved");
  await page.reload();
  await expect((await edit()).getByLabel("WhatsApp limit (€ a month)")).toHaveValue("12.5");
  // Never above ours: EUR 15 of lookups by default.
  await limits.getByLabel("Registration lookup limit (€ a month)").fill("16");
  await limits.getByRole("button", { name: "Save" }).click();
  await expect(limits.getByText("Our limit for your account is €15")).toBeVisible();
  page.once("dialog", (d) => d.accept()); // the changes not saved: leave them
  await limits.getByRole("button", { name: "Cancel" }).click();
  await expect(limits).toBeHidden();
  // Billing shows the limit set here, and links back.
  await page.getByRole("region", { name: "Monthly limits" }).getByRole("link", { name: "Billing", exact: true }).click();
  await expect(page.getByRole("region", { name: "Pay as you go" }).getByRole("row").filter({ hasText: "WhatsApp" })).toContainText("€12.50");
});

// A dealer that is not a demo has every paid service to limit, and a EUR 0 limit is a real choice: nothing paid goes through.
test("at a dealer that is not a demo, the owner sets a EUR 0 limit on history checks in Settings", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "checkwork-dealer", value: "test-motors", url: baseURL! }]);
  await page.goto("/settings?section=limits");
  await page.getByRole("button", { name: "Edit monthly limits" }).click();
  const limits = page.getByRole("dialog", { name: "Monthly limits" });
  await limits.getByLabel("History check limit (€ a month)").fill("0");
  await limits.getByRole("button", { name: "Save" }).click();
  await expect(limits).toBeHidden();
  await expect(page.getByTestId("toast")).toContainText("Limits saved");
  await page.reload();
  const row = page.getByRole("region", { name: "Monthly limits" }).getByRole("row").filter({ hasText: "History check" });
  await expect(row.getByRole("cell", { name: "€0", exact: true })).toBeVisible(); // the limit
  await page.goto("/billing");
  await expect(page.getByRole("region", { name: "This month's bill" }).getByRole("term").filter({ hasText: /^Dashboard plan$/ })).toBeVisible(); // a dealer with nothing set is on the dashboard plan
  await expect(page.getByRole("region", { name: "This month's bill" }).getByRole("definition").filter({ hasText: /^€149$/ })).toBeVisible();
  const billed = page.getByRole("region", { name: "Pay as you go" }).getByRole("row").filter({ hasText: "History check" });
  await expect(billed.getByRole("cell", { name: "€0", exact: true })).toHaveCount(2); // spent and the limit
});

test("sales has no Monthly limits in Settings", async ({ page, context }) => {
  await as(context, "Sales");
  await page.goto("/settings?section=limits");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Monthly limits" })).toHaveCount(0);
});

test("sales has no Billing page: it says who it is for", async ({ page, context }) => {
  await as(context, "Sales");
  await notForRole(page, "/billing", "Your plan, this month");
  expect((await page.request.get(`/billing/${lastMonth}`)).status()).toBe(404); // a bill is for the owner and manager too
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
