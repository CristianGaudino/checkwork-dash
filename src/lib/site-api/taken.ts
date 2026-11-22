import "server-only";
import { getSettings, drivesStore } from "@/lib/admin/collections";
import { slotState } from "@/lib/admin/slots";
import { slugId } from "@/lib/admin/stock-admin-pure";
import { isOpenDrive } from "@/lib/admin/drives";
import { dublinDateTime } from "@/lib/admin/format";
import { driveDays, driveTimes } from "@/lib/leads/constants";
import { dealerProfile } from "@/lib/tenancy/current";
import type { Answer } from "./request";

// GET /api/site/v1/drives/taken?carId=<digits>: the slot starts on the website's bookable days that the dashboard's own slot rule (slotState,
// the same one the desk's picker uses) marks taken for that car, from its open bookings matched by car id. Times only, never a name or any
// other detail of a booking. A car id that matches nothing gets an empty list, so the answer does not say whether a car exists.
export async function takenTimes(carId: string, now = Date.now()): Promise<string[]> {
  const hours = (await dealerProfile()).hours;
  const windowMin = (await getSettings()).driveSlotMinutes;
  const taken = (await drivesStore.list()).filter((d) => isOpenDrive(d) && slugId(d.carSlug) === carId).map((d) => dublinDateTime(d.startsAt));
  if (!taken.length) return [];
  const stamp = dublinDateTime(now);
  return driveDays(hours, new Date(now)).flatMap((day) => driveTimes(day, hours).filter((t) => slotState(day, t, taken, windowMin, stamp) === "taken").map((t) => `${day} ${t}`));
}

export async function takenAnswer(url: URL): Promise<Answer> {
  const carId = url.searchParams.get("carId") ?? "";
  if (!/^\d{1,12}$/.test(carId)) return { status: 400, outcome: "invalid" };
  return { status: 200, outcome: "listed", body: { times: await takenTimes(carId) } };
}
