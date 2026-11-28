"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/admin/activity";
import { leadsStore, salesStore } from "@/lib/admin/collections";
import { adminCar } from "@/lib/admin/stock-admin";
import { recordUsage, usageAllowed } from "@/lib/billing/usage";
import { carHistoryStore, checkHistory, type HistoryAnswer } from "@/lib/history";
import { requireStaff } from "@/lib/staff";
import { fmtDate } from "@/lib/admin/format";

const SAYS: Record<Extract<HistoryAnswer, { error: string }>["error"], string> = {
  "bad-reg": "That registration is not an Irish one. Check it and try again.",
  off: "History checks are not connected.",
  limited: "The monthly limit for history checks is reached.",
  unknown: "No history found for this registration.",
  failed: "The history could not be checked. Try again later.",
};

// Check history (#170) for a car in stock, a trade-in or sell lead's car, or a recorded sale's trade-in (by the sale's id, the car's). The
// plate is read from the record on the server, never taken from the browser. Everyone on the dashboard may run it, as the lookup. The answer is kept on the record with the day it was checked. A plate checked in the last 30 days comes from the
// cache, free, with its first day, and the toast says so (ActButton shows a returned `error` in place of its done text).
export async function checkHistoryAction(of: "car" | "lead" | "sale", id: string): Promise<{ error?: string }> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  if (typeof id !== "string" || id.length > 80) return { error: SAYS.failed };
  const car = of === "car" ? await adminCar(id) : undefined;
  const lead = of === "lead" ? await leadsStore.get(id) : undefined;
  const reg = car?.reg ?? lead?.reg ?? (of === "sale" ? (await salesStore.get(id))?.tradeIn?.reg : undefined);
  if (!reg) return { error: "Add the registration first." };
  const r = await checkHistory(reg, { allowed: () => usageAllowed("history"), paid: () => recordUsage("history", "dashboard") });
  if ("error" in r) return { error: SAYS[r.error] };
  const { history, cached } = r;
  if (car) await carHistoryStore.put({ id, history });
  else if (lead) await leadsStore.update(id, (l) => ({ ...l, history }));
  else await salesStore.update(id, (s) => (s.tradeIn ? { ...s, tradeIn: { ...s.tradeIn, history } } : s));
  await logActivity(lead ? "leads" : "stock", of === "sale" ? "Checked the trade-in's history" : "Checked the car's history", lead ? { kind: "lead", id } : { kind: "car", id });
  revalidatePath(lead ? `/leads/${id}` : `/stock/${id}`);
  return cached ? { error: `Already checked on ${fmtDate(history.checkedOn)}. A check is kept for 30 days.` } : {};
}
