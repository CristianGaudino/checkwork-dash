"use client";

import { useKeptForm } from "@/components/admin/useKeptForm";
import { ActButton } from "@/components/admin/ActButton";
import { Badge, Field, adminButton, adminInput, rowDanger } from "@/components/admin/kit";
import { removeKeysAction, saveKeysAction, type SettingsState } from "@/app/settings/actions";

// One outside service's keys for the owner (#26). The values are password boxes and are never sent back: a saved service says only "Saved".
export function ServiceKeys({ id, name, fields, saved }: { id: string; name: string; fields: [string, string][]; saved: boolean }) {
  const [state, run, pending] = useKeptForm<SettingsState>(saveKeysAction.bind(null, id), undefined);
  const form = (
    <form {...run} className="flex flex-col gap-3" noValidate autoComplete="off">
      {fields.map(([key, label]) => (
        <Field key={key} label={label}>
          <input type="password" name={key} autoComplete="off" spellCheck={false} className={`${adminInput} font-mono`} />
        </Field>
      ))}
      {state?.errors?.form && <p role="alert" className="text-meta text-bad">{state.errors.form}</p>}
      <div>
        <button type="submit" disabled={pending} className={adminButton}>{pending ? "Saving" : saved ? "Replace" : "Connect"}</button>
      </div>
    </form>
  );
  return (
    <li className="flex flex-col gap-3 border-t border-hairline py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-medium">
          {name}
          {saved && <Badge tone="good">Saved</Badge>}
        </span>
        {saved && (
          <ActButton act={removeKeysAction.bind(null, id)} confirm={{ title: `Remove the keys for ${name}?`, text: "The service stops working until you connect it again.", yes: "Remove" }} className={rowDanger}>
            Remove
          </ActButton>
        )}
      </div>
      {saved ? (
        <details>
          <summary className="min-h-11 cursor-pointer text-body font-medium text-accent-text">Replace the keys</summary>
          <div className="pt-2">{form}</div>
        </details>
      ) : (
        form
      )}
    </li>
  );
}
