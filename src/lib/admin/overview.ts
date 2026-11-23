import type { AdminReview, Lead, Order, Reservation, TestDrive } from "./collections";
import { DAY } from "@/lib/time";
import { forSale, isSold, type Car } from "@/lib/stock/types";
import { isOpenDrive } from "./drives";
import { slugId } from "./stock-admin-pure";
import { dublinDay } from "./format";
import { counted } from "./reports";
import { forPerson, leadsToAnswer } from "./follow-ups";
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
// dealer's, from their profile. `mine`: a person's name, for To do's For me: the leads and test drives given to them or to nobody yet
// (forPerson; their own follow-ups only, as in their report). The rest (stock, reviews) is nobody's, so it stays.
export function overview(input: { leads: Lead[]; drives: TestDrive[]; reviews: AdminReview[]; rules: DealerRules; listingSite: string; cars?: Car[]; costs?: Set<string>; sales?: Set<string>; reservations?: Reservation[]; orders?: Order[]; warrantyRequests?: number; syncProblem?: boolean; now?: number; slaHours?: number; mine?: string }) {
  const now = input.now ?? Date.now();
  const slaHours = input.slaHours ?? 24;
  const { leads, drives, reviews, rules, listingSite } = input;
  const old = (c: Car) => isOldStock(c, now, rules.oldStockDays);
  const upcoming = drives.filter((d) => d.startsAt >= now && d.startsAt < now + 7 * DAY && isOpenDrive(d)).sort((a, b) => a.startsAt - b.startsAt);
  const cars = input.cars ?? [];
  const today = dublinDay(now);
  const offSale = new Set(cars.filter((c) => !forSale(c)).map((c) => c.id));
  const ownDrives = input.mine === undefined ? drives : drives.filter((d) => !d.assignedTo || d.assignedTo === input.mine);
  const withMe = input.mine === undefined ? "" : `&with=${encodeURIComponent(input.mine)}`;

  // The records behind the to-dos the overview lists one by one, each in the order to work them: the most urgent and longest waiting first,
  // the soonest next.
  const every = leadsToAnswer(leads, now, today, slaHours);
  const answer = input.mine === undefined ? every : forPerson(every, input.mine);
  const reply = answer.filter((t) => t.kind === "reply");
  const due = answer.filter((t) => t.kind === "follow");
  const toConfirm = ownDrives.filter((d) => d.status === "requested" && d.startsAt >= now).sort((a, b) => a.startsAt - b.startsAt);
  const unrecorded = input.sales ? cars.filter((c) => isSold(c) && !input.sales!.has(c.id)).sort((a, b) => a.soldAt!.localeCompare(b.soldAt!)) : []; // oldest first, as on Stock
  // Reservations past their date; with just one, its task opens it.
  const overdue = (input.reservations ?? []).filter((r) => r.status === "held" && r.until < today);
  const attention = ([
    // Each kind of lead is now (red) when any one of its leads is (leadsToAnswer).
    { key: "follow", label: "Follow-ups due", count: due.length, href: `/leads?need=due${withMe}`, urgency: due.some((t) => t.urgency === "now") ? "now" : "soon" },
    // Where Reply to leads goes: Leads' To answer now, the same leads.
    { key: "reply", label: "New leads to answer", count: reply.length, href: input.mine === undefined ? "/leads" : "/leads?mine=1", urgency: reply.some((t) => t.urgency === "now") ? "now" : "soon" },
    { key: "drives", label: "Test drives to confirm", count: toConfirm.length, href: "/test-drives?view=list&status=requested&when=ahead", urgency: "soon" },
    // Warranty requests from the website with no claim opened yet (openWarrantyRequests), as Aftersales' Requests.
    { key: "warranty", label: "Warranty requests to answer", count: input.warrantyRequests ?? 0, href: "/aftersales?view=requests", urgency: "soon" },
    { key: "reviews", label: "Reviews without a reply", count: reviews.filter((r) => !r.reply).length, href: "/reviews?filter=unreplied", urgency: "info" },
    { key: "sync", label: "Stock is not updating", count: input.syncProblem ? 1 : 0, href: "/stock", urgency: "now" },
    { key: "sold-drives", label: "Test drives booked on a car no longer for sale", count: ownDrives.filter((d) => d.startsAt >= now && isOpenDrive(d) && offSale.has(slugId(d.carSlug))).length, href: "/test-drives?view=list&car=gone&when=ahead", urgency: "now" },
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
  const weeks = Array.from({ length: 8 }, (_, i) => leads.filter((l) => counted(l) && l.createdAt > now - (8 - i) * 7 * DAY && l.createdAt <= now - (7 - i) * 7 * DAY).length);
  const before = weeks.slice(0, -1).sort((a, b) => a - b);
  return {
    weeks,
    usualWeek: before[Math.floor(before.length / 2)],
    answer, // every lead waiting on you, for the Reply to leads button
    reply,
    due,
    toConfirm,
    unrecorded,
    now, // the time these were worked out at, for the page's own "has it started" checks
    // The next three open drives in the coming week, after the last one earlier today (cancelled ones aside), which may still be out.
    nextDrives: [...drives.filter((d) => d.startsAt < now && d.status !== "cancelled" && dublinDay(d.startsAt) === today).sort((a, b) => a.startsAt - b.startsAt).slice(-1), ...upcoming.slice(0, 3)],
    oldStock: cars.filter(old).length,
    attention,
  };
}
