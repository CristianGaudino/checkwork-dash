"use client";

import { useDealerFacts } from "@/components/DealerFacts";
import { driveTimes } from "@/lib/leads/constants";
import { useKeptForm } from "@/components/admin/useKeptForm";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper, useStepHeading } from "@/components/leads/Stepper";
import { showToast } from "@/components/toast";
import { Field, FormActions, adminButton, adminButtonQuiet, adminInput } from "@/components/admin/kit";
import { BUSY } from "@/components/admin/ActButton";
import { DialogCancel } from "@/components/admin/Dialog";
import { EditDialog } from "@/components/admin/EditDialog";
import { PersonPicker } from "@/components/admin/PersonPicker";
import { CarPicker } from "@/components/admin/CarPicker";
import { SlotPicker } from "@/components/admin/SlotPicker";
import { addDriveAction, moveDriveAction, type DriveFormState } from "@/app/test-drives/actions";
import type { CarCard } from "@/lib/admin/car-cards";
import { DRIVE_LIMITS, drivePhoneError } from "@/lib/admin/drives";
import { NAME_REQUIRED } from "@/lib/copy";
import { slugId } from "@/lib/admin/stock-admin-pure";
import { firstOpen } from "@/lib/admin/slots";

// What the slot picker is given (slotData on the server, `taken` by car id) and the length of a slot from Settings.
export type Slots = { days: string[]; taken: Record<string, string[]>; now: string; windowMin: number };

const STEPS = ["Choose a car", "Choose a time", "Who is driving"]; // worded as the post wizard's steps
// The step a server error belongs to, so a refused booking opens where it can be fixed.
const stepOf = (e: Record<string, string>) => (e.carSlug ? 0 : e.date || e.time ? 1 : 2);

