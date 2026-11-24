import "server-only";
import { logActivity } from "@/lib/admin/activity";
import { carEditSummary } from "@/lib/admin/activity-text";
import { getSettings, leaderEmails, salesStore, undoSale } from "@/lib/admin/collections";
import { defineCollection } from "@/lib/admin/docs";
import { dublinDay } from "@/lib/admin/format";
import { carTitleOf } from "@/lib/admin/seed-data";
import { adminCars, removeCar, saveCar, updateCar } from "@/lib/admin/stock-admin";
import { sendTo } from "@/lib/leads/mail";
import { notify } from "@/lib/admin/notifications";
import { TIME_ZONE } from "@/lib/site";
import { currentDealer } from "@/lib/tenancy/current";
import { listing, stockSource } from "@/lib/stock-source";
import type { Car } from "@/lib/stock/types";
import { HOUR, MINUTE } from "@/lib/time";
import { fetchListings, type FeedResult } from "./feed";
import { planSync } from "./plan";

// One sync: read the dealer's DoneDeal ads, work out the changes (plan.ts), write them to the stock the site reads, and record each in the
// activity history as "DoneDeal sync". Run every 15 minutes by the Worker (worker.mjs, through /api/donedeal/sync) and by Sync now.
// A failed or held sync changes nothing: the site keeps the stock from the last good one. After an hour of failures the owners and
// managers get one email, then no more until a sync works again. A refused key is not an outage: access has ended, so the dealer's synced
// cars are removed at once and the owners and managers told then (DoneDeal's API policy, #158).
export const syncActor = (site: string) => `${site} sync`;
// Where the sync runs: a dealer whose stock comes from a listing site, and a demo dealer (which shows both versions; its feed changes nothing).
export const syncRunsHere = async () => (await currentDealer()).demo || (await stockSource()) === "donedeal";
export const ALERT_AFTER = HOUR;

export type SyncStatus = {
  id: "status";
  lastRunAt?: number;
  lastOkAt?: number;
  result?: { added: number; changed: number; takenDown: number };
  problem?: string; // why the last run changed nothing, in the dealer's words; absent when it worked
  held?: boolean; // the problem is DoneDeal's answer looking wrong; Apply anyway runs it with force
  failingSince?: number; // the first failed run of this outage
  alertedAt?: number;
  removed?: boolean; // the key was refused and the synced cars removed; until a sync works again
};

// The demo's last sync, a few minutes ago with nothing to change (its feed is the stock itself). A real site starts with none.
const statusStore = defineCollection<SyncStatus>("donedeal-sync", () => [{ id: "status", lastRunAt: Date.now() - 6 * MINUTE, lastOkAt: Date.now() - 6 * MINUTE, result: { added: 0, changed: 0, takenDown: 0 } }]);

export const resetSyncStatus = () => statusStore.reset(); // "Reset demo data"

export async function syncStatus(): Promise<SyncStatus> {
  return (await statusStore.get("status")) ?? { id: "status" };
}

const problems = (site: string): Record<Exclude<FeedResult, { ok: true }>["reason"], string> => ({
  "not-connected": `${site} is not connected. Add the API key under Settings, Connected services.`,
  "not-installed": `The ${site} key is set, but the connection is not switched on yet.`,
  refused: `${site} refused the key, so its cars were removed.`,
  failed: `${site} did not answer.`,
});

const ref = (c: Car) => ({ kind: "car" as const, id: c.id, label: carTitleOf(c) });

