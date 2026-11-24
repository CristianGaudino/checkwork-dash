"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/admin/activity";
import { leadsStore } from "@/lib/admin/collections";
import { fmtEur } from "@/lib/admin/format";
import { requireStaff } from "@/lib/staff";
import { readLead } from "@/lib/leads/lead-text";
import { CAR_CONDITIONS, CAR_LABELS } from "./car";

export type CarState = { saved?: true; errors?: Record<string, string> } | undefined;

const digits = (v: FormDataEntryValue | null) => String(v ?? "").replace(/[\s,€km]/gi, "");
const text = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// The car a person wants to sell or trade in (#137): its plate, what it is, its mileage and condition, and what they are asking. Kept with the
// form's own answers (`details`, label to value as read), so a site lead's Make, Model, Year and Mileage are the same facts. Empty clears one.
export async function saveTheirCarAction(id: string, _: CarState, data: FormData): Promise<CarState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const errors: Record<string, string> = {};
  const reg = text(data.get("reg"), 12).toUpperCase();
  if (reg && !/^[A-Z0-9][A-Z0-9 -]*$/.test(reg)) errors.reg = "Letters, numbers and dashes only";
  const year = digits(data.get("year"));
  const thisYear = new Date().getFullYear();
  if (year && !(/^\d{4}$/.test(year) && +year >= 1950 && +year <= thisYear + 1)) errors.year = `A year from 1950 to ${thisYear + 1}`;
  const km = digits(data.get("mileage"));
  if (km && !(/^\d{1,7}$/.test(km) && +km <= 2_000_000)) errors.mileage = "Kilometres, in figures";
  const asking = digits(data.get("asking"));
  if (asking && !(/^\d{1,7}$/.test(asking) && +asking <= 1_000_000)) errors.asking = "Euro, in figures";
  const condition = String(data.get("condition") ?? "");
  if (condition && !(CAR_CONDITIONS as readonly string[]).includes(condition)) errors.condition = "Choose one from the list";
  if (Object.keys(errors).length) return { errors };
  const values: Record<keyof typeof CAR_LABELS, string> = {
    make: text(data.get("make"), 40),
    model: text(data.get("model"), 60),
    year,
    mileage: km && `${Number(km).toLocaleString("en-IE")} km`,
    condition,
    asking: asking && fmtEur(Number(asking)),
  };
  const done = await leadsStore.update(id, (l) => {
    // A site lead stored before #59 has no details, its answers glued to its message: they become details and the message its words, so none is lost.
    const old = l.details === undefined ? readLead(l) : undefined;
    const details = { ...(l.details ?? old!.facts) };
    for (const [field, v] of Object.entries(values)) {
      // Only the boxes the form had: a lead that is not selling has no Condition or Asking price, so a value the site wrote stays.
      if (!data.has(field)) continue;
      const label = CAR_LABELS[field as keyof typeof CAR_LABELS];
      if (v) details[label] = v;
      else delete details[label];
    }
    return { ...l, ...(old && { message: old.text }), reg: reg || undefined, details };
  });
  if (!done) return { errors: { reg: "This lead is gone." } };
  await logActivity("leads", "Updated the car they have", { kind: "lead", id });
  revalidatePath(`/leads/${id}`);
  return { saved: true };
}
