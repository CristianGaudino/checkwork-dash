import "server-only";
import { defineCollection } from "@/lib/admin/docs";
import { dublinDay } from "@/lib/admin/format";
import { getSettings } from "@/lib/admin/collections";
import { billingSettings, currentPlan } from "./usage";
import { usageLines, type Bill, type BillingDetails } from "./bills-rules";
import { BILLING_DEFAULT, PLANS, planLines, type Service } from "./rules";
import { currentDealer } from "@/lib/tenancy/current";
import { addressText } from "@/lib/tenancy/profile";

// The dealer's past bills, one record each, kept as what they were made of (bills-rules.ts itemise). On a real site the billing program
// issues them and emails the PDF (#62); the demo seeds a year, and shows no download because the invoice comes from the payment provider.
// "bills-v2": bills stored by older builds had plan lines from earlier pricing, so they start again.
export const billsStore = defineCollection<Bill>("bills-v2", seedBills);

export async function listBills(): Promise<Bill[]> {
  const shown = await asShown();
  return (await billsStore.list()).map(shown).sort((a, b) => b.id.localeCompare(a.id));
}
export async function getBill(id: string): Promise<Bill | undefined> {
  const bill = await billsStore.get(id);
  return bill && (await asShown())(bill);
}
// A demo dealer's bills follow its plan today, as this month's does. A real dealer's are as issued.
async function asShown(): Promise<(bill: Bill) => Bill> {
  if (!(await currentDealer()).demo) return (bill) => bill;
  const [b, plan] = await Promise.all([billingSettings(), currentPlan()]);
  return ({ modules: _, ...bill }) => ({ ...bill, plan: planLines(plan, b, bill.id), usage: usageLines(bill.usage, PLANS[plan].allowance) });
}

export async function billingDetails(): Promise<BillingDetails> {
  const [s, { name, profile }] = await Promise.all([getSettings(), currentDealer()]);
  return s.billingDetails ?? { company: name, vatNumber: "", address: addressText(profile.address), email: profile.email };
}

// A year of the demo: the last twelve months. A bill is due the day it is issued, by direct debit, so only one issued today is still due. Use grows a little each month.
function seedBills(): Bill[] {
  const today = dublinDay();
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 2 - i, 1)); // i = 0 is last month
    const id = d.toISOString().slice(0, 7);
    const issuedOn = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const grow = 12 - i; // older months used less
    const counts: { service: Service; kind: string; count: number }[] = [
      { service: "lookup", kind: "dashboard", count: 30 + grow * 6 },
      { service: "ai", kind: "opus", count: 30 + grow * 6 },
      { service: "ai", kind: "sonnet", count: 20 + grow * 4 },
      { service: "whatsapp", kind: "alert", count: 60 + grow * 8 },
      { service: "whatsapp", kind: "reply", count: 40 + grow * 5 },
      { service: "whatsapp", kind: "marketing", count: i % 3 === 0 ? 40 : 0 },
    ];
    return { id, issuedOn, dueOn: issuedOn, status: issuedOn < today ? "paid" : "due", plan: planLines("both", BILLING_DEFAULT, id), usage: usageLines(counts, PLANS.both.allowance) }; // the demo's plan
  });
}
