"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendToDealer } from "@/lib/leads/mail";
import { SETTINGS_DEFAULT, changeTeamMember, getSettings, leadsStore, moveTeamMember, ordersStore, reservationsStore, salesStore, settingsStore, type DealerSettings, type TeamMember, drivesStore } from "@/lib/admin/collections";
import { noticesStore, readsStore } from "@/lib/admin/notifications";
import { feedbackStore, helpStore } from "@/lib/admin/help";
import { enabledModules } from "@/lib/modules";
import { alertsOf, columnsFor, eventsFor, profileErrors, readGrid, roleDefaults, type Prefs } from "@/lib/notify-rules";
import { people, whatsappOn, type Person } from "@/lib/people";
import { resetDemoRecords } from "@/lib/admin/demo-reset";
import { EMAIL_INVALID, NAME_REQUIRED } from "@/lib/copy";
import { newId } from "@/lib/admin/ids";
import { mayResetDemo } from "@/lib/admin/docs";
import { fieldErrors } from "@/lib/admin/validation";
import { can, currentMember, realCan, realRole, refusal } from "@/lib/permissions";
import { ROLES, type Role } from "@/lib/permission-rules";
import { logActivity } from "@/lib/admin/activity";
import { currentDealer } from "@/lib/tenancy/current";
import { DEV_EMAIL, dealerIdsOf, patchDealer } from "@/lib/tenancy/directory";
import { staffByEmail } from "@/lib/auth/attempts";
import { FACTS_SCHEMA } from "@/lib/tenancy/profile";
import { requireStaff } from "@/lib/staff";
import { messagesStore, staffStore } from "@/lib/whatsapp/store";
import { pushStore, removePushOf } from "@/lib/push";

export type SettingsState = { errors?: Record<string, string>; saved?: boolean } | undefined;

// Only owners and managers change the business settings, checked here whatever the page showed.
const NOT_ALLOWED = "Only an owner or manager can change this";
const refused = async (field: string): Promise<SettingsState | null> => ((await can("settings")) ? null : { errors: { [field]: NOT_ALLOWED } });
// The same for what reaches outside the dashboard (emails sent): the directory's role, not the demo bar's (realCan).
const refusedReal = async (field: string): Promise<SettingsState | null> => ((await realCan("settings")) ? null : { errors: { [field]: await refusal("settings", NOT_ALLOWED) } });

// Reads the current record, applies one change and writes it back, so each panel saves on its own.
async function change(fn: (s: DealerSettings) => DealerSettings) {
  const apply = (s: Partial<DealerSettings>) => ({ ...fn({ ...SETTINGS_DEFAULT, ...s }), updatedAt: Date.now() });
  if (!(await settingsStore.update("dealer", apply))) await settingsStore.put(apply({})); // update: two panels saved at once both land
  revalidatePath("/settings");
}

const fail = (e: z.ZodError): SettingsState => ({ errors: fieldErrors(e) });
// A save that changes nothing is not recorded in the activity history. Same keys in the same order, as each form always sends them.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The reply time and the test drive slot (Timings): only the fields sent are changed.
const targets = z.object({
  leadSlaHours: z.coerce.number().int("Whole hours").min(1, "At least 1 hour").max(168, "At most 168 hours (a week)").optional(),
  driveSlotMinutes: z.coerce.number().int("Whole minutes").min(15, "At least 15 minutes").max(240, "At most 240 minutes").optional(),
});
export async function saveTargetsAction(_p: SettingsState, data: FormData): Promise<SettingsState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const no = await refused(data.has("leadSlaHours") ? "leadSlaHours" : "driveSlotMinutes");
  if (no) return no;
  const r = targets.safeParse(Object.fromEntries(data));
  if (!r.success) return fail(r.error);
  const was = await getSettings();
  const { leadSlaHours = was.leadSlaHours, driveSlotMinutes = was.driveSlotMinutes } = r.data;
  await change((s) => ({ ...s, leadSlaHours, driveSlotMinutes }));
  if (was.leadSlaHours !== leadSlaHours) await logActivity("settings", `Changed the lead reply target from ${was.leadSlaHours} to ${leadSlaHours} hours`);
  if (was.driveSlotMinutes !== driveSlotMinutes) await logActivity("settings", `Changed the test drive slot from ${was.driveSlotMinutes} to ${driveSlotMinutes} minutes`);
  return { saved: true };
}

