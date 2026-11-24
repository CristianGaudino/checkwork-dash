import "server-only";
import { resetSyncStatus } from "@/lib/donedeal/sync";
import { resetActivity } from "./activity";
import { DEALER_COLLECTIONS, reservationsStore } from "./collections";
import { noticesStore, readsStore } from "./notifications";
import { sentAlertsStore, usageStore } from "@/lib/billing/usage";
import { billsStore } from "@/lib/billing/bills";
import { feedbackStore, helpStore } from "./help";
import { currentDealer, dealerBucket } from "@/lib/tenancy/current";
import { DEMO_DEALER, patchDealer } from "@/lib/tenancy/directory";
import { DEMO_NAME } from "@/lib/tenancy/profile";
import { adminCars, updateCar } from "./stock-admin";
import { messagesStore, staffStore } from "@/lib/whatsapp/store";
import { carHistoryStore, historyCache } from "@/lib/history";

// The demo's made-up records back to their seed, dated from today: Settings, Reset demo data, and each morning (worker.mjs), on a Monday after
// the deploy moves the demo cars' sold dates. What visitors sent (ids starting "real-") stays. The current dealer's only, and only a demo dealer.
export async function resetDemoRecords() {
  const dealer = await currentDealer();
  if (!dealer.demo) throw new Error("Not a demo dealer"); // a real dealer's records are never put back to a seed
  // The made-up business's facts too, which a visitor may have changed in Settings.
  await patchDealer(dealer.id, dealer.id === DEMO_DEALER ? DEMO_NAME : dealer.name, null);
  // The usage, bills and Help records too, so the Billing page's month and bills are dated from today and a reached limit is lifted (not the demo's real AI use, a `real-` record: that is real Claude, so its cap holds all month).
  for (const c of [...DEALER_COLLECTIONS, noticesStore, readsStore, usageStore, sentAlertsStore, billsStore, helpStore, feedbackStore, messagesStore, staffStore, carHistoryStore, historyCache]) await c.reset();
  // The deposits are back to the seed, so the Reserved marks follow them (the mark is on the car, which the reset keeps): on the cars with a
  // held deposit, off every other car.
  const held = new Set((await reservationsStore.list()).filter((r) => r.status === "held").map((r) => r.carId));
  for (const car of await adminCars())
    if (Boolean(car.reserved) !== held.has(car.id)) await updateCar(car.id, (cur) => (Boolean(cur.reserved) === held.has(cur.id) ? null : { ...cur, reserved: held.has(cur.id) || undefined }));
  await resetActivity();
  await resetSyncStatus();
  // The media library's uploads and the Help screenshots in R2 go too, best effort: their records are already back to the seed.
  try {
    const bucket = await dealerBucket();
    let cursor: string | undefined;
    for (const prefix of bucket ? ["media/", "help/"] : [])
      do {
        const page = await bucket!.list({ prefix, cursor });
        if (page.objects.length) await bucket!.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
  } catch {}
}
