import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/admin/kit";
import { SaleForm } from "@/components/admin/SaleForm";
import { LEAD_TYPE_LABELS, customersStore, getSettings, heldFor, leadsStore, reservationsStore, salesStore } from "@/lib/admin/collections";
import { dublinDay, fmtDate, fmtEur } from "@/lib/admin/format";
import { adminCar } from "@/lib/admin/stock-admin";
import { isAsked } from "@/lib/leads/journey";
import { can, currentMember } from "@/lib/permissions";
import { leadsIndex, reviewByWhatsApp, reviewPlace, reviewReach } from "@/lib/admin/review-ask";
import { stockSource } from "@/lib/stock-source";
import { currentDealer } from "@/lib/tenancy/current";
import { carName, priceLabel } from "@/lib/stock/format";
import { isSold } from "@/lib/stock/types";

// One name for the action on its button, heading and tab: Mark sold, Record sale (a sold car with none), Change the sale.
const titleOf = (was: unknown, sold: boolean) => (was ? "Change the sale" : sold ? "Record sale" : "Mark sold");
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [car, was] = await Promise.all([adminCar(id), salesStore.get(id)]);
  return { title: titleOf(was, Boolean(car && isSold(car))) };
}

// Mark sold in our version (the car is marked sold on the sale's day) and for a DoneDeal car whose ad came down, Record sale for a sold car
// with none, and Change the sale for one already recorded. A DoneDeal car still for sale is sold on DoneDeal first: the ad coming down is what asks.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [car, was, customers, { team }, me, source, reservations, leads] = await Promise.all([adminCar(id), salesStore.get(id), customersStore.list(), getSettings(), currentMember(), stockSource(), reservationsStore.list(), leadsStore.list()]);
  if (!car || (source === "donedeal" && !isSold(car) && !was && !car.takenDownAt)) notFound();
  if (was && !(await can("settings"))) notFound(); // changing a sale is for owners and managers (actions.ts)
  const today = dublinDay();
  const title = titleOf(was, isSold(car));
  // A deposit on the car: its buyer and salesperson start the form, and it becomes part of the sale.
  const held = heldFor(reservations, car.id);
  // The review tick, on a new sale only and with a review link: the customers who can be asked tick it by default.
  // WhatsApp counts only when a message would really go by it, as askForReview decides.
  const whatsapp = await reviewByWhatsApp();
  const theirLeads = leadsIndex(leads);
  const askable = !was && (await reviewPlace()) ? customers.filter((c) => reviewReach(c, theirLeads(c), whatsapp)).map((c) => c.id) : undefined;
  return (
    <>
      <PageHeader title={title} text={was ? carName(car) : `${carName(car)}, ${priceLabel(car)}`} back={isSold(car) ? { href: "/stock?view=sold", label: "Sold cars" } : { href: "/stock", label: "Stock" }} />
      <Panel>
        {held && <p className="max-w-measure text-body">A deposit of {fmtEur(held.depositEur)} was paid on this car. It is recorded as part of this sale.</p>}
        <SaleForm
          carId={car.id}
          today={today}
          submit={was ? "Save the sale" : isSold(car) ? "Record sale" : "Mark sold"}
          askable={askable}
          serviceMonths={(await currentDealer()).profile.rules.serviceMonths}
          team={team.map((t) => t.name)}
          me={team.some((t) => t.name === me.name) ? me.name : undefined}
          leads={leads.filter((l) => isAsked(l.carSlug, car.id) && l.status !== "lost" && l.status !== "spam").sort((a, b) => b.createdAt - a.createdAt).map((l) => ({ id: l.id, label: `${l.name}, ${LEAD_TYPE_LABELS[l.type].toLowerCase()}, ${fmtDate(l.createdAt)}` }))}
          customers={[...customers].sort((a, b) => a.name.localeCompare(b.name, "en-IE")).map((c) => ({ id: c.id, label: c.phone ? `${c.name}, ${c.phone}` : c.name }))}
          defaults={was ?? { priceEur: car.priceEur, soldOn: car.soldAt ?? today, salesperson: held?.salesperson ?? (team.some((t) => t.name === me.name) ? me.name : undefined), customerId: held?.customerId }}
        />
      </Panel>
    </>
  );
}
