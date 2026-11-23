"use client";

import { useTransition } from "react";
import { syncNowAction } from "@/app/stock/actions";
import { SyncIcon } from "@/components/stock/icons";
import { adminButtonQuiet } from "./kit";

// Runs the stock sync now; the action goes to /stock?synced=1, which says how it went.
// Never the forced sync: a held sync (the listing site's answer looked wrong) has Apply anyway under its warning on Stock, for owners and managers.
export function RefreshStock() {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} aria-busy={pending || undefined} onClick={() => start(() => syncNowAction(false))} className={adminButtonQuiet}>
      <SyncIcon className={`shrink-0 size-4 ${pending ? "motion-safe:animate-spin" : ""}`} />
      {pending ? "Refreshing" : "Refresh stock"}
    </button>
  );
}
