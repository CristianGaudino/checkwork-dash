"use client";

import { useId, useState } from "react";
import { ChevronDownIcon } from "@/components/stock/icons";

// This visit's fold: closed on a phone until tapped, always shown from 1024px, where the button is gone. A plain button rather than
// <details>, so a desk shows it in every browser and a screen reader never hears "collapsed" over content on screen.
export function VisitFold({ line, children }: { line: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      {/* The button covers the whole head on a phone (after:inset-0), as the old summary did; the heading stays outside it. */}
      <div className="relative flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`${id}-h`} className="text-section font-semibold">This visit</h2>
          <span className="text-meta text-text-2">{line}</span>
        </div>
        <button type="button" aria-expanded={open} aria-controls={id} aria-labelledby={`${id}-h`} onClick={() => setOpen(!open)} className="shrink-0 cursor-pointer text-text-2 after:absolute after:inset-0 lg:hidden">
          <ChevronDownIcon className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div id={id} className={`mt-4 flex flex-col gap-5 ${open ? "" : "max-lg:hidden"}`}>
        {children}
      </div>
    </>
  );
}
