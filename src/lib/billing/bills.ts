import "server-only";
import { defineCollection } from "@/lib/admin/docs";
import { dublinDay } from "@/lib/admin/format";
import { getSettings } from "@/lib/admin/collections";
import { MODULE_IDS } from "@/lib/modules-rules";
import { enabledModules } from "@/lib/modules";
import { billingSettings } from "./usage";
import { usageLines, type Bill, type BillingDetails } from "./bills-rules";
import { BILLING_DEFAULT, allowanceFor, planLines, type Service } from "./rules";
import { currentDealer } from "@/lib/tenancy/current";
import { addressText } from "@/lib/tenancy/profile";

// The dealer's past bills, one record each, kept as what they were made of (bills-rules.ts itemise). On a real site the billing program
// issues them and emails the PDF (#62); the demo seeds a year, and shows no download because the invoice comes from the payment provider.
// "bills-v2": bills stored by builds before the tiers had other plan lines and a discount, so they start again.
export const billsStore = defineCollection<Bill>("bills-v2", seedBills);

export async function listBills(): Promise<Bill[]> {
  const shown = await asShown();
  return (await billsStore.list()).map(shown).sort((a, b) => b.id.localeCompare(a.id));
}
export async function getBill(id: string): Promise<Bill | undefined> {
  const bill = await billsStore.get(id);
  return bill && (await asShown())(bill);
}
// A demo dealer's bills follow the plan the demo bar shows now, so the Bills tab never disagrees with the Plan tab. A real dealer's are as issued.
async function asShown(): Promise<(bill: Bill) => Bill> {
  if (!(await currentDealer()).demo) return (bill) => bill;
  const [modules, b] = await Promise.all([enabledModules(), billingSettings()]);
  const allowance = allowanceFor(modules, b);
  return (bill) => ({ ...bill, modules: planLines(modules, b, bill.id), usage: usageLines(bill.usage, allowance) });
}

export async function billingDetails(): Promise<BillingDetails> {
  const [s, { name, profile }] = await Promise.all([getSettings(), currentDealer()]);
  return s.billingDetails ?? { company: name, vatNumber: "", address: addressText(profile.address), email: profile.email };
}

// A year of the demo: the last twelve months. A bill is due the day it is issued, by direct debit, so only one issued today is still due. Use grows a little each month.
function seedBills(): Bill[] {
  const today = dublinDay();
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const allowance = allowanceFor(MODULE_IDS, BILLING_DEFAULT);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 2 - i, 1)); // i = 0 is last month
    const id = d.toISOString().slice(0, 7);
    const issuedOn = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    const grow = 12 - i; // older months used less
    const counts: { service: Service; kind: string; count: number }[] = [
      { service: "lookup", kind: "website", count: 20 + grow * 4 },
      { service: "lookup", kind: "dashboard", count: 10 + grow * 2 },
      { service: "ai", kind: "opus", count: 30 + grow * 6 },
      { service: "ai", kind: "sonnet", count: 20 + grow * 4 },
      { service: "whatsapp", kind: "alert", count: 60 + grow * 8 },
      { service: "whatsapp", kind: "reply", count: 40 + grow * 5 },
      { service: "whatsapp", kind: "marketing", count: i % 3 === 0 ? 40 : 0 },
    ];
    return { id, issuedOn, dueOn: issuedOn, status: issuedOn < today ? "paid" : "due", modules: planLines(MODULE_IDS, BILLING_DEFAULT, id), usage: usageLines(counts, allowance) }; // every module: Website + Dashboard and Social
  });
}
