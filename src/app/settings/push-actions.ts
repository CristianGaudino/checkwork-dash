"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/admin/activity";
import { deviceLabel, pushId, pushStore, validSub, vapid } from "@/lib/push";
import { requireStaff, staffIdentity } from "@/lib/staff";

// Notifications on your own devices (#11): anyone on the team, for themselves only. The person is the one signed in, never what the page
// sends. The activity history says a device was turned on or off, never its endpoint.
const signedIn = async () => {
  const who = await staffIdentity();
  return who.ok ? who.email : "";
};

export async function turnOnPushAction(sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }): Promise<{ id?: string; error?: string }> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  if (!vapid()) return { error: "Notifications are not set up yet." };
  if (!validSub(sub)) return { error: "This browser gave an address we cannot send to." };
  const label = deviceLabel((await headers()).get("user-agent") ?? "");
  const id = await pushId(sub.endpoint);
  await pushStore.put({ id, email: await signedIn(), endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, label, addedAt: Date.now() });
  await logActivity("settings", `Turned on notifications on a device (${label})`);
  revalidatePath("/settings");
  return { id };
}

// One of your own devices. Someone else's is not found.
export async function turnOffPushAction(id: string): Promise<void> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const sub = await pushStore.get(String(id));
  if (!sub || sub.email !== (await signedIn())) return;
  await pushStore.remove(sub.id);
  await logActivity("settings", `Turned off notifications on a device (${sub.label})`);
  revalidatePath("/settings");
}
