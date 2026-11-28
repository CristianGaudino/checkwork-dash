"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/admin/activity";
import { SETTINGS_DEFAULT, settingsStore, type DealerSettings } from "@/lib/admin/collections";
import { can, currentMember } from "@/lib/permissions";
import { fieldErrors } from "@/lib/admin/validation";
import { tooLong } from "@/lib/leads/constants";
import { billingSettings, saveBilling } from "@/lib/billing/usage";
import { eur, parseLimits } from "@/lib/billing/bills-rules";
import { PAID, SERVICE_LABELS } from "@/lib/billing/rules";
import { requireStaff } from "@/lib/staff";

export type BillingState = { errors?: Record<string, string>; saved?: boolean } | undefined;
const NO = "Only an owner or manager can change this";
// The limits are set in Settings, Monthly limits, and Billing shows them beside what is spent.
const done = (): BillingState => (revalidatePath("/billing"), revalidatePath("/settings"), { saved: true });

export async function saveLimitsAction(_p: BillingState, data: FormData): Promise<BillingState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  if (!(await can("billing"))) return { errors: { form: NO } };
  const [b, scopes] = [await billingSettings(), PAID];
  const { caps, errors } = parseLimits((k) => String(data.get(k) ?? ""), b.ceilings, scopes);
  if (Object.keys(errors).length) return { errors };
  const next = { ...b.caps };
  for (const s of scopes) delete next[s];
  Object.assign(next, caps);
  // The form shows a stored limit above our ceiling as the ceiling (BillingForms): saved untouched, the stored one stays.
  for (const s of scopes) if (b.caps[s] !== undefined && next[s] === Math.min(b.caps[s]!, b.ceilings[s] ?? Infinity)) next[s] = b.caps[s];
  for (const s of scopes) if (b.caps[s] !== next[s]) await logActivity("settings", next[s] === undefined ? `Removed the monthly limit on ${SERVICE_LABELS[s]}` : `Set the monthly limit on ${SERVICE_LABELS[s]} to ${eur(next[s]!)}`);
  await saveBilling({ caps: next });
  return done();
}

// Billing details are the Owner's to change: they say who the bills are made out to.
const details = z.object({
  company: z.string().trim().min(1, "Enter the company name").max(100, tooLong(100)),
  vatNumber: z.string().trim().max(20, tooLong(20)),
  address: z.string().trim().min(1, "Enter the billing address").max(200, tooLong(200)),
  email: z.email("Enter a valid email").max(120, tooLong(120)),
});
export async function saveDetailsAction(_p: BillingState, data: FormData): Promise<BillingState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  if ((await currentMember()).role !== "Owner") return { errors: { company: "Only the owner can change the billing details" } };
  const r = details.safeParse(Object.fromEntries(data));
  if (!r.success) return { errors: fieldErrors(r.error) };
  const apply = (s: Partial<DealerSettings>) => ({ ...SETTINGS_DEFAULT, ...s, billingDetails: r.data, updatedAt: Date.now() });
  if (!(await settingsStore.update("dealer", apply))) await settingsStore.put(apply({})); // never over a change saved meanwhile
  await logActivity("settings", "Changed the billing details");
  return done();
}