const marketing = z.object({ voice: z.string().trim().max(200), hashtags: z.string().trim().max(120), signOff: z.string().trim().max(160) });
export async function saveMarketingAction(_p: SettingsState, data: FormData): Promise<SettingsState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const no = await refused("voice");
  if (no) return no;
  const r = marketing.safeParse(Object.fromEntries(data));
  if (!r.success) return fail(r.error);
  const was = await getSettings();
  await change((s) => ({ ...s, marketing: r.data }));
  if (!same(was.marketing, r.data)) await logActivity("settings", "Changed the marketing voice");
  return { saved: true };
}

// The dealer's own facts (name, website, phone, email, address, hours), kept in their profile in the directory, not in their store. Only
// the facts: the plan, stock source and rules are ours to set. Hours come as opens0..6 and closes0..6, Monday first; a day with neither is
// closed, and a day with one needs both, closing after opening.
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export async function saveBusinessAction(_p: SettingsState, data: FormData): Promise<SettingsState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const no = await refusedReal("name") // the directory's copy of the dealer, seen by everyone: the real role;
  if (no) return no;
  const raw = Object.fromEntries(data);
  const r = FACTS_SCHEMA.safeParse({ ...raw, hours: DAYS.map((_, i) => ({ opens: raw[`opens${i}`] ?? "", closes: raw[`closes${i}`] ?? "" })) });
  if (!r.success) return { errors: Object.fromEntries(r.error.issues.map((i) => [i.path[0] === "hours" ? `opens${String(i.path[1])}` : String(i.path[0]), i.message])) };
  const { name, siteUrl, phone, email, street, town, county, eircode, hours } = r.data;
  const bad = hours.findIndex((h) => Boolean(h.opens) !== Boolean(h.closes) || (h.opens && h.opens >= h.closes));
  if (bad >= 0) return { errors: { [`opens${bad}`]: "Give an opening time before the closing time, or leave both empty" } };
  const dealer = await currentDealer();
  const facts = { siteUrl, phone, email, address: { street, town, county, eircode }, hours: hours.map((h, i) => (h.opens ? { day: DAYS[i], ...h } : { day: DAYS[i] })) };
  await patchDealer(dealer.id, name, facts);
  const p = dealer.profile;
  if (!same([dealer.name, p.siteUrl, p.phone, p.email, p.address, p.hours], [name, facts.siteUrl, phone, email, facts.address, facts.hours])) await logActivity("settings", "Changed the business details");
  revalidatePath("/", "layout"); // the name and website show in the menu on every page
  return { saved: true };
}

