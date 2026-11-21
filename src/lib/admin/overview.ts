import type { AdminReview, Lead, Order, Reservation, TestDrive } from "./collections";
import { DAY } from "@/lib/time";
import { forSale, isSold, type Car } from "@/lib/stock/types";
import { isOpenDrive } from "./drives";
import { daysSince, dublinDay } from "./format";
import { followUpDue, pastReplyTarget } from "./follow-ups";
import type { DealerRules } from "@/lib/tenancy/profile";

// Old stock: for sale `oldDays` or more, the dealer's rule (their profile's oldStockDays).
export const isOldStock = (c: Car, now: number, oldDays: number) => forSale(c) && c.listedAt !== undefined && now - Date.parse(`${c.listedAt}T00:00:00Z`) >= oldDays * DAY;

// The numbers on the dealer's overview, worked out from the records. Pure, so the rules are tested.
// How soon it needs doing, which is what its colour says: now (red, filled), soon (amber), or worth knowing (grey). Most urgent first.
export type Urgency = "now" | "soon" | "info";
export type Attention = { key: string; label: string; count: number; href: string; urgency: Urgency };
const RANK: Record<Urgency, number> = { now: 0, soon: 1, info: 2 };

// `cars`: the whole stock, sold too. `costs`: the car ids with a cost, only for staff with the margins permission. `syncProblem`: the
// DoneDeal sync is failing (only for stock from DoneDeal).
// `sales`: the car ids with a sale recorded. `reservations`: the deposits, for the ones past their date. `rules` and `listingSite`: the
// dealer's, from their profile.
export function overview(input: { leads: Lead[]; drives: TestDrive[]; reviews: AdminReview[]; rules: DealerRules; listingSite: string; cars?: Car[]; costs?: Set<string>; sales?: Set<string>; reservations?: Reservation[]; orders?: Order[]; syncProblem?: boolean; now?: number; slaHours?: number }) {
  const now = input.now ?? Date.now();
  const slaHours = input.slaHours ?? 24;
  const { leads, drives, reviews, rules, listingSite } = input;
  const old = (c: Car) => isOldStock(c, now, rules.oldStockDays);
  const upcoming = drives.filter((d) => d.startsAt >= now && d.startsAt < now + 7 * DAY && isOpenDrive(d)).sort((a, b) => a.startsAt - b.startsAt);
  const rated = reviews.filter((r) => r.rating > 0);
  const cars = input.cars ?? [];
  const today = dublinDay(now);
  const offSale = new Set(cars.filter((c) => !forSale(c)).map((c) => c.slug));

  // The records behind the to-dos the overview lists one by one, each in the order to work them: the longest waiting first, the soonest next.
  const due = leads.filter((l) => followUpDue(l, today)).sort((a, b) => a.followUpOn!.localeCompare(b.followUpOn!));
  const late = leads.filter((l) => pastReplyTarget(l, now, slaHours)).sort((a, b) => a.createdAt - b.createdAt);
  const toConfirm = drives.filter((d) => d.status === "requested" && d.startsAt >= now).sort((a, b) => a.startsAt - b.startsAt);
  const unrecorded = input.sales ? cars.filter((c) => isSold(c) && daysSince(c.soldAt!, now) <= rules.saleNudgeDays && !input.sales!.has(c.id)).sort((a, b) => a.soldAt!.localeCompare(b.soldAt!)) : []; // oldest first, as on Stock
  // Reservations past their date; with just one, its task opens it.
  const overdue = (input.reservations ?? []).filter((r) => r.status === "held" && r.until < today);
  const attention = ([
    // Overdue follow-ups are late; ones due today are not yet.
    { key: "follow", label: "Follow-ups due", count: due.length, href: "/leads?need=due", urgency: due.some((l) => l.followUpOn! < today) ? "now" : "soon" },
    { key: "slow", label: "New leads past your reply target", count: late.length, href: "/leads?need=late", urgency: "now" },
    { key: "drives", label: "Test drives to confirm", count: toConfirm.length, href: "/test-drives?view=list&status=requested&when=ahead", urgency: "soon" },
    { key: "reviews", label: "Reviews without a reply", count: reviews.filter((r) => !r.reply).length, href: "/reviews?filter=unreplied", urgency: "info" },
    { key: "sync", label: `${listingSite} stock is not updating`, count: input.syncProblem ? 1 : 0, href: "/stock", urgency: "now" },
    { key: "sold-drives", label: "Test drives booked on a car no longer for sale", count: drives.filter((d) => d.startsAt >= now && isOpenDrive(d) && offSale.has(d.carSlug)).length, href: "/test-drives?view=list&car=gone&when=ahead", urgency: "now" },
    { key: "deposits", label: "Reservations past their date", count: overdue.length, href: overdue.length === 1 ? `/stock/${overdue[0].carId}/reserve` : "/stock?view=reserved", urgency: "now" },
    { key: "orders", label: "Ordered cars arrived, to hand over", count: (input.orders ?? []).filter((o) => o.status === "arrived").length, href: "/orders?view=arrived", urgency: "soon" },
    { key: "taken-down", label: `${listingSite} ads taken down: did they sell?`, count: cars.filter((c) => c.takenDownAt).length, href: "/stock?view=hidden", urgency: "soon" },
    { key: "old", label: `Cars for sale ${rules.oldStockDays} days or more`, count: cars.filter(old).length, href: "/stock?view=old", urgency: "info" },
    { key: "sales", label: "Sold cars with no sale recorded", count: unrecorded.length, href: "/stock", urgency: "soon" }, // Stock's To do opens each sale to record in turn
    { key: "costs", label: "Cars for sale with no cost price", count: input.costs ? cars.filter((c) => !isSold(c) && !input.costs!.has(c.id)).length : 0, href: "/margins", urgency: "info" },
  ] satisfies Attention[])
    .filter((a) => a.count > 0)
    .sort((a, b) => RANK[a.urgency] - RANK[b.urgency]); // stable: same urgency keeps this order

  // Leads in each of the last 8 weeks (7-day windows ending now), oldest first, and a usual week: the middle of the 7 before this one.
  const weeks = Array.from({ length: 8 }, (_, i) => leads.filter((l) => l.createdAt > now - (8 - i) * 7 * DAY && l.createdAt <= now - (7 - i) * 7 * DAY).length);
  const before = weeks.slice(0, -1).sort((a, b) => a - b);
  return {
    weeks,
    usualWeek: before[Math.floor(before.length / 2)],
    late,
    due,
    toConfirm,
    unrecorded,
    // Today's open drives, the earlier ones too (a confirmed one this morning may still be out), in time order.
    now, // the time these were worked out at, for the page's own "has it started" checks
    todayDrives: drives.filter((d) => isOpenDrive(d) && dublinDay(d.startsAt) === today).sort((a, b) => a.startsAt - b.startsAt),
    oldStock: cars.filter(old).length,
    newLeads: leads.filter((l) => l.status === "new").length,
    upcomingDrives: upcoming,
    averageRating: rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0,
    reviewCount: rated.length,
    recentLeads: [...leads].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6),
    attention,
  };
}
