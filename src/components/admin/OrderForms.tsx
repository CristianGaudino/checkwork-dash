"use client";

import { useKeptForm } from "@/components/admin/useKeptForm";
import { useState } from "react";
import { BUSY } from "@/components/admin/ActButton";
import { Dialog, DialogCancel } from "@/components/admin/Dialog";
import { PersonPicker } from "@/components/admin/PersonPicker";
import { Select } from "@/components/Select";
import { Choice, Field, FormActions, adminButton, adminInput, dangerButton } from "@/components/admin/kit";
import { BuyerFields } from "@/components/admin/BuyerFields";
import { cancelOrderAction, placeOrderAction } from "@/app/orders/actions";
import { DEPOSIT_METHODS } from "@/lib/admin/deposits";
import { monthChoices } from "@/lib/admin/format";
import { regPeriodLabel } from "@/lib/leads/reg-periods";
import type { FormState } from "@/lib/admin/validation";

// Placing a factory order, and cancelling one. The server checks every box again.
const grid = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";
const full = "sm:col-span-2 lg:col-span-3";

// One numbered part of a longer form: its number in a circle and a short name, then its boxes.
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-4 flex items-center gap-3 text-heading font-semibold">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-accent text-meta font-semibold text-on-accent">{n}</span>
        {title}
      </legend>
      <div className={grid}>{children}</div>
    </fieldset>
  );
}

export function PlaceOrderForm({ periods, month, team, me, customers, leadId }: { periods: string[]; month: string; team: string[]; me?: string; customers: { id: string; label: string }[]; leadId?: string }) {
  const [state, action, pending] = useKeptForm<FormState>(placeOrderAction, undefined);
  const e = state?.errors ?? {};
  return (
    // Four short numbered steps on one page, in the order the conversation goes: the car, who it is for, the money, when it comes. Optional
    // boxes say so, so the few that must be filled stand out.
    <form {...action} className="flex flex-col gap-8" noValidate>
      {leadId && <input type="hidden" name="leadId" value={leadId} />}
      <Step n={1} title="The car">
        <Field label="Make" error={e.make}>
          <input name="make" maxLength={40} className={adminInput} autoComplete="off" />
        </Field>
        <Field label="Model" error={e.model}>
          <input name="model" maxLength={60} className={adminInput} autoComplete="off" />
        </Field>
        <Field label="Colour (optional)" error={e.colour}>
          <input name="colour" maxLength={40} className={adminInput} autoComplete="off" />
        </Field>
        <Field label="Trim, engine and options (optional)" error={e.spec} className={full}>
          <input name="spec" maxLength={120} className={adminInput} autoComplete="off" />
        </Field>
      </Step>
      <Step n={2} title="Who it is for">
        <BuyerFields customers={customers} errors={e} />
      </Step>
      <Step n={3} title="Price and deposit">
        <Field label="Price (€)" error={e.priceEur}>
          <input name="priceEur" inputMode="numeric" className={adminInput} />
        </Field>
        <Field label="Deposit (€, optional)" error={e.depositEur}>
          <input name="depositEur" inputMode="numeric" className={adminInput} />
        </Field>
        <Field label="Deposit paid by" error={e.depositMethod}>
          <Select name="depositMethod" defaultValue="" options={[["", "No deposit"], ...DEPOSIT_METHODS.map((m) => [m, m] as const)]} />
        </Field>
      </Step>
      <Step n={4} title="When it comes">
        <Field label="Due" hint="The month the maker gave" error={e.expected}>
          {/* This month and the next 24, as the server allows. */}
          <Select name="expected" defaultValue="" options={[["", "Choose a month"], ...monthChoices(month, 25)]} />
        </Field>
        <Field label="Reg period" error={e.regPeriod}>
          <Select name="regPeriod" defaultValue={periods[1]} options={periods.map((p) => [p, regPeriodLabel(p)] as const)} />
        </Field>
        <Field label="Taken by" error={e.salesperson}>
          <PersonPicker name="salesperson" team={team} value={me} me={me} />
        </Field>
      </Step>
      <div className="flex justify-end border-t border-hairline pt-6">
        <button type="submit" disabled={pending} className={adminButton}>{pending ? "Saving" : "Place order"}</button>
      </div>
    </form>
  );
}

// Cancelling cannot be undone, so it is a button that opens the house dialog: what happened to the deposit, and the red button that cancels.
// The dialog is the asking, so nothing asks a second time. The server checks again and refuses anyone but an owner or manager.
export function CancelOrder({ id, depositEur }: { id: string; depositEur?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <FormActions>
        <button type="button" onClick={() => setOpen(true)} className={dangerButton}>
          Cancel the order
        </button>
      </FormActions>
      <Dialog open={open} onClose={() => setOpen(false)} title="Cancel this order?" text="This cannot be undone.">
        <CancelOrderForm id={id} depositEur={depositEur} />
      </Dialog>
    </>
  );
}

function CancelOrderForm({ id, depositEur }: { id: string; depositEur?: number }) {
  const [state, action, pending] = useKeptForm<FormState>(cancelOrderAction.bind(null, id), undefined);
  const [outcome, setOutcome] = useState(depositEur ? "refunded" : "none");
  const e = state?.errors ?? {};
  return (
    <form {...action} className="flex flex-col gap-4" noValidate>
      {depositEur ? (
        <Choice name="outcome" legend="The deposit was" value={outcome} onChange={setOutcome} error={e.outcome} options={[["refunded", "Refunded"], ["kept", "Kept, under our terms"]]} />
      ) : (
        <>
          <input type="hidden" name="outcome" value="none" />
          {e.outcome && <p role="alert" className="text-meta text-destructive">{e.outcome}</p>}
        </>
      )}
      {outcome === "refunded" && (
        <Field label="Refunded (€)" error={e.refundEur}>
          <input name="refundEur" inputMode="numeric" defaultValue={depositEur} className={adminInput} />
        </Field>
      )}
      <FormActions>
        {/* Not "Cancel": beside Cancel the order it would read as the same thing. */}
        <DialogCancel>Keep the order</DialogCancel>
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${dangerButton} ${BUSY}`}>
          {pending ? "Cancelling" : "Cancel the order"}
        </button>
      </FormActions>
    </form>
  );
}
