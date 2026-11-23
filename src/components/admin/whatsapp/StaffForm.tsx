"use client";

import { saveStaffAction } from "@/app/whatsapp/actions";
import { Field, adminButton, adminInput } from "@/components/admin/kit";
import { useKeptForm } from "@/components/admin/useKeptForm";
import type { EventId } from "@/lib/whatsapp/rules";
import type { StaffPhone } from "@/lib/whatsapp/store";

// One person's WhatsApp number, alerts and quiet hours. A wrong field is shown on that field and the form keeps what was typed.
export function StaffForm({ id, p, allowed }: { id: string; p?: StaffPhone; allowed: { id: EventId; label: string }[] }) {
  const [state, form, pending] = useKeptForm(saveStaffAction.bind(null, id), undefined);
  const errors = state?.errors ?? {};
  return (
    <form {...form} noValidate className="flex flex-col gap-5 pb-5 pt-2 sm:pl-13">
      <Field label="WhatsApp number" hint="With the country code. Leave empty to unlink." error={errors.phone} className="max-w-sm">
        <input name="phone" type="tel" inputMode="tel" defaultValue={p?.phone ?? ""} maxLength={18} aria-invalid={Boolean(errors.phone)} className={adminInput} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-meta font-semibold">Alerts to get</legend>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {allowed.map((e) => (
            <label key={e.id} className="flex min-h-11 items-center gap-3 text-body">
              <input type="checkbox" name="alert" value={e.id} defaultChecked={(p?.alerts ?? []).includes(e.id)} className="size-5 shrink-0 accent-accent" />
              {e.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-meta font-semibold">Quiet hours</legend>
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <Field label="From" error={errors.quietFrom}>
            <input name="quietFrom" type="time" defaultValue={p?.quietFrom ?? ""} aria-invalid={Boolean(errors.quietFrom)} className={adminInput} />
          </Field>
          <Field label="Until" error={errors.quietTo}>
            <input name="quietTo" type="time" defaultValue={p?.quietTo ?? ""} aria-invalid={Boolean(errors.quietTo)} className={adminInput} />
          </Field>
        </div>
      </fieldset>
      <button type="submit" disabled={pending} className={`${adminButton} self-start`}>
        {pending ? "Saving" : "Save"}
      </button>
    </form>
  );
}
