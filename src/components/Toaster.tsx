"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/stock/icons";
import { dismissToast, useToast, type Toast } from "./toast";

const SHOW_MS = 6000;

// The one toast, announced politely. It stays while it is hovered or holds focus, so Undo can be reached, and goes after six seconds.
export function Toaster() {
  const toast = useToast();
  // Which toast the pointer or focus is on. Held per toast, so one removed under the pointer (Undo) cannot freeze the next.
  const [heldId, setHeldId] = useState<number | null>(null);
  const held = toast !== null && heldId === toast.id;
  // The last toast stays on screen as it fades out, then goes; a new one takes its place at once.
  const [last, setLast] = useState<Toast | null>(toast);
  if (toast && toast !== last) setLast(toast);
  const shown = toast ?? last;
  const leaving = !toast && shown !== null;

  useEffect(() => {
    if (!toast || held) return;
    const timer = setTimeout(dismissToast, SHOW_MS);
    return () => clearTimeout(timer);
  }, [toast, held]);

  return (
    <div aria-live="polite" className="flex w-full justify-center">
      {shown && (
        <div
          key={shown.id}
          data-testid="toast"
          data-leaving={leaving || undefined}
          inert={leaving}
          onMouseEnter={() => setHeldId(shown.id)}
          onMouseLeave={() => setHeldId(null)}
          onFocus={() => setHeldId(shown.id)}
          onBlur={() => setHeldId(null)}
          // Its own fade only, not a button's inside it.
          onTransitionEnd={(e) => leaving && e.target === e.currentTarget && setLast(null)}
          className="pointer-events-auto flex max-w-full items-center gap-3 rounded-control border border-hairline bg-card py-1 pl-4 pr-1 text-meta shadow-lift transition-[opacity,translate] duration-200 ease-out starting:translate-y-2 starting:opacity-0 data-leaving:pointer-events-none data-leaving:translate-y-2 data-leaving:opacity-0 data-leaving:duration-150 motion-reduce:transition-opacity motion-reduce:translate-y-0!"
        >
          <p className="min-w-0 font-semibold">{shown.message}</p>
          {shown.undo && (
            <button
              type="button"
              onClick={() => {
                shown.undo?.();
                dismissToast();
              }}
              className="min-h-11 shrink-0 rounded-control px-3 font-semibold underline"
            >
              Undo
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={dismissToast} className="flex size-11 shrink-0 items-center justify-center rounded-control">
            <CloseIcon className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
