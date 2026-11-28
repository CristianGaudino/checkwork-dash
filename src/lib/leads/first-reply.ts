import { fmtEur, siteCarUrl } from "@/lib/stock/format";
import { isSold, onRequest, type Car } from "@/lib/stock/types";
import { firstName } from "@/lib/whatsapp/rules";

// The first reply to a lead about a car carries its price and its link (#160): most dealers leave the price out, so ours never does.
type ReplyCar = Pick<Car, "slug" | "priceEur" | "vat" | "soldAt" | "reserved" | "listing">;

// What the first reply and the mock AI draft say of a car with a deposit on it.
export const RESERVED_LINE = "It's reserved at the moment, but we can let you know if that changes.";
// The price to give a buyer: none for a sold or reserved car (a price reads as on offer) or one on request.
export const replyPrice = (car: ReplyCar) => (isSold(car) || car.reserved || onRequest(car) ? undefined : `${fmtEur(car.priceEur)}${car.vat === "ex" ? " plus VAT" : ""}`);
// Its full address on the dealer's website, while it has a page there and is on offer: not sold, reserved, a draft or hidden, and its kind on the plan.
export const replyLink = (car: ReplyCar, siteUrl: string) => (siteUrl && !isSold(car) && !car.reserved && !car.listing ? siteCarUrl(siteUrl, car.slug) : undefined);

export type Reply = { subject: string; body: string };
// Who signs the reply: the staff member's name, or none when all we have is their email (someone not in the team) or a demo role.
export const replyFrom = (me: { name: string; email: string; role: string | null }) => (me.name && me.name !== me.email && me.name !== me.role && !me.name.includes("@") ? me.name : "");
// `from`: the staff member's name (none when not known); `title`: the car as the lead names it; `car`: that car in stock, if it still is.
export function firstReply(o: { name: string; from: string; dealer: string; title?: string; car?: ReplyCar; siteUrl: string }): Reply {
  const { car, title } = o;
  const price = car && replyPrice(car);
  const link = car && replyLink(car, o.siteUrl);
  const lines = [
    `Hi ${firstName(o.name)},`,
    `${o.from ? `This is ${o.from} at ${o.dealer}` : `This is ${o.dealer}`}. Thanks for getting in touch${title ? ` about the ${title}` : ""}.`,
    car && isSold(car) ? "It has sold, but we can help you find something like it." : car?.reserved ? RESERVED_LINE : price && `It's ${price}.`,
    link && `You can see it here: ${link}`,
  ];
  return { subject: title ? `The ${title}` : `Your message to ${o.dealer}`, body: lines.filter(Boolean).join("\n\n") };
}

// The Email and WhatsApp links, with the reply filled in when there is one.
export const mailtoHref = (email: string, reply?: Reply) => `mailto:${email}${reply ? `?subject=${encodeURIComponent(reply.subject)}&body=${encodeURIComponent(reply.body)}` : ""}`;
