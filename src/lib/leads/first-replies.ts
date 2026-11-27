import { cache } from "react";
import type { Lead } from "@/lib/admin/collections";
import { adminCars } from "@/lib/admin/stock-admin";
import { askedCar } from "@/lib/leads/journey";
import { currentMember } from "@/lib/permissions";
import { currentDealer } from "@/lib/tenancy/current";
import type { Car } from "@/lib/stock/types";
import { firstReply, replyFrom, type Reply } from "./first-reply";

// For a page of leads (the lead, Leads rows, To do): each one's first reply, or none once it has been answered (later replies start blank).
// Once a request, however many parts of the page ask. `stock`: the cars when the caller already read them, so they are not read again.
export const firstReplies = cache(async (stock?: Car[]): Promise<(lead: Pick<Lead, "name" | "status" | "carTitle" | "carSlug">) => Reply | undefined> => {
  const [cars, { name: dealer, profile }, me] = await Promise.all([stock ?? adminCars(), currentDealer(), currentMember()]);
  const from = replyFrom(me);
  return (lead) => (lead.status === "new" ? firstReply({ name: lead.name, from, dealer, title: lead.carTitle, car: askedCar(cars, lead.carSlug), siteUrl: profile.siteUrl }) : undefined);
});
