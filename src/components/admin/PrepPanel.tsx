"use client";

import { useEffect, useState } from "react";
import { useKeptForm } from "@/components/admin/useKeptForm";
import { Select } from "@/components/Select";
import { Field, FormActions, Panel, adminButton, adminInput, rowButton, rowDanger } from "@/components/admin/kit";
import { ActButton, BUSY } from "@/components/admin/ActButton";
import { Dialog, DialogCancel } from "@/components/admin/Dialog";
import { RowMenu } from "@/components/admin/RowMenu";
import { removePrepAction, savePrepAction, type PrepFormState } from "@/app/stock/actions";
import { PREP_KINDS, type PrepLine } from "@/lib/admin/prep";
import { fmtDate, fmtEur } from "@/lib/admin/format";
import { PencilIcon, PlusIcon } from "@/components/stock/icons";

// The row menu icon's width, so the total's amount lines up with the amounts above it.
const MENU_SPACE = "w-11 shrink-0";

// Prep costs on a car, read as a list of spend does in a banking app: what (and the note), when, how much, and the total under them. Add
// opens the house dialog; each line's menu changes or removes it. Margins permission only (the page and the server both check).
export function PrepPanel({ carId, lines }: { carId: string; lines: PrepLine[] }) {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState<PrepLine | undefined>(); // the line being changed, none for a new one (kept while the dialog closes)
  const edit = (l?: PrepLine) => (setLine(l), setOpen(true));
  const total = lines.reduce((s, l) => s + l.eur, 0);
  return (
    <Panel
      title="Prep costs"
      action={
        <button type="button" onClick={() => edit()} className={rowButton}>
          <PlusIcon aria-hidden="true" className="size-4 shrink-0" />
          Add<span className="sr-only"> a prep cost</span>
        </button>
      }
    >
      {lines.length === 0 ? (
        <p className="text-body text-text-2">None yet. Valet, tyres, NCT and the like go here, on top of the cost price.</p>
      ) : (
        <div className="-mx-5 flex flex-col">
          <ul className="flex flex-col">
            {lines.map((l) => (
              <li key={l.at} className="flex items-center gap-3 py-2 pl-5 pr-3 even:bg-row-alt">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{l.kind}</span>
                  <span title={l.note} className="truncate text-meta text-text-2">
                    {fmtDate(l.at)}
                    {l.note && ` · ${l.note}`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{fmtEur(l.eur)}</span>
                <RowMenu label={`More for ${l.kind}, ${fmtEur(l.eur)}`}>
                  <button type="button" onClick={() => edit(l)} className={rowButton}>
                    <PencilIcon aria-hidden="true" className="size-4 shrink-0" />
                    Edit
                  </button>
                  <ActButton act={removePrepAction.bind(null, carId, l.at)} confirm={{ title: `Remove ${l.kind}, ${fmtEur(l.eur)}?`, yes: "Remove" }} className={rowDanger}>
                    Remove
                  </ActButton>
                </RowMenu>
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-3 border-t border-hairline pb-0 pl-5 pr-3 pt-3 font-semibold">
            <span className="flex-1">Total</span>
            <span className="tabular-nums">{fmtEur(total)}</span>
            <span aria-hidden="true" className={MENU_SPACE} />
          </p>
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={line ? "Change prep cost" : "Add a prep cost"}>
        {/* Keyed on the line: the dialog draws its body once per closing, before the next line is chosen. */}
        <PrepForm key={line?.at ?? "new"} carId={carId} line={line} onSaved={() => setOpen(false)} />
      </Dialog>
    </Panel>
  );
}

// A save that works closes the dialog (the list shows the line); a refused one keeps it open with the errors by their fields.
function PrepForm({ carId, line, onSaved }: { carId: string; line?: PrepLine; onSaved: () => void }) {
  const [state, action, pending] = useKeptForm<PrepFormState>(savePrepAction.bind(null, carId, line?.at ?? null), undefined);
  const e = state?.errors ?? {};
  useEffect(() => {
    if (state?.saved && !pending) onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer; onSaved is a new function each render
  }, [state, pending]);
  return (
    // ref={null}: no reset after a save, which would show the old values while the sheet slides away; the dialog redraws the form on its next opening.
    <form {...action} ref={null} className="flex flex-col gap-4" noValidate>
      <Field label="For" error={e.kind}>
        <Select name="kind" defaultValue={line?.kind ?? ""} options={[["", "Choose"], ...PREP_KINDS.map((k) => [k, k] as const)]} />
      </Field>
      <Field label="Amount (€)" error={e.eur}>
        <input name="eur" inputMode="numeric" defaultValue={line?.eur ?? ""} className={adminInput} />
      </Field>
      <Field label="Note (optional)" error={e.note}>
        <input name="note" maxLength={80} defaultValue={line?.note ?? ""} className={adminInput} />
      </Field>
      <FormActions>
        <DialogCancel />
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${adminButton} ${BUSY}`}>
          {pending ? "Saving" : line ? "Save" : "Add"}
        </button>
      </FormActions>
    </form>
  );
}
