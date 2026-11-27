"use client";

import { useId, useRef } from "react";
import { MoreIcon } from "@/components/stock/icons";
import { rowButton } from "./kit";

// A row's other actions (#95: a row shows only its next step and this menu), behind an icon named "More for <name>", so a row keeps one
// button and fits its width. A native popover: it sits above the
// page (a table's scroll box cannot clip it), and the browser closes it on Escape or a press outside, returning focus to the icon. Placed
// under the button, right edges level (above it near the bottom of the screen), and closed on scroll so it never floats from its row.
export function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Runs on the press, before the browser opens it; the next frame, once it has a size, it is put in place.
  const place = () =>
    requestAnimationFrame(() => {
      const m = menu.current;
      const b = button.current?.getBoundingClientRect();
      if (!m || !b || !m.matches(":popover-open")) return;
      const below = b.bottom + 4 + m.offsetHeight <= window.innerHeight - 8;
      m.style.top = `${below ? b.bottom + 4 : Math.max(8, b.top - 4 - m.offsetHeight)}px`;
      m.style.left = `${Math.max(8, b.right - m.offsetWidth)}px`;
      window.addEventListener("scroll", () => m.matches(":popover-open") && m.hidePopover(), { capture: true, once: true });
    });
  return (
    <>
      {/* An icon, square at the row's button height; its hit area stays 44px in compact rows (32px tall) too. */}
      <button ref={button} type="button" popoverTarget={id} onClick={place} aria-label={label} title="More" className={`${rowButton} relative w-11 shrink-0 px-0 after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2`}>
        <MoreIcon className="size-5" />
      </button>
      {/* An item closes the menu when chosen: a link navigates, a button runs (and asks first, in its own dialog, if it must). */}
      <div
        ref={menu}
        id={id}
        popover="auto"
        onClick={(e) => (e.target as HTMLElement).closest("a,button") && menu.current?.hidePopover()}
        className="fixed inset-auto m-0 min-w-44 flex-col gap-1 rounded-control border border-hairline bg-card p-1 text-text shadow-lift transition-[opacity,translate,overlay,display] transition-discrete duration-150 ease-out opacity-0 -translate-y-1 open:opacity-100 open:translate-y-0 starting:open:opacity-0 starting:open:-translate-y-1 motion-reduce:translate-y-0! [&:popover-open]:flex *:w-full *:justify-start *:border-0 *:not-[.text-bad]:text-text"
      >
        {children}
      </div>
    </>
  );
}
