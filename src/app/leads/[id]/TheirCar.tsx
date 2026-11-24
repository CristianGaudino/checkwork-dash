"use client";

import { useEffect, useState, useTransition } from "react";
import { useKeptForm } from "@/components/admin/useKeptForm";
import { useRouter } from "next/navigation";
import { Field, FormActions, Panel, adminButton, adminInput, rowButton } from "@/components/admin/kit";
import { Dialog, DialogCancel } from "@/components/admin/Dialog";
import { BUSY } from "@/components/admin/ActButton";
import { Select } from "@/components/Select";
import { RegLookup } from "@/components/leads/RegLookup";
import { showToast } from "@/components/toast";
import { useModules } from "@/components/DealerFacts";
import { PencilIcon } from "@/components/stock/icons";
import { lookupRegStaffAction } from "@/app/reg-action";
import { CAR_CONDITIONS, type TheirCarFacts } from "./car";
import type { CarState } from "./car-actions";

type Save = (prev: CarState, data: FormData) => Promise<CarState>;
const figures = (v: string) => v.replace(/\D/g, "");
// What the dialog would post, plus what a look-up found; without the boxes a lead that is not selling has none of (car-actions.ts keeps those).
const formOf = (car: TheirCarFacts, selling: boolean, found: Partial<TheirCarFacts> = {}) => {
  const f = new FormData();
  const { condition, asking, ...rest } = { ...car, mileage: figures(car.mileage), asking: figures(car.asking), ...found };
  for (const [k, v] of Object.entries(selling ? { ...rest, condition, asking } : rest)) f.set(k, v);
  return f;
};

// The car a person wants to sell or trade in (#137), read first as facts: what it is (make, model, year), its plate, mileage, condition and
// what they are asking. Edit opens them in the house dialog, with the plate's Look up filling the make, model and year. A plate not looked
// up yet has Look up here too, which keeps what it finds, so the panel says what the car is before the call back.
// `selling`: a sell or trade-in lead. Any other lead with a plate (a service, a warranty claim) has no condition or asking price to give.
export function TheirCar({ car, selling, action }: { car: TheirCarFacts; selling: boolean; action: Save }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [, start] = useTransition();
  const what = [car.make, car.model].filter(Boolean).join(" ");
  const lookups = useModules().has("lookupDashboard");
  const all: [string, React.ReactNode][] = [
    ["Registration", car.reg && <span className="inline-block rounded border border-control bg-card px-2 font-semibold tracking-wide">{car.reg}</span>],
    ["Mileage", car.mileage],
    ...(selling ? ([["Condition", car.condition], ["Asking price", car.asking]] as [string, React.ReactNode][]) : []),
  ];
  const facts = all.filter(([, v]) => v);
  const missing = all.filter(([, v]) => !v).map(([label]) => label.toLowerCase());
  return (
    <Panel
      title="Their car"
      action={
        <button type="button" onClick={() => setOpen(true)} className={rowButton}>
          <PencilIcon aria-hidden="true" className="size-4 shrink-0" />
          Edit
          <span className="sr-only"> their car</span>
        </button>
      }
    >
      {what ? (
        <p className="text-heading font-semibold">
          {what}
          {car.year && <span className="font-normal text-text-2"> · {car.year}</span>}
        </p>
      ) : (
        car.reg &&
        lookups && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="mr-auto text-body text-text-2">Not looked up yet.</p>
            <RegLookup reg={car.reg} lookup={lookupRegStaffAction} place="dashboard" className="h-11 text-meta" onFound={({ year, car: found }) => found && start(async () => {
                  const r = await action(undefined, formOf(car, selling, { make: found.make, model: found.model, year: car.year || String(year) }));
                  router.refresh();
                  if (r?.errors) showToast(Object.values(r.errors)[0]!); // e.g. a site lead's Year of "2019/20": nothing was saved
                })} />
          </div>
        )
      )}
      {/* Two to a row on a phone too, and only what is known, so four short facts never stack into a tall column of Not given. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col">
            <dt className="text-meta text-text-2">{label}</dt>
            <dd className="text-body tabular-nums [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      {missing.length > 0 && <p className="text-meta text-text-2">{missing.join(", ").replace(/, ([^,]*)$/, " and $1").replace(/^./, (c) => c.toUpperCase())} not given.</p>}
      <Dialog open={open} onClose={() => setOpen(false)} title="Their car">
        <CarForm car={car} selling={selling} action={action} onSaved={() => (setOpen(false), showToast("Saved"))} />
      </Dialog>
    </Panel>
  );
}

function CarForm({ car, selling, action, onSaved }: { car: TheirCarFacts; selling: boolean; action: Save; onSaved: () => void }) {
  const [state, form, pending] = useKeptForm<CarState>(action, undefined);
  const [reg, setReg] = useState(car.reg);
  useEffect(() => {
    if (state?.saved && !pending) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer; onSaved is a new function each render
  }, [state, pending]);
  const e = state?.errors ?? {};
  // A look-up is asked for, so what it finds replaces what the boxes held (a plate typed anew is another car).
  const fill = (name: string, v: string) => {
    const box = form.ref.current?.elements.namedItem(name);
    if (box instanceof HTMLInputElement) box.value = v;
  };
  return (
    <form {...form} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Registration" error={e.reg} className="min-w-0 flex-1 basis-40">
          <input name="reg" value={reg} onChange={(ev) => setReg(ev.target.value)} autoCapitalize="characters" autoComplete="off" className={`${adminInput} w-full uppercase`} />
        </Field>
        <RegLookup
          reg={reg}
          lookup={lookupRegStaffAction}
          place="dashboard"
          className="h-11 text-meta"
          onFound={({ year, car: found }) => {
            if (found) {
              fill("make", found.make);
              fill("model", found.model);
            }
            fill("year", String(year));
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Field label="Make">
          <input name="make" defaultValue={car.make} maxLength={40} className={`${adminInput} w-full`} />
        </Field>
        <Field label="Model">
          <input name="model" defaultValue={car.model} maxLength={60} className={`${adminInput} w-full`} />
        </Field>
        <Field label="Year" error={e.year}>
          <input name="year" defaultValue={car.year} inputMode="numeric" maxLength={4} className={`${adminInput} w-full tabular-nums`} />
        </Field>
        <Field label="Mileage (km)" error={e.mileage}>
          <input name="mileage" defaultValue={figures(car.mileage)} inputMode="numeric" className={`${adminInput} w-full tabular-nums`} />
        </Field>
        {selling && (
          <>
            <Field label="Condition" error={e.condition}>
              <Select name="condition" defaultValue={car.condition} options={[["", "Not given"], ...CAR_CONDITIONS.map((c): [string, string] => [c, c])]} />
            </Field>
            <Field label="Asking price (€)" error={e.asking}>
              <input name="asking" defaultValue={figures(car.asking)} inputMode="numeric" className={`${adminInput} w-full tabular-nums`} />
            </Field>
          </>
        )}
      </div>
      <FormActions>
        <DialogCancel />
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${adminButton} ${BUSY}`}>
          {pending ? "Saving" : "Save"}
        </button>
      </FormActions>
    </form>
  );
}
