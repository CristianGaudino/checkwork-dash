"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { CloseIcon } from "@/components/stock/icons";
import { closeButton } from "@/components/ui";
import { LEAVE_QUESTION } from "./useLeaveGuard";
import { adminButtonQuiet } from "./kit";

// What the forms inside hold now, as text: the same comparison as useLeaveGuard, so an edit put back counts as none.
const snapshot = (d: HTMLDialogElement) => JSON.stringify([...d.querySelectorAll("form")].map((f) => [...new FormData(f)].map(([k, v]) => [k, typeof v === "string" ? v : v.name])));

// The house dialog for a small edit (a note, a prep cost, a person's details), on a native modal dialog: a sheet from the foot of the
// screen on a phone, in thumb reach, and a centred card from 640px, as iOS and Material do. Title, an optional line under it, the body
// (it scrolls on a short phone; title and actions stay put), and the actions bottom right (FormActions from the kit, main one right-most).
// Controlled: the opener keeps `open` and sets it back in `onClose`, which runs however it closed. Focus goes to the element marked
// `data-autofocus`, else to the dialog itself (so a phone's keyboard does not jump up over it), and back to the opener on close.
// Escape, the backdrop, the close button and DialogCancel all dismiss it, but changes not saved are asked about first (LEAVE_QUESTION,
// as leaving a page with them is): the iOS sheet rule. A save that works closes it from the caller (`open` false); the body is drawn afresh
// on every opening, so it never shows the last attempt's text or errors.
export function Dialog({ open, onClose, title, text, children }: { open: boolean; onClose: () => void; title: string; text?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const from = useRef<Element | null>(null);
  const opened = useRef("");
  const downOnBackdrop = useRef(false);
  const [round, setRound] = useState(0);
  const titleId = useId();
  const textId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d || open === d.open) return;
    if (!open) return d.close();
    from.current = document.activeElement;
    d.showModal();
    (d.querySelector<HTMLElement>("[data-autofocus]") ?? d).focus();
    opened.current = snapshot(d);
  }, [open]);
  const dismiss = () => {
    const d = ref.current;
    if (d && (snapshot(d) === opened.current || window.confirm(LEAVE_QUESTION))) d.close();
  };
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={text ? textId : undefined}
      onCancel={(e) => (e.preventDefault(), dismiss())}
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => e.target === e.currentTarget && downOnBackdrop.current && dismiss()}
      onClose={() => {
        setRound((r) => r + 1);
        if (from.current instanceof HTMLElement) from.current.focus();
        onClose();
      }}
      className={[
        "m-0 max-h-[90dvh] w-full max-w-none flex-col overflow-hidden border-0 bg-card p-0 text-text shadow-lift outline-none open:flex",
        "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:rounded-t-card",
        "sm:m-auto sm:max-h-[85dvh] sm:w-[min(32rem,calc(100%-2rem))] sm:rounded-card",
        // Slides up on a phone, fades and grows a little from 640px, both ways (the scrim with it); a fade only under reduced motion.
        "transition-[translate,scale,opacity,overlay,display] transition-discrete duration-300 ease-sheet motion-reduce:duration-150",
        "max-sm:translate-y-full max-sm:open:translate-y-0 max-sm:starting:open:translate-y-full",
        "sm:scale-95 sm:opacity-0 sm:open:scale-100 sm:open:opacity-100 sm:starting:open:scale-95 sm:starting:open:opacity-0",
        "motion-reduce:translate-y-0! motion-reduce:scale-100! motion-reduce:opacity-0 motion-reduce:open:opacity-100 motion-reduce:starting:open:opacity-0",
        "backdrop:bg-transparent backdrop:transition-[background-color,overlay,display] backdrop:transition-discrete backdrop:duration-300 open:backdrop:bg-scrim starting:open:backdrop:bg-transparent",
        // The page behind keeps still while it is open.
        "[body:has(&[open])]:overflow-hidden",
      ].join(" ")}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4">
        <div className="flex min-w-0 flex-col gap-1 pt-2">
          <h2 id={titleId} className="text-heading font-semibold">
            {title}
          </h2>
          {text && (
            <p id={textId} className="text-meta text-text-2">
              {text}
            </p>
          )}
        </div>
        <button type="button" aria-label="Close" onClick={dismiss} className={closeButton}>
          <CloseIcon className="h-6 w-6" />
        </button>
      </div>
      {/* The body scrolls; FormActions inside it (data-actions) stays at its foot, over what scrolls, with the phone's home bar below it. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 has-[[data-actions]]:pb-0 **:data-actions:sticky **:data-actions:bottom-0 **:data-actions:-mx-5 **:data-actions:mt-2 **:data-actions:border-t **:data-actions:border-hairline **:data-actions:bg-card **:data-actions:px-5 **:data-actions:pb-[max(1rem,env(safe-area-inset-bottom))] **:data-actions:pt-3">
        <Fragment key={round}>{children}</Fragment>
      </div>
    </dialog>
  );
}

// The quiet Cancel in a dialog's FormActions: dismisses it as Escape does, asking first about changes not saved.
export function DialogCancel({ children = "Cancel" }: { children?: React.ReactNode }) {
  return (
    <button type="button" onClick={(e) => e.currentTarget.closest("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true }))} className={adminButtonQuiet}>
      {children}
    </button>
  );
}
