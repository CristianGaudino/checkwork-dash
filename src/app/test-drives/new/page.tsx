import { dealerProfile } from "@/lib/tenancy/current";
import { BookDriveForm } from "@/components/admin/AddDriveForm";
import { PageHeader } from "@/components/admin/kit";
import { carCards } from "@/lib/admin/car-cards";
import { drivesStore, getSettings, leadsStore } from "@/lib/admin/collections";
import { slotData } from "@/lib/admin/drives";
import { adminCars } from "@/lib/admin/stock-admin";
import { askedCar } from "@/lib/leads/journey";
import { currentMember } from "@/lib/permissions";
import { forSale } from "@/lib/stock/types";

export const metadata = { title: "Book a test drive" };

// A booking taken by phone or at the desk, in steps. ?car= starts on that car; ?lead= (Book a test drive on a lead) fills in their car,
// name and number, so booking from a call is a time and a press. ?rebook= (Rebook on a booking that is over) fills in that booking's
// person and car, read from the store by its id, so no name or number travels in the address. Only a prefill: booking checks it all again.
// A car no longer for sale is not among the cards, so the form opens at the car step.
export default async function Page({ searchParams }: { searchParams: Promise<{ car?: string; lead?: string; rebook?: string }> }) {
  const sp = await searchParams;
  const id = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);
  const [cars, drives, settings, me, lead, { hours }] = await Promise.all([adminCars(), drivesStore.list(), getSettings(), currentMember(), id(sp.lead) ? leadsStore.get(id(sp.lead)!) : undefined, dealerProfile()]);
  const again = id(sp.rebook) && !lead ? drives.find((d) => d.id === id(sp.rebook)) : undefined;
  const from = lead ?? again;
  const onSale = cars.filter(forSale).sort((a, b) => Number(b.id) - Number(a.id));
  return (
    <>
      <PageHeader title="Book a test drive" back={{ href: "/test-drives", label: "Test drives" }} />
      <BookDriveForm cars={carCards(onSale)} team={settings.team.map((t) => t.name)} me={me.name} slots={{ ...slotData(drives, hours), windowMin: settings.driveSlotMinutes }} initialCar={(typeof sp.car === "string" ? sp.car : undefined) ?? askedCar(cars, from?.carSlug)?.slug ?? from?.carSlug ?? ""} person={from && { leadId: lead?.id, name: from.name, phone: from.phone, email: from.email }} />
    </>
  );
}
