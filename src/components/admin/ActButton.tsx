"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/toast";
import { Dialog } from "./Dialog";
import { FormActions, adminButton, adminButtonQuiet, choicePill, dangerButton as danger } from "./kit";

// `safe`: the yes deletes or loses nothing (post it now, mark it arrived), so it is the main button, not the red one.
export type Confirm = { title: string; text?: string; yes: string; safe?: boolean };

// One dashboard button that runs a server action. Two safety nets, chosen per button:
// - `confirm`: something that cannot be taken back (a delete, a send) asks first, in a native modal dialog. Escape or Cancel does nothing.
// - `done` and `undo`: something that can be taken back runs at once and says so in the toast, with Undo when `undo` is given.
// An action that redirects (a delete that leaves the page) goes there itself; the toast is for the actions that stay.
// The dialog is made on the first ask, in the page's body, so a button inside a menu that closes (RowMenu) can still ask; it then stays
// mounted (undefined until asked), so the house dialog's exit plays when it closes.
// `pressed`: the button is one choice of a few (a status, who has it) and this is the one now; choosing it again does nothing.
// A button whose action is running (aria-busy): dimmed, a wait cursor and a gentle pulse that stands still under reduced motion, so a tap
// that takes a second is seen to be working. SubmitButton uses it too.
export const BUSY = "aria-busy:cursor-progress aria-busy:opacity-70 motion-safe:aria-busy:animate-pulse";

export const errorOf = (r: unknown) => (r && typeof r === "object" && "error" in r && typeof r.error === "string" ? r.error : undefined);

export function ActButton({ act, undo, done, confirm, label, pressed, className, children }: { act: () => Promise<unknown>; undo?: () => Promise<unknown>; done?: string; confirm?: Confirm; label?: string; pressed?: boolean; className: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<boolean>();
  const run = () =>
    start(async () => {
      const r = await act();
      router.refresh();
      // An action that refused says why ({ error }); the toast says that, never `done`. Undo too: refused, it says why.
      const error = errorOf(r);
      if (error) showToast(error);
      else if (done)
        showToast(done, undo && (() => start(async () => {
          const back = await undo();
          router.refresh();
          const e = errorOf(back);
          if (e) showToast(e);
        })));
    });
  return (
    <>
      <button type="button" aria-label={label} aria-pressed={pressed} disabled={pending} aria-busy={pending || undefined} onClick={() => (pressed ? undefined : confirm ? setAsking(true) : run())} className={`${className} ${BUSY}`}>
        {children}
      </button>
      {confirm && asking !== undefined && <ConfirmDialog open={asking} confirm={confirm} onYes={run} onClose={() => setAsking(false)} yesClassName={confirm.safe ? adminButton : danger} />}
    </>
  );
}

// The question asked before something that cannot be taken back: the house dialog, in the page's body. Escape or Cancel does nothing.
// `yesClassName`: the yes button, the danger one unless the action is not destructive. `open`: for an opener that keeps it mounted, so its
// exit plays; one that mounts it only while asking leaves it out.
// The wrapper stops cancel and close here: React passes them up its own tree, through the portal, so Escape would also close a dialog
// this one was asked from (a review's reply, e2e/motion-actions.spec.ts).
export function ConfirmDialog({ open = true, confirm, onYes, onClose, yesClassName = danger }: { open?: boolean; confirm: Confirm; onYes: () => void; onClose: () => void; yesClassName?: string }) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="contents" {...{ onCancel: stop, onClose: stop }}>
      <Dialog open={open} onClose={onClose} title={confirm.title} text={confirm.text}>
        <FormActions>
          {/* Focus starts on Cancel, the choice that loses nothing. Nothing here to ask about, so it closes as Escape does. */}
          <button type="button" data-autofocus onClick={(e) => e.currentTarget.closest("dialog")?.close()} className={adminButtonQuiet}>Cancel</button>
          <button type="button" onClick={(e) => (e.currentTarget.closest("dialog")?.close(), onYes())} className={yesClassName}>{confirm.yes}</button>
        </FormActions>
      </Dialog>
    </div>,
    document.body,
  );
}

// One of a few choices (a status, who has it, a follow-up) that posts a form action, with Undo: `set` is what this choice sends, `back` what
// puts it back as it was (left out when there is no way back). The action checks every value, as it does for a form.
export const formOf = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
// `label`: the button's name for a screen reader when it repeats down a list ("Mark contacted: Mary Byrne"); it starts with the words shown.
export function ChoiceAct({ action, set, back, active, done, confirm, label, className, children }: { action: (data: FormData) => Promise<unknown>; set: Record<string, string>; back?: Record<string, string>; active: boolean; done: string; confirm?: Confirm; label?: string; className?: string; children: React.ReactNode }) {
  return (
    <ActButton act={() => action(formOf(set))} undo={back && (() => action(formOf(back)))} done={done} confirm={confirm} label={label} pressed={className ? undefined : active} className={className ?? choicePill(active)}>
      {children}
    </ActButton>
  );
}
