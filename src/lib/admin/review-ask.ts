import "server-only";
import { simulating } from "@/lib/integrations";
import { sendTo } from "@/lib/leads/mail";
import { hasModule } from "@/lib/modules";
import { currentDealer } from "@/lib/tenancy/current";
import { sendWhatsApp } from "@/lib/whatsapp/send";
import { firstName } from "@/lib/whatsapp/rules";
import { logActivity } from "./activity";
import { customersStore, leadsStore, salesStore, type Customer, type Lead } from "./collections";
import { dublinDay } from "./format";
import { matchesAny, parsePersonQuery, type PersonQuery } from "./person-match";

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
export const reviewText = (first: string, car: string, dealer: string, link: string) => `Hi ${first}, thanks for buying your ${car} from ${dealer}. If you have a minute, a Google review would help us a lot: ${link}`;

// The buyer's leads: the sale's own, and every lead with their email or phone (as their customer page finds them).
export function leadsOf(c: Pick<Customer, "email" | "phone">, leads: Lead[], leadId?: string): Lead[] {
  const qs = [c.email, c.phone].map((v) => (v ? parsePersonQuery(v) : null)).filter((q): q is PersonQuery => q !== null);
  return leads.filter((l) => l.id === leadId || (qs.length > 0 && matchesAny(l, qs)));
}

// How the buyer can be asked: WhatsApp when one of their leads ticked the box (and WhatsApp is in the plan), else email when they gave one.
// Never someone who stopped WhatsApp on any lead: that is them asking for no more messages.
export type Reach = { via: "whatsapp"; leadId: string } | { via: "email" } | null;
export function reviewReach(c: Pick<Customer, "email">, theirLeads: Pick<Lead, "id" | "whatsappOptIn" | "phone">[], whatsapp: boolean): Reach {
  if (theirLeads.some((l) => l.whatsappOptIn === false)) return null;
  const opted = whatsapp ? theirLeads.find((l) => l.whatsappOptIn && l.phone) : undefined;
  if (opted) return { via: "whatsapp", leadId: opted.id };
  return c.email ? { via: "email" } : null;
}

// After a new sale is saved with the tick on. Once per sale ever, never for one undone (it is read again: an undone sale has left the car's
// id), and only with a review link (the profile's placeId). WhatsApp is counted as usage and past the cap goes by email (sendWhatsApp); a demo
// dealer sends nothing outside. Returns how it went, or null when nobody was asked.
export async function askForReview(carId: string): Promise<"whatsapp" | "email" | null> {
  const placeId = await reviewPlace();
  const sale = await salesStore.get(carId);
  // shortcut: check then write, so two saves of one sale at the same moment could both send; fine for one dealer's staff, claim the sale with a conditional write if it ever happens.
  if (!placeId || !sale || sale.returnedOn || sale.reviewAskedOn || !sale.customerId) return null;
  const c = await customersStore.get(sale.customerId);
  if (!c) return null;
  const reach = reviewReach(c, leadsOf(c, await leadsStore.list(), sale.leadId), await hasModule("whatsapp"));
  if (!reach) return null;
  const dealer = (await currentDealer()).name;
  const text = reviewText(firstName(c.name), sale.carTitle, dealer, reviewLink(placeId));
  let via = reach.via;
  if (reach.via === "whatsapp") {
    const sent = await sendWhatsApp({ thread: "buyer", from: "site", leadId: reach.leadId, text }, "reply", { canEmail: Boolean(c.email) });
    if (!sent) return null;
    if (sent.via === "email") via = "email";
  }
  // sendWhatsApp's fallback only records "Sent by email instead" in the conversation; the email itself goes here. sendTo throws when none
  // went, so a failed send never marks the sale as asked.
  if (via === "email" && !(await simulating())) await sendTo([c.email], { subject: `${dealer}: how did we do?`, text });
  await salesStore.update(carId, (s) => ({ ...s, reviewAskedOn: dublinDay() }));
  await logActivity("customers", `Asked the buyer for a Google review, by ${via === "whatsapp" ? "WhatsApp" : "email"}`, { kind: "car", id: carId, label: sale.carTitle }); // never the buyer
  return via;
}
