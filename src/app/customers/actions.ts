"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/admin/activity";
import { alertsStore } from "@/lib/admin/collections";
import { pauseAlert, unsubscribeSubscriber } from "@/lib/admin/customers-stop";
import { requireModule } from "@/lib/modules";
import { requireStaff } from "@/lib/staff";

// Consent only goes one way here: staff can stop an alert or the newsletter (the person asked, by phone or in person), never start one
// again. Only the person can sign up again, on the website. Restarting it for them would send marketing they did not agree to.

export async function pauseAlertAction(id: string) {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  await requireModule("newsletter"); // alerts and the newsletter are the newsletter module, where visitors sign up (#173)
  await pauseAlert(id);
  revalidatePath("/customers");
}

export async function removeAlertAction(id: string) {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  await requireModule("newsletter"); // alerts and the newsletter are the newsletter module, where visitors sign up (#173)
  if (!(await alertsStore.get(id))) return;
  await alertsStore.remove(id);
  await logActivity("customers", "Removed a stock alert", { kind: "alert", id });
  revalidatePath("/customers");
}

export async function unsubscribeAction(id: string) {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  await requireModule("newsletter"); // alerts and the newsletter are the newsletter module, where visitors sign up (#173)
  await unsubscribeSubscriber(id);
  revalidatePath("/customers");
}