// The addresses that get the email when a visitor sends a form. Up to five, one per line or comma. Empty goes back to the site's own setting.
const MAX_LEAD_EMAILS = 5;
export async function saveLeadEmailsAction(_p: SettingsState, data: FormData): Promise<SettingsState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const no = await refusedReal("leadEmails");
  if (no) return no;
  const list = [...new Set(String(data.get("leadEmails") ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (list.length > MAX_LEAD_EMAILS) return { errors: { leadEmails: `Use ${MAX_LEAD_EMAILS} addresses or fewer` } };
  const bad = list.find((e) => !z.email().max(120).safeParse(e).success);
  if (bad) return { errors: { leadEmails: `"${bad.slice(0, 40)}" is not a valid email` } };
  const was = await getSettings();
  await change((s) => ({ ...s, leadEmails: list }));
  if (!same(was.leadEmails, list)) await logActivity("settings", "Changed who gets the lead emails");
  return { saved: true };
}

// Sends one test message to the saved addresses so the dealer can see it arrive.
export async function sendTestEmailAction(): Promise<SettingsState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const no = await refusedReal("test");
  if (no) return no;
  try {
    await sendToDealer({ subject: "Test email from your dealer dashboard", text: "If you can read this, new leads will reach this address." });
    return { saved: true };
  } catch {
    return { errors: { test: "The test email did not go. Email is not set up on this site yet, or there is no address to send to." } };
  }
}

// The team decides who sees what (src/lib/permissions.ts), so only owners and managers change it, checked here whatever the page showed.
// A manager cannot add, change or remove an owner (nor make anyone one), so nobody below owner can take the dealership over. Emails are
// unique, since a signed-in person is matched to the team by email. A team that has an owner always keeps one.
const NO_TEAM = "Only an owner or manager can change the team";
const OWNERS_ONLY = "Only an owner can change an owner";
const NO_OWNER = "Keep at least one owner on the team";
const hasOwner = (team: DealerSettings["team"]) => team.some((t) => t.role === "Owner");
// Whether the signed-in person may make a change that touches these roles (the person's old and new role). The team is also the directory's
// list of who may sign in, so this also needs the directory's role, which the demo bar's cannot raise (realCan).
async function mayTouch(...roles: (Role | undefined)[]): Promise<string | null> {
  if (!(await realCan("team"))) return refusal("team", NO_TEAM);
  return roles.includes("Owner") && ((await currentMember()).role !== "Owner" || (await realRole()) !== "Owner") ? OWNERS_ONLY : null;
}

const member = z.object({ name: z.string().trim().min(1, NAME_REQUIRED).max(60), email: z.string().trim().toLowerCase().email(EMAIL_INVALID).max(120), role: z.enum(ROLES) });
export async function addTeamAction(_p: SettingsState, data: FormData): Promise<SettingsState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const r = member.safeParse(Object.fromEntries(data));
  if (!r.success) return fail(r.error);
  const no = await mayTouch(r.data.role);
  if (no) return { errors: { role: no } };
  const s = await getSettings();
  const clash = taken(s.team, r.data);
  if (clash) return { errors: clash };
  const id = newId("u");
  // They start with their role's defaults (src/lib/notify-rules.ts), kept as theirs, so a later change to the defaults leaves them be.
  const prefs = roleDefaults(r.data.role, s.notifications.followUps);
  await changeTeamMember(r.data.email, r.data.role, async () => {
    await change((x) => ({ ...x, team: [...x.team.filter((t) => t.email.toLowerCase() !== r.data.email), { id, ...r.data }] }));
    await staffStore.put({ id, name: r.data.name, phone: "", alerts: alertsOf(prefs), quietFrom: "", quietTo: "", push: prefs.push, email: prefs.email });
  });
  await logActivity("settings", `Added ${r.data.name} to the team as ${r.data.role}`, { kind: "team", id, label: r.data.name });
  return { saved: true };
}

// A name or an email someone else on the team already has (names: leads are given by name; emails: the sign-in).
function taken(team: TeamMember[], p: { name: string; email: string }, self?: string): Record<string, string> | null {
  const others = team.filter((t) => t.id !== self);
  if (others.some((t) => t.name.toLowerCase() === p.name.toLowerCase())) return { name: "Someone with that name is already on the team" };
  if (p.email === DEV_EMAIL || others.some((t) => t.email.toLowerCase() === p.email)) return { email: "Someone with that email is already on the team" };
  return null;
}

// Leads, bookings, sales, deposits, orders, the bell and the WhatsApp conversation name the person: a new name follows them there. The activity history
// keeps the name each change was made under.
async function renameEverywhere(from: string, to: string) {
  if (from === to) return;
  const swap = <T extends object>(k: keyof T) => (x: T) => (x[k] === from ? { ...x, [k]: to } : x);
  for (const l of await leadsStore.list()) if (l.assignedTo === from) await leadsStore.update(l.id, swap("assignedTo"));
  for (const d of await drivesStore.list()) if (d.assignedTo === from) await drivesStore.update(d.id, swap("assignedTo"));
  for (const x of await salesStore.list()) if (x.salesperson === from) await salesStore.update(x.id, swap("salesperson"));
  for (const x of await reservationsStore.list()) if (x.salesperson === from) await reservationsStore.update(x.id, swap("salesperson"));
  for (const x of await ordersStore.list()) if (x.salesperson === from) await ordersStore.update(x.id, swap("salesperson"));
  for (const m of await messagesStore.list()) if (m.to === from) await messagesStore.update(m.id, swap("to"));
  for (const n of await noticesStore.list()) if (n.for === from) await noticesStore.update(n.id, swap("for"));
  // Help keeps a person's requests and their last feedback by name (requestsOf, feedbackStore's id): both follow the new name.
  for (const r of await helpStore.list()) if (r.name === from) await helpStore.update(r.id, swap("name"));
  const fb = await feedbackStore.get(from);
  if (fb) await feedbackStore.replaceMany([from], [{ ...fb, id: to }]);
}

