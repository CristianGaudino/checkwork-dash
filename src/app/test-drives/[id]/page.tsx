import { dealerProfile } from "@/lib/tenancy/current";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonPicker } from "@/components/admin/PersonPicker";
import { currentMember } from "@/lib/permissions";
import { MoveDrive } from "@/components/admin/AddDriveForm";
import { DriveStatusBadge } from "@/components/admin/badges";
import { DriveSteps } from "@/components/admin/DriveSteps";
import { Badge, Facts, PageHeader, Panel } from "@/components/admin/kit";
import { drivesStore, getSettings } from "@/lib/admin/collections";
import { isOpenDrive, slotData } from "@/lib/admin/drives";
import { dublinDay, fmtDateTime, fmtDay, fmtTime } from "@/lib/admin/format";
import { adminCars } from "@/lib/admin/stock-admin";
import { askedCar } from "@/lib/leads/journey";
import { forSale } from "@/lib/stock/types";
import { assignDriveAction } from "../actions";
import { ContactButtons } from "@/components/admin/ContactButtons";

export const metadata = { title: "Test drive" };

const when = (t: number) => `${fmtDay(dublinDay(t))}, ${fmtTime(t)}`;

// One booking: who, which car, when; its next step and who takes them out (each with Undo); and moving it to another free time.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await drivesStore.get(id);
  if (!d) notFound();
  const [cars, drives, settings, { hours }, me] = await Promise.all([adminCars(), drivesStore.list(), getSettings(), dealerProfile(), currentMember()]);
  const car = askedCar(cars, d.carSlug); // by its id: an edit to the make, model or year gives the car a new slug
  const open = isOpenDrive(d);
  const team = settings.team.map((t) => t.name);
  return (
    <>
      <PageHeader title={d.name} text={`${d.carTitle}, ${fmtDateTime(d.startsAt)}`} back={{ href: "/test-drives", label: "Test drives" }} />
      <div className="grid grid-cols-1 gap-6 wide:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Read first; Change time opens the free times in the house dialog (#141). */}
          <Panel title="The booking" action={open ? <MoveDrive id={d.id} carSlug={d.carSlug} slots={{ ...slotData(drives, hours, d.id), windowMin: settings.driveSlotMinutes }} /> : undefined}>
            <Facts
              items={[
                ["When", when(d.startsAt)],
                ["Car", car ? <span key="c" className="flex flex-wrap items-center gap-2"><Link href={`/stock/${car.id}`} className="font-medium text-accent-text hover:underline">{d.carTitle}</Link>{open && !forSale(car) && <Badge tone="warn">No longer for sale</Badge>}</span> : d.carTitle],
                // Plain text: Call and Email are the buttons below.
                ["Phone", d.phone],
                ["Email", d.email ? <span key="e" className="[overflow-wrap:anywhere]">{d.email}</span> : "Not given"],
                ...(d.notes ? [["Notes", d.notes] as const] : []),
                ["Booked", fmtDateTime(d.createdAt)],
              ] as const}
            />
            <ContactButtons phone={d.phone} email={d.email || undefined} />
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-6 narrow:order-first">
          <Panel title="Status" action={<DriveStatusBadge status={d.status} />}>
            {/* The steps due now, or Rebook once it is over. A confirmed drive still to come has none: Cancel only. */}
            <DriveSteps drive={d} page />
            <div className="flex flex-col gap-1">
              <label htmlFor="taking-them-out" className="text-meta text-text-2">Taking them out</label>
              <PersonPicker id="taking-them-out" label="Taking them out" team={team} value={d.assignedTo} me={me.name} action={assignDriveAction.bind(null, d.id)} />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
