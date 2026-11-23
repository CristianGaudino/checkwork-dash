"use client";

import { adminButtonQuiet } from "@/components/admin/kit";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} aria-label="Print or save as PDF" className={adminButtonQuiet}>
      Print
    </button>
  );
}
