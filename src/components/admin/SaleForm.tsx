"use client";

import { useState } from "react";
import { useKeptForm } from "@/components/admin/useKeptForm";
import { Select } from "@/components/Select";
import { Field, adminButton, adminInput } from "@/components/admin/kit";
import { BuyerFields } from "@/components/admin/BuyerFields";
import { PersonPicker } from "@/components/admin/PersonPicker";
import { recordSaleAction } from "@/app/stock/actions";
import { COVER_CHOICES, COVER_MONTHS } from "@/lib/admin/deposits";
import type { FormState } from "@/lib/admin/validation";

// The sale of one car: price, day, salesperson, and the buyer (a customer on file, or a new one). The server checks every box again.
// `leads`: this car's leads, to say which one it came from (it is marked won). `askable`: the customers who can be asked for a Google review
// (an email, or WhatsApp opted in); without it (no review link, or Change the sale) there is no tick. On by default for one of them, or a
// new buyer with an email, until staff tick or untick it.
export type SaleDefaults = { priceEur: number; soldOn: string; salesperson?: string; customerId?: string; coverMonths?: number; tradeIn?: { reg: string; allowanceEur: number }; leadId?: string; nctDue?: string; serviceDue?: string };
// `serviceMonths`: the dealer's rule, said under the service box (left blank, the service is due that long after the sale).
export function SaleForm({ carId, defaults, today, team, me, customers, leads, submit, askable, serviceMonths }: { carId: string; defaults: SaleDefaults; today: string; team: string[]; me?: string; customers: { id: string; label: string }[]; leads: { id: string; label: string }[]; submit: string; askable?: string[]; serviceMonths: number }) {
  const [state, action, pending] = useKeptForm<FormState>(recordSaleAction.bind(null, carId), undefined);
  const e = state?.errors ?? {};
  const [buyer, setBuyer] = useState(defaults.customerId ?? "");
  const [email, setEmail] = useState(false);
  const [ask, setAsk] = useState<boolean>();
  const typed = (ev: React.FormEvent<HTMLFormElement>) => {
    const t = ev.target as HTMLInputElement;
    if (t.name === "email") setEmail(t.value.trim() !== "");
  };
  return (
    // In three short parts, each under its heading: the sale, who bought it, and the extras most sales leave as they are.
    <form {...action} onChange={typed} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
      <h2 className="text-section font-semibold sm:col-span-2 lg:col-span-3">The sale</h2>
      <Field label="Sale price (€)" error={e.priceEur}>
        <input name="priceEur" inputMode="numeric" defaultValue={defaults.priceEur} className={adminInput} />
      </Field>
      <Field label="Day it sold" error={e.soldOn}>
        <input name="soldOn" type="date" max={today} defaultValue={defaults.soldOn} className={adminInput} />
      </Field>
      <Field label="Sold by" error={e.salesperson}>
        <PersonPicker name="salesperson" team={team} value={defaults.salesperson} me={me} none="Not set" />
      </Field>
      <h2 className="mt-2 text-section font-semibold sm:col-span-2 lg:col-span-3">The buyer</h2>
      <BuyerFields customers={customers} defaultId={defaults.customerId} errors={e} onPick={(id) => (setBuyer(id), setEmail(false))} />
      {askable && (
        <label className="flex min-h-11 items-center gap-3 text-body sm:col-span-2 lg:col-span-3">
          <input type="checkbox" name="askReview" checked={ask ?? (buyer ? askable.includes(buyer) : email)} onChange={(ev) => setAsk(ev.target.checked)} className="size-5 shrink-0 accent-accent" />
          Ask them for a Google review
        </label>
      )}
      <h2 className="mt-2 text-section font-semibold sm:col-span-2 lg:col-span-3">Warranty, trade-in and reminders</h2>
      <Field label="Warranty" error={e.coverMonths}>
        <Select name="coverMonths" defaultValue={String(defaults.coverMonths ?? COVER_MONTHS)} options={COVER_CHOICES.map((m) => [String(m), m === COVER_MONTHS ? `${m} months, included` : `${m} months, extended`] as const)} />
      </Field>
      <Field label="Trade-in registration (optional)" error={e.tradeReg}>
        <input name="tradeReg" defaultValue={defaults.tradeIn?.reg} autoCapitalize="characters" className={adminInput} autoComplete="off" />
      </Field>
      <Field label="Trade-in allowance (€)" error={e.tradeEur}>
        <input name="tradeEur" inputMode="numeric" defaultValue={defaults.tradeIn?.allowanceEur} className={adminInput} />
      </Field>
      <Field label="NCT due (optional)" hint="Leave blank to use the history check" error={e.nctDue}>
        <input name="nctDue" type="date" defaultValue={defaults.nctDue} className={adminInput} />
      </Field>
      <Field label="Service due (optional)" hint={`Leave blank for ${serviceMonths} months after the sale`} error={e.serviceDue}>
        <input name="serviceDue" type="date" defaultValue={defaults.serviceDue} className={adminInput} />
      </Field>
      {leads.length > 0 && (
        <Field label="From the lead (optional)" hint="It is marked won" error={e.leadId} className="sm:col-span-2 lg:col-span-3">
          <Select name="leadId" defaultValue={defaults.leadId ?? ""} options={[["", "None"], ...leads.map((l) => [l.id, l.label] as const)]} />
        </Field>
      )}
      <div className="flex justify-end sm:col-span-2 lg:col-span-3">
        <button type="submit" disabled={pending} className={adminButton}>
          {pending ? "Saving" : submit}
        </button>
      </div>
    </form>
  );
}
