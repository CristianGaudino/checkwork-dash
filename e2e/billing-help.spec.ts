import { expect, test } from "@playwright/test";
import { as, notForRole } from "./open";

// Last month: the seed always holds its bill (src/lib/billing/bills.ts).
const lastMonth = (() => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7); })();

// Billing is for the owner and manager; Help is for everyone. The demo bar's role is a cookie (see admin-margins.spec.ts).

test("the owner sees the plan and this month's bill, sets a limit, and opens a bill", async ({ page }) => {
  await page.goto("/billing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Billing");
  await expect(page.getByText("Website + Dashboard plan").first()).toBeVisible(); // the demo has every module
  await expect(page.getByText("Estimate").first()).toBeVisible();
  // One limit per paid service: nothing for all usage, no alerts and no AI writing price.
  await expect(page.getByRole("button", { name: "Add an alert" })).toHaveCount(0);
  await expect(page.getByText("80%")).toHaveCount(0);

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

  // The bills, on the same page: this month first, as an estimate; last month is the latest bill.
  const bills = page.getByRole("region", { name: "Bills" });
  await expect(bills.getByText("Invoices are emailed as PDFs when each bill is issued.")).toBeVisible();
  await expect(page.getByRole("link", { name: /download/i })).toHaveCount(0);
  await expect(bills.getByRole("table").getByText("Estimate")).toBeVisible();
  await bills.getByRole("table").getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bill for");
  await expect(page.getByText("VAT at 23%")).toBeVisible();
});

// One system (#212): every paid service is there to limit before its first charge, even on a stored plan of the dashboard alone (Test
// Motors'), while the plan and its price stay the stored plan's. A EUR 0 limit is a real choice: nothing paid goes through.
test("on a stored plan of the dashboard alone, the owner sets a EUR 0 limit on history checks", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "checkwork-dealer", value: "test-motors", url: baseURL! }]);
  await page.goto("/billing");
  await expect(page.getByText("Website + Dashboard plan")).toHaveCount(0); // the stored plan's price, not every module's
  await page.getByRole("button", { name: "Edit monthly limits" }).click();
  const limits = page.getByRole("dialog", { name: "Monthly limits" });
  await limits.getByLabel("History check limit (€ a month)").fill("0");
  await limits.getByRole("button", { name: "Save" }).click();
  await expect(limits).toBeHidden();
  await expect(page.getByTestId("toast")).toContainText("Limits saved");
  await page.reload();
  const row = page.getByRole("region", { name: "Monthly limits" }).getByRole("row").filter({ hasText: "History check" });
  await expect(row.getByRole("cell", { name: "€0", exact: true })).toHaveCount(2); // spent and the limit
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
