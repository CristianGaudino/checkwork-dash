import "server-only";
import { logActivity } from "./activity";
import { alertsStore } from "./collections";

// The one rule for stopping an alert, for staff (src/app/customers/actions.ts) and for the person's own link (src/lib/site-api/unsubscribe.ts).
// Returns whether the record exists; stopping one already stopped is fine. `actor` names who, when it is not the signed-in person.
export async function pauseAlert(id: string, actor?: string): Promise<boolean> {
  const a = await alertsStore.get(id);
  if (!a) return false;
  if (a.active) {
    await alertsStore.put({ ...a, active: false });
    await logActivity("customers", "Stopped the stock alert", { kind: "alert", id }, actor);
  }
  return true;
}