// One person's details, saved together (#142): the team's record (name, email, role: the directory too, when the email or role changes)
// and their own (phone, quiet hours, notifications). `p` is the person as they are now.
type Next = { name: string; email: string; role: Role; phone: string; quietFrom: string; quietTo: string; prefs: Prefs };
async function writePerson(p: Person, n: Next) {
  const was = p.email.toLowerCase();
  const details = async () => {
    await change((s) => ({ ...s, team: s.team.some((t) => t.id === p.id) ? s.team.map((t) => (t.id === p.id ? { ...t, name: n.name, email: n.email, role: n.role } : t)) : [...s.team, { id: p.id, name: n.name, email: n.email, role: n.role }] }));
    await staffStore.put({ id: p.id, name: n.name, phone: n.phone, alerts: alertsOf(n.prefs), quietFrom: n.quietFrom, quietTo: n.quietTo, push: n.prefs.push, email: n.prefs.email });
  };
  if (n.email !== was) await moveTeamMember(was, n.email, n.role, details);
  else if (n.role !== p.role) await changeTeamMember(was, n.role, details);
  else await details();
  if (n.email !== was) {
    // Their devices and what they have read in the bell are kept by email: they follow the person.
    for (const d of await pushStore.list()) if (d.email === was) await pushStore.update(d.id, (x) => ({ ...x, email: n.email }));
    const read = await readsStore.get(was);
    if (read) await readsStore.put({ id: n.email, ids: read.ids });
  }
  await renameEverywhere(p.name, n.name);
}

// The grid as sent, for the person's role and columns (src/lib/notify-rules.ts), and quiet hours, which only WhatsApp keeps: kept as
// they were when its column is not shown.
async function readNotifications(data: FormData, p: Person, role: Role, phone: string) {
  const columns = columnsFor(role, { on: await whatsappOn(), phone });
  const prefs = data.has("notify-grid") ? readGrid((c) => data.getAll(`notify-${c}`).map(String), eventsFor(role, await enabledModules()), columns, p.prefs) : p.prefs;
  const wa = columns.includes("whatsapp");
  return { prefs, quietFrom: wa ? String(data.get("quietFrom") ?? "") : p.quietFrom, quietTo: wa ? String(data.get("quietTo") ?? "") : p.quietTo };
}

// Your account (#142): the signed-in person's own name and phone, and their own notifications. Everyone, for themselves only: who they
// are comes from the sign-in (currentMember), never from the form. The email is the sign-in address: only an owner or manager changes it.
const OWN_EMAIL = "Ask another owner or manager to change your own sign-in email";
const SHARED_EMAIL = "They work at another dealer too, so ask Checkwork to change their sign-in email";
const NOT_ON_TEAM = "You are not on this dealer's team yet. Ask an owner or manager to add you.";
async function myself(): Promise<Person | undefined> {
  const me = await currentMember();
  if (!me.role) return undefined;
  return (await people()).find((t) => (me.email ? t.email.toLowerCase() === me.email.toLowerCase() : t.name === me.name));
}

export async function saveProfileAction(_p: SettingsState, data: FormData): Promise<SettingsState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const p = await myself();
  if (!p) return { errors: { name: NOT_ON_TEAM } };
  const name = String(data.get("name") ?? "").trim();
  const phone = String(data.get("phone") ?? "").trim();
  const errors = { ...profileErrors(name, phone), ...taken((await getSettings()).team, { name, email: p.email.toLowerCase() }, p.id) };
  if (Object.keys(errors).length) return { errors };
  await writePerson(p, { ...p, email: p.email.toLowerCase(), name, phone });
  if (name !== p.name || phone !== p.phone) await logActivity("settings", "Changed their own details", { kind: "team", id: p.id, label: name });
  return { saved: true };
}

export async function saveMyNotificationsAction(_p: SettingsState, data: FormData): Promise<SettingsState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const p = await myself();
  if (!p) return { errors: { quietFrom: NOT_ON_TEAM } };
  const n = await readNotifications(data, p, p.role, p.phone);
  const errors = profileErrors(p.name, "", n.quietFrom, n.quietTo);
  if (Object.keys(errors).length) return { errors };
  await writePerson(p, { ...p, email: p.email.toLowerCase(), ...n });
  if (!same(p.prefs, n.prefs) || p.quietFrom !== n.quietFrom || p.quietTo !== n.quietTo) await logActivity("settings", "Changed their own notifications", { kind: "team", id: p.id, label: p.name });
  return { saved: true };
}

