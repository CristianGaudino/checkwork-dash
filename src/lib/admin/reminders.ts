import "server-only";
import { carHistoryStore } from "@/lib/history";
import type { VehicleHistory } from "@/lib/history-rules";
import { hasModule } from "@/lib/modules";
import { parseIrishReg } from "@/lib/reg";
import { currentDealer } from "@/lib/tenancy/current";
import { whatsappChannel } from "@/lib/whatsapp/send";
import { firstName } from "@/lib/whatsapp/rules";
import { customersStore, leadsStore, salesStore, type Customer, type Lead, type Sale, type SentReminder } from "./collections";
import { addDays, addMonths, dublinDay, fmtDate, fmtDay } from "./format";
import { adminCars } from "./stock-admin";
import { leadsIndex, messageBuyer, reviewReach, type Reach } from "./review-ask";

// Reminding past buyers when their car's NCT or service is due (#171), so the customer list brings repeat business. A daily job
// (worker.mjs, /api/reminders) sends each one once per due date, to buyers who agreed to marketing only. The sales module.

export type ReminderKind = SentReminder["kind"];
// Days before the due date the reminder goes: the NCT a month ahead (time to book a test), the service on its day.
export const REMINDER_LEAD_DAYS: Record<ReminderKind, number> = { nct: 30, service: 0 };
// A reminder a failed run missed still goes in the week after its day, never later.
const LATE_DAYS = 7;

// The sold car as the dates need it: its registration and its last history check (kept by the car's id).
export type SoldCar = { reg?: string; history?: VehicleHistory };
// The NCT due: typed on the sale, else the car's history check, only while it is for the car's plate (as HistoryPanel shows it: a reg
// corrected since must never send another car's date) and not run out before the sale (an NCT done since, as prep).
export function nctDue(s: Pick<Sale, "nctDue" | "soldOn">, car?: SoldCar): string | undefined {
  if (s.nctDue) return s.nctDue;
  const h = car?.history;
  return h?.nctExpiry && car?.reg && h.reg === parseIrishReg(car.reg)?.reg && h.nctExpiry >= s.soldOn ? h.nctExpiry : undefined;
}
// The next service due: typed on the sale, else `months` after it; then every `months` from there, the first not past by more than a week.
// Each step counts from the sale (or the typed date), so 31 January stays the month's end (28 February, 31 March), never drifting to the 28th.
// A rule of 0 months means no service reminder unless one is typed.
export function serviceDue(s: Pick<Sale, "serviceDue" | "soldOn">, months: number, today: string): string | undefined {
  if (!s.serviceDue && months <= 0) return undefined;
  const from = s.serviceDue ?? s.soldOn;
  let k = s.serviceDue ? 0 : 1;
  while (months > 0 && addMonths(from, k * months) < addDays(today, -LATE_DAYS)) k++;
  return addMonths(from, k * months);
}
// The NCT reminder goes once for its date: one past by more than the late week is dropped, until staff type the next on the sale.
export const dueDates = (s: Sale, car: SoldCar | undefined, months: number, today: string): { kind: ReminderKind; due: string }[] =>
  [{ kind: "nct" as const, due: nctDue(s, car) }, { kind: "service" as const, due: serviceDue(s, months, today) }].filter((d): d is { kind: ReminderKind; due: string } => d.due !== undefined && d.due >= addDays(today, -LATE_DAYS));

// The reminders to send today: in their window, and not sent before for that due date. Never for a sale undone or with no buyer.
export const remindersDue = (s: Sale, car: SoldCar | undefined, months: number, today: string) =>
  s.returnedOn || !s.customerId
    ? []
    : dueDates(s, car, months, today).filter(({ kind, due }) => today >= addDays(due, -REMINDER_LEAD_DAYS[kind]) && today <= addDays(due, LATE_DAYS) && !s.reminders?.some((r) => r.kind === kind && r.due === due));

// How a buyer is reached: only with marketing consent, then as the review ask (WhatsApp if opted in and it can send, else email; never
// someone who stopped WhatsApp on any lead).
export const reminderReach = (c: Pick<Customer, "email" | "marketingConsent">, theirLeads: Pick<Lead, "id" | "whatsappOptIn" | "phone">[], whatsapp: boolean): Reach =>
  c.marketingConsent ? reviewReach(c, theirLeads, whatsapp) : null;
// Whether a reminder would go by WhatsApp now: in the plan, and a marketing message can really go (simulated and under the cap).
export const reminderByWhatsApp = async () => (await hasModule("whatsapp")) && (await whatsappChannel("marketing")) === "whatsapp";

