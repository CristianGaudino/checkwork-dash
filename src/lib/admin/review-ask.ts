import "server-only";
import { simulating } from "@/lib/integrations";
import { leadRecipients, sendTo } from "@/lib/leads/mail";
import { hasModule } from "@/lib/modules";
import { currentDealer } from "@/lib/tenancy/current";
import { sendWhatsApp, whatsappChannel } from "@/lib/whatsapp/send";
import { firstName } from "@/lib/whatsapp/rules";
import { logActivity } from "./activity";
import { customersStore, leadsStore, salesStore, type Customer, type Lead } from "./collections";
import { dublinDay } from "./format";
import { matchesAny, parsePersonQuery, queryKey, recordKeys, type PersonQuery } from "./person-match";

// Asking a buyer for a Google review once their car is sold (#22): one short message with the dealer's review link, ticked on the sale form.

// A demo dealer with no place of its own uses a made-up one, so the ask can be shown: a demo sends nothing outside (never a fake placeId in
// the profile, which the reviews strip would send to the Places API).
export const DEMO_PLACE_ID = "ChIJ-checkwork-demo";
export async function reviewPlace(): Promise<string | undefined> {
  const d = await currentDealer();
  return d.profile.placeId || (d.demo ? DEMO_PLACE_ID : undefined);
}

// Google's own page for writing a review of a place.
export const reviewLink = (placeId: string) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
const reviewText = (first: string, car: string, dealer: string, link: string) => `Hi ${first}, thanks for buying your ${car} from ${dealer}. If you have a minute, a Google review would help us a lot: ${link}`;
// The email's way out (WhatsApp has its own STOP).
export const REVIEW_OPT_OUT = "If you'd rather not hear from us, reply and say so.";

// The buyer's leads: the sale's own, and every lead with their email or phone (as their customer page finds them).
export function leadsOf(c: Pick<Customer, "email" | "phone">, leads: Lead[], leadId?: string): Lead[] {
  const qs = [c.email, c.phone].map((v) => (v ? parsePersonQuery(v) : null)).filter((q): q is PersonQuery => q !== null);
  return leads.filter((l) => l.id === leadId || (qs.length > 0 && matchesAny(l, qs)));
}

// Whether a WhatsApp review ask would really go by WhatsApp now: in the plan, and the channel sendWhatsApp would pick (simulated and under the cap).
export const reviewByWhatsApp = async () => (await hasModule("whatsapp")) && (await whatsappChannel("reply")) === "whatsapp";

// leadsOf for many customers at once (the sale page): the leads indexed once by email and phone, then each customer looked up.
export function leadsIndex(leads: Lead[]): (c: Pick<Customer, "email" | "phone">) => Lead[] {
  const at = new Map<string, number[]>();
  leads.forEach((l, i) => recordKeys(l).forEach((k) => at.set(k, [...(at.get(k) ?? []), i])));
  return (c) => {
    const qs = [c.email, c.phone].map((v) => (v ? parsePersonQuery(v) : null)).filter((q): q is PersonQuery => q !== null);
    return [...new Set(qs.flatMap((q) => at.get(queryKey(q)) ?? []))].sort((a, b) => a - b).map((i) => leads[i]);
  };
}

// How the buyer can be asked: WhatsApp when one of their leads ticked the box (and WhatsApp can send), else email when they gave one.
// Never someone who stopped WhatsApp on any lead: that is them asking for no more messages.
export type Reach = { via: "whatsapp"; leadId: string } | { via: "email" } | null;
export function reviewReach(c: Pick<Customer, "email">, theirLeads: Pick<Lead, "id" | "whatsappOptIn" | "phone">[], whatsapp: boolean): Reach {
  if (theirLeads.some((l) => l.whatsappOptIn === false)) return null;
  const opted = whatsapp ? theirLeads.find((l) => l.whatsappOptIn && l.phone) : undefined;
  if (opted) return { via: "whatsapp", leadId: opted.id };
  return c.email ? { via: "email" } : null;
}

// One message to a buyer (the review ask, the NCT and service reminders): WhatsApp when `reach` says so and it can go, counted as `kind`
// (canEmail false: when it cannot go after all, nothing is recorded and the email goes instead), else email with the way out, its replies
// to the dealer's lead inbox, not to us. A demo dealer sends no email. A WhatsApp buyer sent an email has their conversation say so.
// Returns how it went, or null when it could not go. sendTo throws when none went, so a failed send is never recorded as sent.
export async function messageBuyer(reach: NonNullable<Reach>, email: string, msg: { text: string; subject: string; ref?: string }, kind: "reply" | "marketing"): Promise<"whatsapp" | "email" | null> {
  const draft = { thread: "buyer" as const, from: "site" as const, ...(reach.via === "whatsapp" && { leadId: reach.leadId }), text: msg.text, ...(msg.ref && { ref: msg.ref }) };
  if (reach.via === "whatsapp" && (await sendWhatsApp(draft, kind, { canEmail: false }))) return "whatsapp";
  if (!email) return null;
  if (!(await simulating())) await sendTo([email], { subject: msg.subject, text: `${msg.text}\n\n${REVIEW_OPT_OUT}`, replyTo: (await leadRecipients())[0] });
  if (reach.via === "whatsapp") await sendWhatsApp(draft, kind, { email: true });
  return "email";
}

// After a new sale is saved with the tick on. Once per sale ever, never for one undone (it is read again: an undone sale has left the car's
// id), and only with a review link (the profile's placeId). WhatsApp is counted as usage; when it cannot go (past the cap) it goes by email; a demo
// dealer sends nothing outside. Returns how it went, or null when nobody was asked.
export async function askForReview(carId: string): Promise<"whatsapp" | "email" | null> {
  const placeId = await reviewPlace();
  const sale = await salesStore.get(carId);
  // shortcut: check then write, so two saves of one sale at the same moment could both send; fine for one dealer's staff, claim the sale with a conditional write if it ever happens.
  if (!placeId || !sale || sale.returnedOn || sale.reviewAskedOn || !sale.customerId) return null;
  const c = await customersStore.get(sale.customerId);
  if (!c) return null;
  // The plan alone here (not reviewByWhatsApp), so a buyer who chose WhatsApp gets "by email" in their conversation when it cannot go.
  const reach = reviewReach(c, leadsOf(c, await leadsStore.list(), sale.leadId), await hasModule("whatsapp"));
  if (!reach) return null;
  const dealer = (await currentDealer()).name;
  const text = reviewText(firstName(c.name), sale.carTitle, dealer, reviewLink(placeId));
  const via = await messageBuyer(reach, c.email, { text, subject: `${dealer}: how did we do?` }, "reply");
  if (!via) return null;
  await salesStore.update(carId, (s) => ({ ...s, reviewAskedOn: dublinDay() }));
  await logActivity("customers", `Asked the buyer for a Google review, by ${via === "whatsapp" ? "WhatsApp" : "email"}`, { kind: "car", id: carId, label: sale.carTitle }); // never the buyer
  return via;
}
