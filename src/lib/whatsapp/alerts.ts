import "server-only";
import { wantsWhatsApp } from "@/lib/phone";
import { readLead } from "@/lib/leads/lead-text";
import { addMessage, isStaffAlert, lastWeek, messagesStore, staffStore, type Msg } from "./store";
import { isUsable, modeOf } from "@/lib/integrations";
import { recordUsage, usageAllowed } from "@/lib/billing/usage";
import { EVENTS, alertText, eventOfLead, firstName, inQuiet, type EventId, type Facts } from "./rules";
import { mayGet } from "@/lib/notify-rules";
import { roleCan } from "@/lib/permission-rules";
import { TIME_ZONE } from "@/lib/site";
import { currentDealer } from "@/lib/tenancy/current";
import type { Lead } from "@/lib/admin/collections";
import { drivesStore, getSettings, leadsStore, reviewsStore, salesStore } from "@/lib/admin/collections";
import { adminCars } from "@/lib/admin/stock-admin";
import { carTitleOf } from "@/lib/admin/seed-data";
import { daysSince, dublinDay } from "@/lib/admin/format";
import type { Car } from "@/lib/stock/types";
import { suggestedDrop } from "@/lib/admin/overview";
import { DAY } from "@/lib/time";

const clock = () => new Date().toLocaleTimeString("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
type Draft = Omit<Msg, "id" | "at" | "via">;

// Each team member's copy of one alert: still on the team, a linked phone, that alert on and theirs to get (never Finance's, the Monday
// summary only for those who see the full reports, src/lib/notify-rules.ts), and outside their quiet hours. `plain`: the text, with no
// buttons, for those without the settings permission (a slow car without the suggested drop, which is for owners and managers only).
async function staffCopies(event: EventId, text: string, extra: Partial<Draft>, plain?: string): Promise<Draft[]> {
  const now = clock();
  const team = new Map((await getSettings()).team.map((t) => [t.id, t.role])); // only people still on the team
  return (await staffStore.list())
    .filter((p) => team.has(p.id) && p.phone && p.alerts.includes(event) && mayGet(team.get(p.id)!, "whatsapp", event) && !inQuiet(now, p.quietFrom, p.quietTo))
    .map((p) => ({ thread: "staff", from: "site", to: p.name, event, text, buttons: EVENTS[event].buttons, ...extra, ...(plain !== undefined && !roleCan(team.get(p.id)!, "settings") && { text: plain, buttons: [] }) }));
}

// One cap check and one count for the whole batch, so a visitor's submit is not many round trips. Over the cap (or not connected) an alert
// goes by email, a buyer's only where there is an address (`canEmail`), and a marketing message is not sent. Returns how many were sent.
// shortcut: one batch (a few, one per linked phone) can pass the cap by those few cents; check per message if it ever matters.
async function deliver(drafts: Draft[], kind: "alert" | "marketing", canEmail: (d: Draft) => boolean = () => true): Promise<number> {
  const viaWhatsApp = (await modeOf("whatsapp")) === "simulated" && (await usageAllowed("whatsapp", kind));
  if (!viaWhatsApp && kind === "marketing") return 0;
  const out = drafts.filter((d) => viaWhatsApp || canEmail(d));
  for (const d of out) await addMessage({ ...d, ...(!viaWhatsApp && { via: "email" as const }) });
  if (viaWhatsApp && out.length) await recordUsage("whatsapp", kind, out.length);
  return out.length;
}

// A new website request reaches each team member who has that alert on, in their WhatsApp, with the buttons for it; and its buyer, if they
// ticked the WhatsApp box, gets a confirmation. Best effort and silent until the dealer's WhatsApp is connected: the lead is already stored
// and the dashboard has it, so a failure here is never a failed form (called from src/lib/admin/real-leads.ts, outside the dashboard).
export async function alertStaffOnWhatsApp(lead: Lead): Promise<void> {
  try {
    if (!(await isUsable("whatsapp"))) return;
    const event = eventOfLead(lead.type);
    const { text: words, facts } = readLead(lead);
    const text = alertText(event, { first: firstName(lead.name), car: lead.carTitle, reg: lead.reg, text: words, when: facts["Test drive"], sell: lead.type === "sell", warranty: lead.type === "warranty" });
    const drafts = await staffCopies(event, text, { leadId: lead.id, ref: lead.id, ...(event === "enquiry" && !lead.carTitle && { buttons: ["call", "handled"] }) });
    if (wantsWhatsApp(lead)) drafts.push({ thread: "buyer", from: "site", leadId: lead.id, text: `Hi ${firstName(lead.name)}, thanks for your message to ${(await currentDealer()).name}. We have it and will be in touch soon.` });
    // By email instead only where there is an address: a buyer with only a phone gets nothing rather than an email nobody receives.
    await deliver(drafts, "alert", (d) => d.thread !== "buyer" || Boolean(lead.email));
  } catch {
    // shortcut: a lost alert is still in the bell and the leads list; add a retry with the adapter
  }
}

// Any other alert (a deposit, a new car, a review, a slow car, the Monday summary), to the team members who have it on, while the dealer has
// WhatsApp connected. Best effort, as above: the action that caused it has already happened. Returns how many went.
export async function alertStaff(event: EventId, facts: Facts, extra: Partial<Draft> = {}): Promise<number> {
  try {
    if (!(await isUsable("whatsapp"))) return 0;
    const plain = event === "slow-stock" ? alertText(event, { ...facts, dropEur: undefined }) : undefined;
    return await deliver(await staffCopies(event, alertText(event, facts), extra, plain), EVENTS[event].kind);
  } catch {
    return 0; // shortcut: as above
  }
}

// A car going on the website for the first time (added, or a draft published): a nudge to post it.
export const alertNewIn = (car: Car) => alertStaff("new-in", { car: carTitleOf(car) }, { ref: car.id });

// The morning job (worker.mjs, /api/whatsapp/daily): each old stock car (the dealer's oldStockDays) and each review from the last two days, once while its
// alert is kept (30 days, so a car still unsold a month on is raised again), and on a Monday last week's summary.
export async function sendDailyAlerts(now = Date.now()): Promise<{ sent: number }> {
  if (!(await isUsable("whatsapp"))) return { sent: 0 };
  const said = new Set((await messagesStore.list()).filter(isStaffAlert).map((m) => `${m.event}:${m.ref}`));
  const [cars, reviews, { profile }] = await Promise.all([adminCars(), reviewsStore.list(), currentDealer()]);
  let sent = 0;
  // The same suggestion Stock shows owners and managers (suggestedDrop), so the alert never offers a drop the car cannot take.
  for (const c of cars) if (suggestedDrop(c, profile.rules, now) && !said.has(`slow-stock:${c.id}`)) sent += await alertStaff("slow-stock", { car: carTitleOf(c), days: daysSince(c.listedAt!, now), dropEur: profile.rules.slowDropEur }, { ref: c.id });
  for (const r of reviews) if (r.createdAt > now - 2 * DAY && !said.has(`review:${r.id}`)) sent += await alertStaff("review", { stars: r.rating, author: r.author, text: r.text }, { ref: r.id });
  if (new Date(`${dublinDay(now)}T12:00:00Z`).getUTCDay() === 1) {
    const [leads, sales, drives] = await Promise.all([leadsStore.list(), salesStore.list(), drivesStore.list()]);
    sent += await alertStaff("monday", lastWeek({ leads, cars, sales, reviews }, drives, now, profile));
  }
  return { sent };
}