// The message goes within a month of the day, so the day and month say it ("12 December").
export function reminderText(kind: ReminderKind, first: string, car: string, due: string, dealer: string, phone: string) {
  const what = kind === "nct" ? `the NCT on your ${car} is due on ${fmtDay(due, "dayMonth")}` : `your ${car} is due a service on ${fmtDay(due, "dayMonth")}`;
  return `Hi ${first}, ${what}. ${dealer} can book it in for you: ${phone ? `reply here or call ${phone}` : "just reply here"}.`;
}

// What the customer's purchase and the car's page say: the dates, and the last reminder of each kind sent.
const day = (d: string) => fmtDate(`${d}T12:00:00Z`);
export function reminderFacts(s: Sale, car: SoldCar | undefined, months: number, today: string): string[] {
  const label = { nct: "NCT", service: "Service" } as const;
  const sent = (["nct", "service"] as const).map((k) => s.reminders?.filter((r) => r.kind === k).at(-1)).filter((r) => r !== undefined);
  return [...dueDates(s, car, months, today).map((d) => `${label[d.kind]} due ${day(d.due)}`), ...sent.map((r) => `${label[r.kind]} reminder sent ${day(r.on)}`)];
}

// Each sold car's reg and history check, by the car's id (a car deleted since has neither, so only a typed NCT counts for it).
export async function soldCars(): Promise<(id: string) => SoldCar> {
  const [cars, histories] = await Promise.all([adminCars(), carHistoryStore.list()]);
  const reg = new Map(cars.map((c) => [c.id, c.reg]));
  const history = new Map(histories.map((h) => [h.id, h.history]));
  return (id) => ({ reg: reg.get(id), history: history.get(id) });
}

// Owners' and managers' list on Customers: each buyer's NCT and service falling due this calendar month, soonest first, with the reminder
// sent for it if any. Sales undone or with no buyer on file are left out.
export type DueRow = { customer: Customer; sale: Sale; kind: ReminderKind; due: string; sent?: SentReminder };
export function dueThisMonth(sales: Sale[], customers: Customer[], carOf: (id: string) => SoldCar | undefined, months: number, today: string): DueRow[] {
  const month = today.slice(0, 7);
  const byId = new Map(customers.map((c) => [c.id, c]));
  return sales
    .flatMap((sale) => {
      const customer = sale.customerId && !sale.returnedOn ? byId.get(sale.customerId) : undefined;
      if (!customer) return [];
      // From the month's first day, so a service earlier this month is not moved on to next year.
      return dueDates(sale, carOf(sale.id), months, addDays(`${month}-01`, LATE_DAYS))
        .filter((d) => d.due.startsWith(month))
        .map((d) => ({ customer, sale, ...d, sent: sale.reminders?.find((r) => r.kind === d.kind && r.due === d.due) }));
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

// The daily job, for the current dealer. A demo dealer sends nothing outside (WhatsApp is simulated there, email skipped) but records each
// as sent. WhatsApp counts as marketing usage; when it cannot go, email. Returns counts only; nothing about a buyer is logged.
export async function sendReminders(now = Date.now()): Promise<{ sent: number; failed: number }> {
  if (!(await hasModule("sales"))) return { sent: 0, failed: 0 };
  const today = dublinDay(now);
  const { name: dealer, profile } = await currentDealer();
  const [sales, customers, leads, carOf] = await Promise.all([salesStore.list(), customersStore.list(), leadsStore.list(), soldCars()]);
  const due = sales.map((s) => ({ s, due: remindersDue(s, carOf(s.id), profile.rules.serviceMonths, today) })).filter((x) => x.due.length);
  if (!due.length) return { sent: 0, failed: 0 };
  const byId = new Map(customers.map((c) => [c.id, c]));
  const theirLeads = leadsIndex(leads);
  const whatsapp = await reminderByWhatsApp();
  let [sent, failed] = [0, 0];
  for (const { s, due: list } of due) {
    const c = byId.get(s.customerId!);
    const reach = c && reminderReach(c, theirLeads(c), whatsapp);
    if (!c || !reach) continue;
    for (const { kind, due: on } of list) {
      try {
        const text = reminderText(kind, firstName(c.name), s.carTitle, on, dealer, profile.phone);
        // Past the WhatsApp cap mid-run, it goes by email instead.
        const via = await messageBuyer(reach, c.email, { text, subject: `${dealer}: your ${kind === "nct" ? "NCT" : "service"} is due`, ref: s.id }, "marketing");
        if (!via) continue;
        // shortcut: sent, then recorded, so a send that goes but then fails to record is sent (and billed) again the next morning; fine
        // while writes rarely fail, claim the reminder on the sale before sending (cleared on a failed send) if it ever happens.
        const r: SentReminder = { kind, due: on, on: today, via };
        await salesStore.update(s.id, (x) => ({ ...x, reminders: [...(x.reminders ?? []), r] }));
        sent++;
      } catch {
        failed++;
      }
    }
  }
  if (failed) console.error(JSON.stringify({ job: "reminders", failed })); // counts only, never the buyer
  return { sent, failed };
}
