import { CHANNEL_LABELS, mayGet, type Channel, type NotifyEvent, type Prefs } from "@/lib/notify-rules";
import type { Role } from "@/lib/permission-rules";
import { CheckIcon } from "@/components/stock/icons";

export type GridRow = { id: NotifyEvent; label: string };
// The events a role may get (src/lib/notify-rules.ts): a row only where one of the columns can carry it.
export const rowsFor = (rows: GridRow[], role: Role | null, columns: Channel[]) => rows.filter((r) => columns.some((c) => mayGet(role, c, r.id)));

// What reaches a person, and how (#142): one row per event and one column per channel. From 640px a table-like grid with the channels as
// column heads; on a phone one card per event with its channels as labelled switches, never a wide table. Each cell is one checkbox, named
// by its channel with the event as its value (readGrid on the server). A cell the channel cannot carry is empty.
export function NotifyGrid({ rows, columns, value, role }: { rows: GridRow[]; columns: Channel[]; value: Prefs; role: Role | null }) {
  const template = { gridTemplateColumns: `minmax(0,1fr) repeat(${columns.length}, 5.5rem)` };
  return (
    <div className="flex flex-col">
      {/* Says the grid was sent: with every box unticked nothing else would, and a form without it keeps what was chosen. */}
      <input type="hidden" name="notify-grid" value="1" />
      <div aria-hidden="true" style={template} className="hidden border-b border-hairline pb-2 text-meta font-semibold text-text-2 sm:grid">
        <span>Event</span>
        {columns.map((c) => (
          <span key={c} className="text-center">{CHANNEL_LABELS[c]}</span>
        ))}
      </div>
      {rowsFor(rows, role, columns).map((r) => (
        // A group named by its event, so each checkbox reads as "New enquiry, Push" (a fieldset's legend will not sit in a grid).
        <div key={r.id} role="group" aria-label={r.label} style={template} className="flex flex-col gap-2 border-b border-hairline py-3 last:border-b-0 sm:grid sm:items-center sm:gap-0 sm:py-1">
          <span aria-hidden="true" className="text-body font-medium sm:font-normal">{r.label}</span>
          <div className="flex flex-wrap gap-2 sm:contents">
            {columns.map((c) =>
              mayGet(role, c, r.id) ? (
                <label key={c} className="flex min-h-11 items-center gap-2 rounded-control border border-hairline px-3 has-checked:border-accent has-checked:bg-accent-soft sm:justify-center sm:border-0 sm:bg-transparent sm:px-0 sm:has-checked:bg-transparent">
                  <input type="checkbox" name={`notify-${c}`} value={r.id} defaultChecked={value[c].includes(r.id)} className="size-5 shrink-0 accent-accent" />
                  <span className="text-meta font-medium sm:sr-only">{CHANNEL_LABELS[c]}</span>
                </label>
              ) : (
                <span key={c} className="hidden sm:block" />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// The same, read: each event with the ways it reaches the person ("Push, WhatsApp"), "Off" where none. The page shows this; Edit opens the grid.
export function NotifyList({ rows, columns, value, role }: { rows: GridRow[]; columns: Channel[]; value: Prefs; role: Role | null }) {
  return (
    <dl className="flex flex-col">
      {rowsFor(rows, role, columns).map((r) => {
        const on = columns.filter((c) => value[c].includes(r.id) && mayGet(role, c, r.id));
        return (
          <div key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-hairline py-2.5 last:border-b-0">
            <dt className="text-body">{r.label}</dt>
            <dd className={`ml-auto inline-flex items-center gap-1 text-meta ${on.length ? "font-medium" : "text-text-2"}`}>
              {on.length > 0 && <CheckIcon aria-hidden="true" className="size-4 text-ok" />}
              {on.length ? on.map((c) => CHANNEL_LABELS[c]).join(", ") : "Off"}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
