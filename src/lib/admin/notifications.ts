import "server-only";
import { DAY, MINUTE } from "@/lib/time";
import { LEAD_TYPE_LABELS, TEAM_SEED, demoDrives, demoLeads, type Lead } from "./collections";
import { dublinDay, fmtDateTime, fmtDay } from "./format";
import { leadTags } from "@/lib/leads/contact-topics";
import { defineCollection } from "./docs";
import { newId } from "./ids";
import { after } from "next/server";
import { pushToTeam } from "@/lib/push";
import { currentDealer } from "@/lib/tenancy/current";

// The dashboard's own notifications: the bell. In the app only, never emailed. Each says what happened (`text`, the heading) and what it
// is about (`detail`, under it: the request's topic and the car, the service near its limit), and links to it.
// Never a customer's name or details, only the kind of request and the car, so they are not personal data (nothing to erase, nothing to
// purge for privacy). `for` is a team member's name when it is theirs alone (a lead given to them); otherwise everyone sees it.
export const NOTICE_KINDS = ["lead", "drive", "warranty", "order", "taken-down", "sync", "assigned", "usage", "whatsapp", "help"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];
export type Notice = { id: string; at: number; kind: NoticeKind; text: string; detail?: string; href: string; for?: string };
// What one person has read: a record each (by their key), so two people reading at once never write the same record.
export type Reads = { id: string; ids: string[] };

export const NOTICE_KEEP_DAYS = 60;
const SHOWN = 20;

export const noticesStore = defineCollection<Notice>("notifications", () => seedNotices(demoLeads()));
// The demo team has read the seeded notices older than a day, so the bell opens on the day's own.
export const readsStore = defineCollection<Reads>("notice-reads", () => {
  const old = seedNotices(demoLeads()).filter((n) => n.at < Date.now() - DAY).map((n) => n.id);
  return TEAM_SEED.map((t) => ({ id: t.email, ids: old }));
});

// Who is reading, as the read marks know them: their Access email, or the demo's role member.
export type Reader = { name: string; email: string };
const key = (r: Reader) => (r.email || r.name).toLowerCase();
const seesIt = (n: Notice, r: Reader) => !n.for || n.for === r.name;
export const readsOf = async (r: Reader) => new Set((await readsStore.get(key(r)))?.ids ?? []);

// The kinds that also go to the phone (#11, src/lib/push), with the bell's own words: its heading as the title, "<dealer>: <detail>" as the
// text. Never the customer, as in the bell: a lock screen is not private.
export const PUSH_KINDS: ReadonlySet<NoticeKind> = new Set(["lead", "order", "drive", "assigned"]);

// Best effort: a notification is never worth failing the thing that caused it, so callers need not catch. Old ones go as new ones come.
// A push goes to the same people as the bell: the one it is `for`, or everyone. It says the dealer and opens through /dealers/open, so
// someone at several dealers lands in the one it came from. Sent after the answer (after()), so a slow push service never holds up a form.
export async function notify(n: Omit<Notice, "id" | "at">, at = Date.now()): Promise<void> {
  try {
    await noticesStore.put({ id: newId("note"), at, ...n });
    for (const old of await noticesStore.list()) if (old.at < at - NOTICE_KEEP_DAYS * DAY) await noticesStore.remove(old.id);
  } catch {
    // shortcut: a lost notification is acceptable, the record itself is saved and shows in its list
  }
  if (!PUSH_KINDS.has(n.kind)) return;
  const dealer = await currentDealer().catch(() => null);
  if (!dealer) return;
  const send = () => pushToTeam({ title: n.text, body: n.detail ? `${dealer.name}: ${n.detail}` : dealer.name, url: `/dealers/open?${new URLSearchParams({ dealer: dealer.id, to: n.href })}` }, n.for);
  try {
    after(send);
  } catch {
    await send(); // outside a request (a test, a script): now
  }
}

