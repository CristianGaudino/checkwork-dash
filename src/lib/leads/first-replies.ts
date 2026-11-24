import { cache } from "react";
import type { Lead } from "@/lib/admin/collections";
import { adminCars } from "@/lib/admin/stock-admin";
import { askedCar } from "@/lib/leads/journey";
import { enabledModules } from "@/lib/modules";
import { currentMember } from "@/lib/permissions";
import { currentDealer } from "@/lib/tenancy/current";
import { firstReply, type Reply } from "./first-reply";

// For a page of leads (the lead, Leads rows, To do): each one's first reply, or none once it has been answered (later replies start blank).
// Once a request, however many parts of the page ask.
export const firstReplies = cache(async (): Promise<(lead: Pick<Lead, "name" | "status" | "carTitle" | "carSlug">) => Reply | undefined> => {
  const [stock, { name: dealer, profile }, me, modules] = await Promise.all([adminCars(), currentDealer(), currentMember(), enabledModules()]);
  return (lead) => (lead.status === "new" ? firstReply({ name: lead.name, from: me.name, dealer, title: lead.carTitle, car: askedCar(stock, lead.carSlug), siteUrl: profile.siteUrl, modules }) : undefined);
});
