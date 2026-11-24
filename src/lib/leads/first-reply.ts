import { cache } from "react";
import type { Lead } from "@/lib/admin/collections";
import { adminCars } from "@/lib/admin/stock-admin";
import { askedCar } from "@/lib/leads/journey";
import { enabledModules } from "@/lib/modules";
import { conditionShown, type ModuleId } from "@/lib/modules-rules";
import { currentMember } from "@/lib/permissions";
import { currentDealer } from "@/lib/tenancy/current";
import { fmtEur, siteCarUrl } from "@/lib/stock/format";
import { isSold, onRequest, type Car } from "@/lib/stock/types";
import { firstName } from "@/lib/whatsapp/rules";

// The first reply to a lead about a car carries its price and its link (#160): most dealers leave the price out, so ours never does.
type ReplyCar = Pick<Car, "slug" | "priceEur" | "vat" | "soldAt" | "listing" | "condition">;

// The price to give a buyer: none for a sold car or one on request.
export const replyPrice = (car: ReplyCar) => (isSold(car) || onRequest(car) ? undefined : `${fmtEur(car.priceEur)}${car.vat === "ex" ? " plus VAT" : ""}`);
// Its full address on the dealer's website, while it has a page there: not sold, a draft or hidden, and its kind on the plan.
export const replyLink = (car: ReplyCar, siteUrl: string, modules: Set<ModuleId>) => (siteUrl && !isSold(car) && !car.listing && conditionShown(modules, car.condition) ? siteCarUrl(siteUrl, car.slug) : undefined);

export type Reply = { subject: string; body: string };
// `from`: the staff member's name (none when not known); `title`: the car as the lead names it; `car`: that car in stock, if it still is.
export function firstReply(o: { name: string; from: string; dealer: string; title?: string; car?: ReplyCar; siteUrl: string; modules: Set<ModuleId> }): Reply {
  const { car, title } = o;
  const price = car && replyPrice(car);
  const link = car && replyLink(car, o.siteUrl, o.modules);
  const lines = [
    `Hi ${firstName(o.name)},`,
    `${o.from ? `This is ${o.from} at ${o.dealer}` : `This is ${o.dealer}`}. Thanks for getting in touch${title ? ` about the ${title}` : ""}.`,
    car && isSold(car) ? "It has sold, but we can help you find something like it." : price && `It is ${price}.`,
    link && `You can see it here: ${link}`,
  ];
  return { subject: title ? `The ${title}` : `Your message to ${o.dealer}`, body: lines.filter(Boolean).join("\n\n") };
}

// The Email and WhatsApp links, with the reply filled in when there is one.
export const mailtoHref = (email: string, reply?: Reply) => `mailto:${email}${reply ? `?subject=${encodeURIComponent(reply.subject)}&body=${encodeURIComponent(reply.body)}` : ""}`;

// For a page of leads (the lead, Leads rows, To do): each one's first reply, or none once it has been answered (later replies start blank).
// Once a request, however many parts of the page ask.
export const firstReplies = cache(async (): Promise<(lead: Pick<Lead, "name" | "status" | "carTitle" | "carSlug">) => Reply | undefined> => {
  const [stock, { name: dealer, profile }, me, modules] = await Promise.all([adminCars(), currentDealer(), currentMember(), enabledModules()]);
  return (lead) => (lead.status === "new" ? firstReply({ name: lead.name, from: me.name, dealer, title: lead.carTitle, car: askedCar(stock, lead.carSlug), siteUrl: profile.siteUrl, modules }) : undefined);
});