// The newest for this person, with how many they have not read (`read`: the ids they have).
export function noticesFor(all: Notice[], read: Set<string>, r: Reader): { items: (Notice & { unread: boolean })[]; unread: number } {
  const mine = all.filter((n) => seesIt(n, r)).sort((a, b) => b.at - a.at);
  return { items: mine.slice(0, SHOWN).map((n) => ({ ...n, unread: !read.has(n.id) })), unread: mine.filter((n) => !read.has(n.id)).length };
}

// Marks these (or all of this person's) as read, in their own record. Ids of notices that have gone are dropped, so it never grows past
// what the bell holds.
export async function markRead(r: Reader, ids?: string[]): Promise<void> {
  const all = await noticesStore.list();
  const live = new Set(all.map((n) => n.id));
  const read = await readsOf(r);
  const add = all.filter((n) => seesIt(n, r) && (!ids || ids.includes(n.id))).map((n) => n.id);
  await readsStore.put({ id: key(r), ids: [...new Set([...read, ...add])].filter((id) => live.has(id)) });
}

type LeadFacts = Pick<Lead, "type" | "carTitle" | "topic" | "answers">;
// What a lead is about, never who sent it: the contact form's topic and answers as the leads list tags them ("Buying, this week,
// trade-in"), and the car. A topic that only repeats the kind ("Message") is left out.
export function leadAbout(lead: LeadFacts): string | undefined {
  const topic = leadTags(lead.topic, lead.answers ?? {}).join(", ");
  return [topic !== LEAD_TYPE_LABELS[lead.type] && topic, lead.carTitle].filter(Boolean).join(" · ") || undefined;
}
// The kind and what it is about, on one line: for a lead given to you or a buyer's reply, whose heading says what happened.
export const leadLine = (lead: LeadFacts) => [LEAD_TYPE_LABELS[lead.type], leadAbout(lead)].filter(Boolean).join(" · ");

// What a website request says in the bell: the kind as the heading, then what it is about; a test drive booking (`drive`) adds the time
// asked for, worded as the request since the booking may be moved after, and links to itself when it has an id.
export function noticeOfLead(lead: Pick<Lead, "id"> & LeadFacts, drive?: { id?: string; startsAt?: number }): Omit<Notice, "id" | "at"> {
  const text = LEAD_TYPE_LABELS[lead.type];
  if (drive) {
    const when = drive.startsAt === undefined ? undefined : `asked for ${fmtDay(dublinDay(drive.startsAt), "weekday")} ${fmtDateTime(drive.startsAt)}`;
    const detail = [leadAbout(lead), when].filter(Boolean).join(" · ") || undefined;
    return { kind: "drive", text, detail, href: drive.id ? `/test-drives/${drive.id}` : "/test-drives" };
  }
  const kind: NoticeKind = lead.type === "warranty" ? "warranty" : lead.type === "order" ? "order" : "lead";
  return { kind, text, detail: leadAbout(lead), href: kind === "warranty" ? `/aftersales/requests/${lead.id}` : `/leads/${lead.id}` };
}

// The demo's bell: the seeded website requests of the last three days, the test drive requests booked today and tomorrow, and a lead given
// to Conor. Worded as real ones are, never with a day ("today"), so they stay true for as long as they are kept.
function seedNotices(leads: Lead[], now = Date.now()): Notice[] {
  const recent = leads.filter((l) => l.source === "Website" && l.createdAt > now - 3 * DAY);
  const drives = demoDrives().filter((d) => d.status === "requested" && d.startsAt > now && d.createdAt > now - 3 * DAY);
  return [
    ...recent.map((l) => ({ id: `note-${l.id}`, at: l.createdAt, ...noticeOfLead(l, l.type === "test-drive" ? {} : undefined) })),
    ...drives.map((d) => ({ id: `note-${d.id}`, at: d.createdAt, ...noticeOfLead({ id: d.id, type: "test-drive", carTitle: d.carTitle }, d) })),
    { id: "note-assigned", at: now - 35 * MINUTE, kind: "assigned", text: "Ciara Walsh gave you a lead", detail: "Car enquiry", href: "/leads?status=contacted", for: "Conor Doyle" },
  ];
}
