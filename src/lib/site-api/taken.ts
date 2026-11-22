import "server-only";
import { getSettings, drivesStore } from "@/lib/admin/collections";
import { slugId } from "@/lib/admin/stock-admin-pure";
import { isOpenDrive } from "@/lib/admin/drives";
import { addDays, dublinDateTime } from "@/lib/admin/format";
import { HOUR } from "@/lib/time";
import type { Answer } from "./request";

// GET /api/site/v1/drives/taken?carId=<digits>: the slot starts (every :00 and :30) within the slot length of an open booking of that car, matched by car id; the same window clashes() uses. Times only, never a name or any
// other detail of a booking. A car id that matches nothing gets an empty list, so the answer does not say whether a car exists.
export async function takenTimes(carId: string, now = Date.now()): Promise<string[]> {
  const windowMin = (await getSettings()).driveSlotMinutes;
  const open = (await drivesStore.list()).filter((d) => d.startsAt > now - HOUR && isOpenDrive(d) && slugId(d.carSlug) === carId);
  // Every half hour within the slot of each booking (past midnight it is the next day, before it the day before): no opening hours in it, so the website's hours need not match ours.
  const out = new Set<string>();
  for (const d of open) {
    const [day, t] = dublinDateTime(d.startsAt).split(" ");
    const mid = Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    for (let m = Math.floor((mid - windowMin) / 30 + 1) * 30; m < mid + windowMin; m += 30) {
      if (Math.abs(m - mid) >= windowMin) continue;
      const wrap = Math.floor(m / 1440); // -1 the day before, 1 the day after
      const mm = m - wrap * 1440;
      out.add(`${wrap ? addDays(day, wrap) : day} ${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`);
    }
  }
  return [...out].sort();
}

export async function takenAnswer(url: URL): Promise<Answer> {
  const carId = url.searchParams.get("carId") ?? "";
  if (!/^\d{1,12}$/.test(carId)) return { status: 400, outcome: "invalid" };
  return { status: 200, outcome: "listed", body: { times: await takenTimes(carId) } };
}
