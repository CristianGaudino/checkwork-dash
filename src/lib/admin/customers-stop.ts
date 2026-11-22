import "server-only";
import { logActivity } from "./activity";
import { alertsStore, subscribersStore } from "./collections";

// The one rule for stopping a subscription, for staff (src/app/customers/actions.ts) and for the person's own link (src/lib/site-api/unsubscribe.ts).
// Both return whether the record exists; stopping one already stopped is fine. `actor` names who, when it is not the signed-in person.
export async function unsubscribeSubscriber(id: string, actor?: string): Promise<boolean> {
  const s = await subscribersStore.get(id);
  if (!s) return false;
  if (s.status === "subscribed") {
    await subscribersStore.put({ ...s, status: "unsubscribed" });
    await logActivity("customers", "Unsubscribed from the newsletter", { kind: "subscriber", id }, actor);
  }
  return true;
}

export async function pauseAlert(id: string, actor?: string): Promise<boolean> {
  const a = await alertsStore.get(id);
  if (!a) return false;
  if (a.active) {
    await alertsStore.put({ ...a, active: false });
    await logActivity("customers", "Stopped the stock alert", { kind: "alert", id }, actor);
  }
  return true;
}
