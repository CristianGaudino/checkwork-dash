"use client";

import { useState } from "react";
import { Badge, Field, FormActions, adminButton, adminButtonQuiet, adminInput, rowButton, rowDanger } from "@/components/admin/kit";
import { Dialog, DialogCancel } from "@/components/admin/Dialog";
import { useAct } from "@/components/admin/ActSelect";
import { BUSY } from "@/components/admin/ActButton";
import { CalendarIcon, PencilIcon } from "@/components/stock/icons";
import { addDays, fmtDay } from "@/lib/admin/format";

const QUICK = [[1, "Tomorrow"], [3, "In 3 days"], [7, "Next week"]] as const;
const day = (iso: string) => `${fmtDay(iso, "weekday")} ${fmtDay(iso, "day")} ${fmtDay(iso, "month")}`; // Tue 25 Nov

// The day to get back to them (#134), read first: the day set with Edit, or Schedule follow-up. Both open the scheduler in the house dialog,
// as HubSpot's and Pipedrive's "schedule an activity" do, so it stays one line in Next step on a phone: the date picker first, the usual choices
// (Gmail's snooze list: a name and its day) under it, Clear when one is set. Each saves at once, with Undo in the toast (`back`).
export function FollowUp({ action, on, today, due, back }: { action: (data: FormData) => Promise<unknown>; on?: string; today: string; due: boolean; back?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useAct();
  const save = (set: Record<string, string>, done: string) => run(action, set, done, back, { ok: () => setOpen(false) });
  return (
    <div role="group" aria-labelledby="follow-up" className="flex flex-col gap-1">
      <p id="follow-up" className="text-meta font-semibold">
        Follow up
      </p>
      {on ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-body">
            <CalendarIcon aria-hidden="true" className="size-5 shrink-0 text-text-2" />
            <span className="font-semibold">{on === today ? "Today" : day(on)}</span>
            {due && on !== today && <Badge tone="warn">Overdue</Badge>}
          </p>
          <button type="button" onClick={() => setOpen(true)} className={`${rowButton} -mx-3`}>
            <PencilIcon aria-hidden="true" className="size-4 shrink-0" />
            Edit
            <span className="sr-only"> the follow-up</span>
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${adminButtonQuiet} w-full sm:w-fit`}>
          <CalendarIcon aria-hidden="true" className="size-4 shrink-0" />
          Schedule follow-up
        </button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={on ? "Change the follow-up" : "Schedule follow-up"}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const v = String(new FormData(e.currentTarget).get("on") ?? "");
            if (v) save({ on: v }, `Follow up ${v === today ? "today" : day(v)}`);
          }}
        >
          <Field label="Day">
            <input type="date" name="on" min={today} max={addDays(today, 366)} defaultValue={on ?? ""} required className={`${adminInput} w-full`} />
          </Field>
          <ul aria-label="Or choose" className="-mx-2 flex flex-col">
            {QUICK.map(([n, label]) => (
              <li key={n}>
                <button type="button" disabled={pending} onClick={() => save({ in: String(n) }, `Follow up ${label.toLowerCase()}`)} className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-2 text-body hover:bg-hairline ${BUSY}`}>
                  <span className="font-medium">{label}</span>
                  <span className="text-text-2 tabular-nums">{day(addDays(today, n))}</span>
                </button>
              </li>
            ))}
          </ul>
          <FormActions>
            {on && (
              <button type="button" disabled={pending} aria-busy={pending || undefined} onClick={() => save({ clear: "1" }, "Follow-up cleared")} className={`${rowDanger} mr-auto ${BUSY}`}>
                Clear
              </button>
            )}
            <DialogCancel />
            <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${adminButton} ${BUSY}`}>
              {pending ? "Saving" : "Save"}
            </button>
          </FormActions>
        </form>
      </Dialog>
    </div>
  );
}
