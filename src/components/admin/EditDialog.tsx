"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { rowButton } from "./kit";
import { showToast } from "@/components/toast";
import { PencilIcon, PlusIcon } from "@/components/stock/icons";

// A panel's Edit (or Add) and the house dialog it opens (#141): the values are read on the page and changed here, as Notes, prep costs and
// Timings are. `children` is given `done`, which the form calls once its save went through: the dialog closes and `saved` shows as a toast.
// `what` finishes the button's name for a screen reader ("Edit" + " business details"); `label`, a name of its own, says more than Edit
// where Edit alone would read as the whole panel ("Change time" on a booking). Client components only (children is a function).
export function EditDialog({ title, text, what, label, add = false, saved, children }: { title: string; text?: string; what?: string; label?: string; add?: boolean; saved?: string; children: (done: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const Icon = add ? PlusIcon : PencilIcon;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={rowButton}>
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label ?? (add ? "Add" : "Edit")}
        {!label && <span className="sr-only"> {what}</span>}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} text={text}>
        {children(() => (setOpen(false), saved && showToast(saved)))}
      </Dialog>
    </>
  );
}

// Runs `done` once a form's answer is a save (`saved` set), never on a refusal, which keeps the dialog open with its errors.
export function useDoneOnSave(state: { saved?: unknown } | undefined, pending: boolean, done?: () => void) {
  useEffect(() => {
    if (state?.saved && !pending) done?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per answer; done is a new function each render
  }, [state, pending]);
}
