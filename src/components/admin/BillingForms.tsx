"use client";

import { useKeptForm } from "@/components/admin/useKeptForm";
import { Select } from "@/components/Select";
import { Field, FormActions, adminButton, adminInput } from "@/components/admin/kit";
import { DialogCancel } from "@/components/admin/Dialog";
import { EditDialog, useDoneOnSave } from "@/components/admin/EditDialog";
import { BUSY } from "@/components/admin/ActButton";
import { addAlertAction, saveDetailsAction, saveLimitsAction, type BillingState } from "@/app/billing/actions";
import type { Scope } from "@/lib/billing/rules";
import { eur, scopeName, type BillingDetails } from "@/lib/billing/bills-rules";

type Action = (prev: BillingState, data: FormData) => Promise<BillingState>;
function useSave(action: Action) {
  const [state, run, pending] = useKeptForm<BillingState>(action, undefined);
  return { state, run, pending, errors: state?.errors ?? {} };
}
// A dialog's Cancel and Save (or Add), bottom right with the main one right-most.
function DialogSave({ pending, add = false }: { pending: boolean; add?: boolean }) {
  return (
    <FormActions>
      <DialogCancel />
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${adminButton} ${BUSY}`}>
        {pending ? (add ? "Adding" : "Saving") : add ? "Add alert" : "Save"}
      </button>
    </FormActions>
  );
}

// Billing's limits, alerts and details are read on the page and changed in the house dialog (#141), as Settings is.
type Limits = { scopes: Scope[]; caps: Partial<Record<Scope, number>>; ceilings: Partial<Record<Scope, number>>; alertAt80: boolean };
export const LimitsEdit = (props: Limits) => (
  <EditDialog title="Monthly limits" text="At a limit the service stops for the rest of the month. Raising a limit works at once." what="monthly limits" saved="Limits saved">
    {(done) => <LimitsForm {...props} done={done} />}
  </EditDialog>
);
export const AlertAdd = ({ scopes }: { scopes: Scope[] }) => (
  <EditDialog add title="Add an alert" what="an alert" saved="Alert added">
    {(done) => <AlertForm scopes={scopes} done={done} />}
  </EditDialog>
);
export const DetailsEdit = ({ details }: { details: BillingDetails }) => (
  <EditDialog title="Billing details" what="billing details" saved="Saved">
    {(done) => <DetailsForm details={details} done={done} />}
  </EditDialog>
);

// A monthly limit for each service and for all usage together. Blank is no limit. `ceilings` are ours: shown, and the server holds to them.
function LimitsForm({ scopes, caps, ceilings, alertAt80, done }: Limits & { done: () => void }) {
  const f = useSave(saveLimitsAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {scopes.map((s) => {
          const ceiling = ceilings[s];
          return (
            <Field key={s} label={`${scopeName(s)} limit (€ a month)`} hint={ceiling !== undefined ? `Our limit for your account: ${eur(ceiling)}` : "Leave empty for no limit"} error={f.errors[`cap-${s}`]}>
              {/* The limit in force: a stored one above a ceiling set later shows as the ceiling, so an untouched field always saves. */}
              <input name={`cap-${s}`} inputMode="decimal" defaultValue={caps[s] === undefined ? "" : Math.min(caps[s], ceiling ?? Infinity)} className={adminInput} />
            </Field>
          );
        })}
      </div>
      <label className="flex min-h-11 items-center gap-3 text-body">
        <input type="checkbox" name="alertAt80" defaultChecked={alertAt80} className="size-5 shrink-0 accent-accent" />
        Tell me when usage reaches 80% of a limit
      </label>
      {f.errors.form && <p role="alert" className="text-meta text-destructive">{f.errors.form}</p>}
      <DialogSave pending={f.pending} />
    </form>
  );
}

function AlertForm({ scopes, done }: { scopes: Scope[]; done: () => void }) {
  const f = useSave(addAlertAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="flex flex-col gap-4" noValidate>
      <Field label="Tell me when">
        <Select name="scope" options={scopes.map((s) => [s, scopeName(s)] as const)} defaultValue={scopes[0]} label="Tell me when" />
      </Field>
      <Field label="passes (€)" error={f.errors.alert}>
        <input name="amount" inputMode="decimal" data-autofocus className={adminInput} />
      </Field>
      <DialogSave pending={f.pending} add />
    </form>
  );
}

function DetailsForm({ details, done }: { details: BillingDetails; done: () => void }) {
  const f = useSave(saveDetailsAction);
  useDoneOnSave(f.state, f.pending, done);
  return (
    <form {...f.run} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Company name" error={f.errors.company}>
          <input name="company" defaultValue={details.company} className={adminInput} />
        </Field>
        <Field label="VAT number" error={f.errors.vatNumber}>
          <input name="vatNumber" defaultValue={details.vatNumber} className={adminInput} />
        </Field>
        <Field label="Billing address" error={f.errors.address}>
          <input name="address" defaultValue={details.address} className={adminInput} />
        </Field>
        <Field label="Email bills go to" error={f.errors.email}>
          <input name="email" type="email" defaultValue={details.email} className={adminInput} />
        </Field>
      <div className="sm:col-span-2">
        <DialogSave pending={f.pending} />
      </div>
    </form>
  );
}
