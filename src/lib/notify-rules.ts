import { NAME_REQUIRED } from "@/lib/copy";
import type { ModuleId } from "@/lib/modules-rules";
import { roleCan, type Role } from "@/lib/permission-rules";
import { EVENTS, defaultAlerts, eventText, staffErrors, type EventId } from "@/lib/whatsapp/rules";

// What reaches each person, and how (#142): one row per event, one column per channel. Plain data and pure functions, so Settings, the
// senders (push, the morning email, WhatsApp) and the tests agree. Stored per person in the "whatsapp-staff" collection (src/lib/whatsapp/
// store.ts), whose `alerts` are the WhatsApp column; `push` and `email` came later and are read from the person's role when missing.

export const CHANNELS = ["push", "email", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = { push: "Push", email: "Email", whatsapp: "WhatsApp" };

// The WhatsApp alerts, and two of the dashboard's own: a lead or booking given to you (push) and the morning follow-ups (email).
export type NotifyEvent = EventId | "assigned" | "follow-ups";
export const NOTIFY_EVENTS: NotifyEvent[] = ["enquiry", "trade-in", "test-drive", "service", "finance", "assigned", "follow-ups", "deposit", "review", "slow-stock", "new-in", "monday"];
// The website requests a push goes out for (the bell's lead, order and booking kinds, src/lib/admin/notifications.ts PUSH_KINDS).
const PUSHED: readonly NotifyEvent[] = ["enquiry", "trade-in", "test-drive", "service", "finance", "assigned"];

// The ways an event can reach someone: only what is really sent.
export function channelsOf(e: NotifyEvent): Channel[] {
  if (e === "assigned") return ["push"];
  if (e === "follow-ups") return ["email"];
  return PUSHED.includes(e) ? ["push", "whatsapp"] : ["whatsapp"];
}
const moduleOf = (e: NotifyEvent): ModuleId => (e === "assigned" || e === "follow-ups" ? "dashboard" : EVENTS[e].module);
export const eventLabel = (e: NotifyEvent, oldDays: number) => (e === "assigned" ? "A lead or test drive given to you" : e === "follow-ups" ? "Your follow-ups due, each morning" : eventText(e, oldDays).label);

// What a role may get: the plan's events, and the Monday summary (the dealership's figures) only for those who see the full reports.
// Finance never gets WhatsApp (owner, 2026-11-23). Checked by every sender, whatever is stored.
export const mayGet = (role: Role | null, channel: Channel, e: NotifyEvent) => role !== null && channelsOf(e).includes(channel) && (e !== "monday" || roleCan(role, "margins")) && (channel !== "whatsapp" || role !== "Finance");
export const eventsFor = (role: Role | null, modules: ReadonlySet<ModuleId>) => NOTIFY_EVENTS.filter((e) => modules.has(moduleOf(e)) && CHANNELS.some((c) => mayGet(role, c, e)));

// The columns a person sees: WhatsApp once the dealer has it connected and the person has a phone, never for Finance.
export const columnsFor = (role: Role | null, whatsapp: { on: boolean; phone: string }): Channel[] => CHANNELS.filter((c) => c !== "whatsapp" || (whatsapp.on && Boolean(whatsapp.phone.trim()) && role !== "Finance"));

export type Prefs = { push: NotifyEvent[]; email: NotifyEvent[]; whatsapp: NotifyEvent[] };
// What each role got before anyone chose (push: every request, as it always went; email: the morning follow-ups when the dealer had them on).
export const roleDefaults = (role: Role, followUps: boolean): Prefs => ({ push: [...PUSHED], email: followUps ? ["follow-ups"] : [], whatsapp: role === "Finance" ? [] : defaultAlerts(role) });

// One person's stored record, as kept (src/lib/whatsapp/store.ts StaffPhone).
export type PersonRecord = { id: string; name: string; phone: string; alerts: EventId[]; quietFrom: string; quietTo: string; push?: NotifyEvent[]; email?: NotifyEvent[] };
// A person's choices from what is stored. Someone with a record from before #142 keeps their WhatsApp alerts and gets the rest from their
// role; someone with no record yet starts from the owner's defaults for a new person, or their role's.
export function prefsOf(rec: PersonRecord | undefined, role: Role, s: { followUps: boolean; defaults?: Prefs }): Prefs {
  const base = rec || !s.defaults ? roleDefaults(role, s.followUps) : s.defaults;
  return { push: rec?.push ?? base.push, email: rec?.email ?? base.email, whatsapp: rec ? rec.alerts : base.whatsapp };
}
// The WhatsApp column as stored (a record's `alerts`).
export const alertsOf = (p: Prefs): EventId[] => p.whatsapp.filter((e): e is EventId => e in EVENTS);
export const gets = (p: Prefs, role: Role | null, channel: Channel, e: NotifyEvent) => p[channel].includes(e) && mayGet(role, channel, e);

// A grid as a form sends it: a checkbox per cell, named by its channel with the event as its value. Cells not shown (a module off, a
// column hidden) keep what was chosen, so switching it on again finds them.
export function readGrid(get: (channel: Channel) => string[], shown: NotifyEvent[], columns: Channel[], was: Prefs): Prefs {
  const one = (c: Channel) => {
    if (!columns.includes(c)) return was[c];
    const here = shown.filter((e) => channelsOf(e).includes(c));
    const ticked = new Set(get(c));
    return [...was[c].filter((e) => !here.includes(e)), ...here.filter((e) => ticked.has(e))];
  };
  return { push: one("push"), email: one("email"), whatsapp: one("whatsapp") };
}

// How a person is reached, for the team list: "WhatsApp, email". Push only with a device turned on, WhatsApp only with a phone on a
// connected WhatsApp; "The app only" when nothing goes outside it.
export function reachLine(p: Prefs, role: Role, has: { devices: boolean; whatsapp: boolean }, events: NotifyEvent[]): string {
  const any = (c: Channel) => events.some((e) => gets(p, role, c, e));
  const ways = [has.whatsapp && any("whatsapp") && "WhatsApp", has.devices && any("push") && "push", any("email") && "email"].filter((w): w is string => Boolean(w));
  return ways.length ? ways.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(", ") : "The app only";
}

// A person's own details: a name (unique on the team, checked by the caller), a phone and quiet hours as WhatsApp takes them.
export function profileErrors(name: string, phone: string, quietFrom = "", quietTo = ""): Record<string, string> {
  const errors = staffErrors(phone, quietFrom, quietTo);
  if (!name.trim()) errors.name = NAME_REQUIRED;
  else if (name.trim().length > 60) errors.name = "Use 60 characters or fewer";
  return errors;
}
