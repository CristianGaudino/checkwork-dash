"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/admin/activity";
import { alertsStore } from "@/lib/admin/collections";
import { pauseAlert } from "@/lib/admin/customers-stop";
import { requireStaff } from "@/lib/staff";

// Consent only goes one way here: staff can stop an alert (the person asked, by phone or in person), never start one
// again. Only the person can sign up again, on the website. Restarting it for them would send marketing they did not agree to.

export async function pauseAlertAction(id: string) {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  await pauseAlert(id);
  revalidatePath("/customers");
}

export async function removeAlertAction(id: string) {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  if (!(await alertsStore.get(id))) return;
  await alertsStore.remove(id);
  await logActivity("customers", "Removed a stock alert", { kind: "alert", id });
  revalidatePath("/customers");
}
