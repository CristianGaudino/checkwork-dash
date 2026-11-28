"use client";

import { useKeptForm } from "@/components/admin/useKeptForm";
import { Select } from "@/components/Select";
import { Field, FormActions, Panel, adminButton, adminInput } from "@/components/admin/kit";
import { DialogCancel } from "@/components/admin/Dialog";
import { EditDialog, useDoneOnSave } from "@/components/admin/EditDialog";
import { BUSY } from "@/components/admin/ActButton";
import { fmtEur } from "@/lib/admin/format";
import { openClaimAction, type CostState } from "@/app/aftersales/actions";
import type { FormState } from "@/lib/admin/validation";

// Opening a warranty claim on a car the dealer sold, and (margins only) what the repair cost. The server checks every box again.
export function OpenClaimForm({ sales, today, defaults }: { sales: { id: string; label: string }[]; today: string; defaults: { saleId?: string; fault?: string; leadId?: string } }) {
  const [state, action, pending] = useKeptForm<FormState>(openClaimAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form {...action} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      {defaults.leadId && <input type="hidden" name="leadId" value={defaults.leadId} />}
      <Field label="Car they bought" error={e.saleId} className="sm:col-span-2">
        <Select name="saleId" label="Car they bought" defaultValue={defaults.saleId ?? ""} options={[["", "Choose the car"], ...sales.map((s) => [s.id, s.label] as const)]} />
      </Field>
      <Field label="The fault" hint="What it is and when it started" error={e.fault} className="sm:col-span-2">
        <textarea name="fault" maxLength={1000} defaultValue={defaults.fault} className={`${adminInput} h-auto min-h-28 py-2`} />
      </Field>
      <Field label="Day they told us" error={e.openedOn}>
        <input name="openedOn" type="date" max={today} defaultValue={today} className={adminInput} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${adminButton} ${BUSY}`}>{pending ? "Saving" : "Open the claim"}</button>
      </div>
    </form>
  );
}

// A cost on a car (a warranty repair, a car's cost price), read first: the figure, and Edit to change it in the house dialog (#141). A
// refused figure says why under the box and keeps the dialog open; a save closes it and says so.
// `plain`: a section of a panel around it (a claim's aside), with no frame of its own.
export function CostPanel({ title, act, label, hint, costEur, plain = false }: { title: string; act: (prev: CostState, data: FormData) => Promise<CostState>; label: string; hint: string; costEur?: number; plain?: boolean }) {
  return (
    <Panel
      plain={plain}
      title={title}
      action={
        <EditDialog title={title} what={title.toLowerCase()} saved="Cost saved">
          {(done) => <CostForm act={act} label={label} hint={hint} costEur={costEur} done={done} />}
        </EditDialog>
      }
    >
      <p className={`text-heading font-semibold tabular-nums ${costEur === undefined ? "text-text-2" : ""}`}>{costEur === undefined ? "Not entered" : fmtEur(costEur)}</p>
    </Panel>
  );
}

function CostForm({ act, label, hint, costEur, done }: { act: (prev: CostState, data: FormData) => Promise<CostState>; label: string; hint: string; costEur?: number; done: () => void }) {
  const [state, action, pending] = useKeptForm<CostState>(act, undefined);
  useDoneOnSave(state, pending, done);
  return (
    <form {...action} className="flex flex-col gap-4" noValidate>
      <Field label={label} hint={hint} error={state?.error}>
        <input name="costEur" inputMode="numeric" defaultValue={costEur ?? ""} data-autofocus className={adminInput} />
      </Field>
      <FormActions>
        <DialogCancel />
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${adminButton} ${BUSY}`}>
          {pending ? "Saving" : "Save"}
        </button>
      </FormActions>
    </form>
  );
}