// A booking taken by phone or at the desk, in three steps: the car from photo cards, a free time from the picker (the car's other bookings
// and past times cannot be picked), then the customer and who takes them out. Every field stays in one form. The server checks it all
// again and refuses a clash; once booked, the booking opens. `person`: the name and number filled in, from a lead
// (with its id, so booking moves the lead on) or a past booking (Rebook).
export function BookDriveForm({ cars, team, me, slots, initialCar, person }: { cars: CarCard[]; team: string[]; me: string; slots: Slots; initialCar: string; person?: { leadId?: string; name: string; phone: string; email: string } }) {
  const router = useRouter();
  const start = cars.some((c) => c.slug === initialCar) ? initialCar : "";
  const [step, setStep] = useState(start ? 1 : 0);
  // A refused booking goes back to the step with the problem; a booking made opens on its own page.
  const [state, action, pending] = useKeptForm<DriveFormState>(async (prev, data) => {
    const r = await addDriveAction(prev, data);
    if (r?.errors) setStep(stepOf(r.errors));
    if (r?.done) {
      showToast(r.done);
      router.push(`/test-drives/${r.id}`);
    }
    return r;
  }, undefined);
  // A field showing an error is checked again as it is typed in, so the error goes once it is fixed. `of`: the answer these checks follow.
  const [fixes, setFixes] = useState<{ of?: DriveFormState; e: Record<string, string | undefined> }>({ e: {} });
  const e = { ...state?.errors, ...(fixes.of === state ? fixes.e : {}) };
  const recheck = ({ target: t }: React.ChangeEvent<HTMLElement>) => {
    if (!(t instanceof HTMLInputElement) || !state?.errors?.[t.name]) return;
    const error = t.name === "name" ? (t.value.trim() ? undefined : NAME_REQUIRED) : t.name === "phone" ? drivePhoneError(t.value) : t.name === "email" && t.value.trim() ? state.errors.email : undefined; // email stays wrong until the server checks it again: the browser's rule is looser than the server's
    setFixes({ of: state, e: { ...(fixes.of === state ? fixes.e : {}), [t.name]: error } });
  };
  const [car, setCar] = useState(start);
  // The picker opens on the car's first free time, never on a day with nothing left (#238).
  const { hours } = useDealerFacts();
  const firstFor = (slug: string) => firstOpen(slots.days, slots.taken[slugId(slug)] ?? [], slots.windowMin, slots.now, (d) => driveTimes(d, hours)) ?? { date: slots.days[0] ?? "", time: "" };
  const [when, setWhen] = useState(() => firstFor(start));

  const heading = useStepHeading(step);

  const picked = cars.find((c) => c.slug === car);
  return (
    <form {...action} noValidate className="flex max-w-3xl flex-col gap-5">
      <Stepper titles={STEPS} step={step} headingRef={heading} />
      <input type="hidden" name="carSlug" value={car} />
      {person?.leadId && <input type="hidden" name="leadId" value={person.leadId} />}

      <section hidden={step !== 0}>
        <CarPicker
          cars={cars}
          value={car}
          onPick={(slug) => {
            if (slug !== car) setWhen(firstFor(slug)); // another car has other free times
            setCar(slug);
            setStep(1);
          }}
        />
        {e.carSlug && <p className="mt-2 text-meta text-destructive">{e.carSlug}</p>}
      </section>

      <section hidden={step !== 1} className="flex flex-col gap-4">
        {picked && <p className="text-body text-text-2">{picked.title}</p>}
        <SlotPicker key={car} days={slots.days} taken={slots.taken[slugId(car)] ?? []} windowMin={slots.windowMin} now={slots.now} date={when.date} time={when.time} onChange={(date, time) => setWhen({ date, time })} errors={{ date: e.date, time: e.time }} />
      </section>

      <section hidden={step !== 2} onChange={recheck} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" error={e.name}>
          <input name="name" defaultValue={person?.name} className={adminInput} autoComplete="off" maxLength={DRIVE_LIMITS.name} />
        </Field>
        <Field label="Phone" error={e.phone}>
          <input name="phone" type="tel" defaultValue={person?.phone} className={adminInput} autoComplete="off" maxLength={DRIVE_LIMITS.phone} />
        </Field>
        <Field label="Email (optional)" error={e.email}>
          <input name="email" type="email" defaultValue={person?.email} className={adminInput} autoComplete="off" />
        </Field>
        <Field label="Who takes them out">
          <PersonPicker label="Who takes them out" team={team} value={team.includes(me) ? me : ""} me={me} />
        </Field>
        <Field label="Notes (optional)" className="sm:col-span-2">
          <input name="notes" maxLength={DRIVE_LIMITS.notes} className={adminInput} />
        </Field>
      </section>

      {/* Step 1 has no buttons (picking a car moves on), so no empty divider either. */}
      <div className={`${step > 0 ? "flex" : "hidden"} flex-wrap items-center justify-end gap-3 border-t border-hairline pt-4`}>
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className={adminButtonQuiet}>
            Back
          </button>
        )}
        {step === 1 && (
          <button type="button" disabled={!when.time} onClick={() => setStep(2)} className={`${adminButton} disabled:opacity-50`}>
            Next
          </button>
        )}
        {step === 2 && (
          <button type="submit" disabled={pending} className={adminButton}>
            {pending ? "Booking" : "Book test drive"}
          </button>
        )}
      </div>
    </form>
  );
}

// Moving a booking: a new free time for the same car, by the same rules as a new one, in the house dialog (#141) opened from the booking.
export function MoveDrive({ id, carSlug, slots }: { id: string; carSlug: string; slots: Slots }) {
  return (
    <EditDialog title="Change the time" text="A free time for the same car" label="Change time">
      {(done) => <MoveDriveForm id={id} carSlug={carSlug} slots={slots} done={done} />}
    </EditDialog>
  );
}

function MoveDriveForm({ id, carSlug, slots, done }: { id: string; carSlug: string; slots: Slots; done: () => void }) {
  const router = useRouter();
  const [when, setWhen] = useState({ date: "", time: "" });
  const [state, action, pending] = useKeptForm<DriveFormState>(async (prev, data) => {
    const r = await moveDriveAction(id, prev, data);
    if (r?.done) {
      showToast(r.done);
      done();
      router.refresh();
    }
    return r;
  }, undefined);
  return (
    <form {...action} noValidate className="flex flex-col gap-4">
      <SlotPicker days={slots.days} taken={slots.taken[slugId(carSlug)] ?? []} windowMin={slots.windowMin} now={slots.now} date={when.date} time={when.time} onChange={(date, time) => setWhen({ date, time })} errors={state?.errors} />
      <FormActions>
        <DialogCancel />
        <button type="submit" disabled={pending || !when.time} aria-busy={pending || undefined} className={`${adminButton} ${BUSY} disabled:opacity-50`}>
          {pending ? "Moving" : "Move"}
        </button>
      </FormActions>
    </form>
  );
}