export async function runSync({ force = false, now = Date.now() } = {}): Promise<SyncStatus> {
  const prev = await syncStatus();
  const { site } = await listing();
  const feed: FeedResult = await fetchListings().catch(() => ({ ok: false, reason: "failed" }) as const);
  if (!feed.ok) return failed(prev, problems(site)[feed.reason], false, now, site, feed.reason === "refused");
  const today = dublinDay(now); // the Irish day, as the rest of the dashboard dates a sale
  const current = await adminCars();
  const plan = planSync(current, feed.listings, today, { force, site });
  if (plan.held) return failed(prev, `${plan.held} The site kept its stock. Check ${site}, then refresh stock.`, true, now, site);
  // Car by car: one that cannot be saved (an ad whose address clashes with another car's) is skipped and counted, never stops the rest.
  // shortcut: a cron run and Sync now at the same moment both apply the plan; the stock ends the same but the history shows each change
  // twice. Fine while syncs take seconds; add a lock if it shows up.
  // A car changed here since the plan read it (marked sold, withdrawn) or deleted is left alone: the next sync plans it again.
  let skipped = 0;
  const apply = async (car: Car, summary: string, before?: Car) => {
    try {
      if (!before) await saveCar(car);
      else if (!(await updateCar(car.id, (cur) => (JSON.stringify(cur) === JSON.stringify(before) ? car : null)))) return false;
      await logActivity("stock", summary, ref(car), syncActor(site));
      return true;
    } catch {
      skipped++;
      return false;
    }
  };
  const result = { added: 0, changed: 0, takenDown: 0 };
  for (const c of plan.added) if (await apply(c, `Added from ${site}`)) result.added++;
  for (const { before, after } of plan.changed) {
    if (!(await apply(after, before.soldAt ? `Back on sale on ${site}` : before.listing ? `Back on ${site}` : carEditSummary(before, after), before))) continue;
    result.changed++;
    // Back on sale: the sale fell through. Kept as a cancelled sale, as in our version, so the history still has it.
    const sale = before.soldAt ? await salesStore.get(after.id) : undefined;
    if (sale) await undoSale(sale, { returnedOn: today, kind: "cancelled", reason: `Listed again on ${site}` });
  }
  for (const c of plan.gone) {
    if (!(await apply(c, `Hidden: the ad came down on ${site}`, current.find((was) => was.id === c.id)))) continue;
    result.takenDown++;
    await notify({ kind: "taken-down", text: `Ad taken down on ${site}`, detail: `${carTitleOf(c)}, now hidden`, href: "/stock" }, now);
  }
  const status: SyncStatus = { id: "status", lastRunAt: now, lastOkAt: now, result, ...(skipped && { problem: `${skipped === 1 ? "1 car" : `${skipped} cars`} from ${site} could not be saved. The rest are up to date.` }) };
  await statusStore.put(status);
  return status;
}

// The dealer's cars from the listing site, and any photos stored for them, when access to it ends (#158): a refused key, or Checkwork
// removing the key when a dealer leaves (src/lib/owner-api/keys.ts). Their own records stay: a sale, cost and prep, a lead or a test drive
// keeps the car's title, as for a car deleted by hand. Only on a synced dealer, so a dealer's own stock is never touched, and never on a demo.
// Recorded in Activity with `why`, by `actor`. Returns how many cars went.
export async function removeSyncedCars(why: string, actor: string): Promise<number> {
  if ((await currentDealer()).demo || (await stockSource()) !== "donedeal") return 0;
  const cars = await adminCars();
  for (const c of cars) await removeCar(c.id, c);
  if (cars.length) await logActivity("stock", `Removed ${cars.length === 1 ? "1 car" : `${cars.length} cars`}: ${why}`, undefined, actor);
  return cars.length;
}

async function failed(prev: SyncStatus, problem: string, held: boolean, now: number, site: string, refused = false): Promise<SyncStatus> {
  // An outage starts at its first failed run (a site that has never synced too), and gets one email an hour in, none after it.
  const failingSince = prev.problem && prev.failingSince !== undefined ? prev.failingSince : now;
  // A refused key removes the cars on the run that sees it; later runs find none, so its bell notice and email come once.
  const removed = refused ? await removeSyncedCars(`${site} refused the key`, syncActor(site)) : 0;
  const status: SyncStatus = { ...prev, lastRunAt: now, problem, held, failingSince, ...((removed || prev.removed) && { removed: true }) };
  // In the bell once an outage starts, not every 15 minutes it lasts.
  if (failingSince === now || removed) await notify({ kind: "sync", text: removed ? `${site} cars removed` : "Stock did not update", detail: problem, href: "/stock" }, now);
  const due = removed > 0 || (now - failingSince >= ALERT_AFTER && !(prev.alertedAt !== undefined && prev.alertedAt >= failingSince));
  if (due && (await alertOwners(problem, site, prev.lastOkAt, refused))) status.alertedAt = now;
  await statusStore.put(status);
  return status;
}

async function alertOwners(problem: string, site: string, lastOkAt?: number, refused = false): Promise<boolean> {
  const to = leaderEmails((await getSettings()).team);
  const since = lastOkAt ? `since ${new Date(lastOkAt).toLocaleString("en-IE", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" })}` : "yet";
  const { name } = await currentDealer();
  const mail = refused
    ? {
        subject: `${name}: ${site} refused the key, so its cars were removed`,
        text: `${problem}\n\n${site} lets us show your cars only while you allow it, so when it refuses the key they come off the dashboard and the website. Your sales, leads and test drives are kept. Contact Checkwork to set up a new key: your cars come back on the first update after it.`,
      }
    : {
        subject: `${name}: the ${site} stock has not updated ${since}`,
        text: `${problem}\n\nThe website still shows the cars from the last update ${since}. New cars, price changes and sales on ${site} will not show until it works again. Open the dealer dashboard, Stock, to see the latest attempt and to refresh stock.`,
      };
  try {
    await sendTo(to, mail);
    return true;
  } catch {
    console.error(JSON.stringify({ job: "donedeal-sync", error: "the warning email did not go" }));
    return false;
  }
}
