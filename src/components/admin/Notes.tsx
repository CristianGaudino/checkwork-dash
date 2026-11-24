"use client";

import { useState } from "react";
import { Field, FormActions, Panel, adminButton, adminInput, rowButton } from "@/components/admin/kit";
import { Dialog, DialogCancel } from "@/components/admin/Dialog";
import { useAct } from "@/components/admin/ActSelect";
import { BUSY } from "@/components/admin/ActButton";
import { PlusIcon } from "@/components/stock/icons";
import { fmtDateTime } from "@/lib/admin/format";
import { NOTE_MAX } from "@/lib/admin/note-max";
import type { Note } from "@/lib/admin/notes";

// The notes on a record (#138), read first: newest first, each with who and when ("You" for the signed-in person, `me`; WhatsApp for the
// replies the bot wrote; an older note kept no author). Add note opens the editor in the house dialog, so no empty box sits open on the
// page. Used by leads, orders and claims.
export function Notes({ notes, action, me, className }: { notes: Note[]; action: (data: FormData) => Promise<unknown>; me?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useAct();
  return (
    <Panel
      title="Notes"
      className={className}
      action={
        <button type="button" onClick={() => setOpen(true)} className={rowButton}>
          <PlusIcon aria-hidden="true" className="size-4 shrink-0" />
          Add note
        </button>
      }
    >
      {notes.length === 0 ? (
        <p className="text-body text-text-2">No notes yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {[...notes].sort((a, b) => b.at - a.at).map((n) => (
            <li key={n.at} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <span className="whitespace-pre-line text-body [overflow-wrap:anywhere]">{n.text}</span>
              <span className="text-meta text-text-2">
                {n.by ? `${n.by === me ? "You" : n.by} · ` : n.auto ? "From WhatsApp · " : ""}
                {fmtDateTime(n.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a note">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const note = String(new FormData(e.currentTarget).get("note") ?? "").trim();
            if (note) run(action, { note }, "Note added", undefined, { ok: () => setOpen(false) });
          }}
        >
          <Field label="Note">
            <textarea name="note" rows={5} maxLength={NOTE_MAX} required data-autofocus className={`${adminInput} h-auto w-full py-2`} />
          </Field>
          <FormActions>
            <DialogCancel />
            <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${adminButton} ${BUSY}`}>
              {pending ? "Adding" : "Add note"}
            </button>
          </FormActions>
        </form>
      </Dialog>
    </Panel>
  );
}