// One person, from Team (#142): their name, email (the sign-in: the directory changes with it), role, phone, notifications and quiet hours.
// Owners and managers only, a manager never for an owner (mayTouch). A team that has an owner keeps one.
export async function savePersonAction(id: string, _p: SettingsState, data: FormData): Promise<SettingsState> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const all = await people();
  const p = all.find((t) => t.id === id);
  if (!p) return { errors: { name: "That person is no longer on the team" } };
  const r = member.safeParse(Object.fromEntries(data));
  if (!r.success) return fail(r.error);
  const no = await mayTouch(p.role, r.data.role);
  if (no) return { errors: { role: no } };
  // Access still signs them in with the old address: moving their own membership would lock them out.
  if (r.data.email !== p.email.toLowerCase() && p.email.toLowerCase() === (await currentMember()).email.toLowerCase()) return { errors: { email: OWN_EMAIL } };
  // Their sign-in is one identity across every dealer, as with any shared account: a dealer only moves it when they are on this team alone,
  // and never onto an address someone else signs in with.
  if (r.data.email !== p.email.toLowerCase()) {
    const { id: here } = await currentDealer();
    if ((await dealerIdsOf(p.email)).some((d) => d !== here)) return { errors: { email: SHARED_EMAIL } };
    if (await staffByEmail(r.data.email)) return { errors: { email: "Someone already signs in with that email" } };
  }
  const phone = String(data.get("phone") ?? "").trim();
  const n = await readNotifications(data, p, r.data.role, phone);
  const errors = { ...profileErrors(r.data.name, phone, n.quietFrom, n.quietTo), ...taken(all, r.data, p.id) };
  if (Object.keys(errors).length) return { errors };
  if (hasOwner(all) && !hasOwner(all.map((t) => (t.id === id ? { ...t, role: r.data.role } : t)))) return { errors: { role: NO_OWNER } };
  await writePerson(p, { ...r.data, phone, ...n });
  if (p.role !== r.data.role) await logActivity("settings", `Changed ${p.name}'s role from ${p.role} to ${r.data.role}`, { kind: "team", id, label: r.data.name });
  if (p.name !== r.data.name || p.email.toLowerCase() !== r.data.email || p.phone !== phone) await logActivity("settings", `Changed ${r.data.name}'s details`, { kind: "team", id, label: r.data.name });
  if (!same(p.prefs, n.prefs) || p.quietFrom !== n.quietFrom || p.quietTo !== n.quietTo) await logActivity("settings", `Changed ${r.data.name}'s notifications`, { kind: "team", id, label: r.data.name });
  return { saved: true };
}

// The last person cannot be removed: leads are assigned to the team, so it is never empty.
// Their leads and test drives go back to nobody, so none points at someone the picker no longer lists.
export async function removeTeamAction(id: string) {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  const { team } = await getSettings();
  const gone = team.find((t) => t.id === id);
  if (!gone) return;
  if (team.length === 1) return { error: "The team cannot be empty." };
  const no = await mayTouch(gone.role);
  if (no) return { error: no };
  if (hasOwner(team) && !hasOwner(team.filter((t) => t.id !== id))) return { error: "Make someone else an Owner first. The team always has one." };
  await changeTeamMember(gone.email, null, () => change((s) => ({ ...s, team: s.team.filter((t) => t.id !== id) })));
  for (const l of await leadsStore.list()) if (l.assignedTo === gone.name) await leadsStore.update(l.id, (x) => ({ ...x, assignedTo: x.assignedTo === gone.name ? undefined : x.assignedTo }));
  for (const d of await drivesStore.list()) if (d.assignedTo === gone.name) await drivesStore.update(d.id, (x) => ({ ...x, assignedTo: x.assignedTo === gone.name ? undefined : x.assignedTo }));
  await staffStore.remove(id); // their phone and notifications go too: no more buyers' alerts to someone who left
  await removePushOf(gone.email); // and their notifications on their phones
  await logActivity("settings", `Removed ${gone.name} from the team`, { kind: "team", id, label: gone.name });
}

export async function resetDemoAction() {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  if (!(await mayResetDemo()) || !(await can("settings"))) return; // a real dealer's records are never wiped from a button
  await resetDemoRecords();
  await logActivity("settings", "Reset the demo data");
  revalidatePath("/", "layout");
}
