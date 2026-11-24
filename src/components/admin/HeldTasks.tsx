"use client";

import { createContext, useContext, useState } from "react";
import { useToast } from "@/components/toast";
import { TaskList } from "./kit";

// A list of tasks a person works down (To answer now, #94): a row that a press takes off the list stays in its place, faded, saying what
// it became ("Contacted", "Spam", "Closed") with its buttons gone, until the page is left or reloaded. Each press refreshes the page and
// the server sends the list without it, so the rows seen this visit are kept here. Undo puts it back on the server's list, live again.
// A row that leaves without a press here (someone else moved it), or whose press was refused, just goes: nothing true to say about it.

// What a press makes of the row, read from the pressed button's name as LeadActions gives it ("Mark contacted: Mary Byrne", "Spam: …",
// "Close: Duplicate, …"). Anything else (More, Not spam, Call): nothing, so the row stays as it is.
export function outcomeOf(label: string | null | undefined): string | undefined {
  const head = label?.split(":")[0] ?? "";
  if (/^Mark ./.test(head)) return head[5].toUpperCase() + head.slice(6);
  return head === "Close" ? "Closed" : head === "Spam" ? "Spam" : undefined;
}

// The ids in order: the server's live ones, and each held one back after the row it followed last time (first, if none is left).
export function keepOrder(prev: string[], live: string[], held: (id: string) => boolean): string[] {
  const out = [...live];
  const on = new Set(live);
  prev.forEach((id, i) => {
    if (on.has(id) || !held(id)) return;
    const before = prev.slice(0, i).findLast((p) => out.includes(p));
    out.splice(before === undefined ? 0 : out.indexOf(before) + 1, 0, id);
  });
  return out;
}

type Row = { id: string; node: React.ReactNode };
const RowState = createContext<{ held?: string; press: (label: string | null | undefined) => void } | undefined>(undefined);

// `empty`: what the list says when nothing is left to do (held rows still show under it).
export function HeldTasks({ rows, label, empty }: { rows: Row[]; label: string; empty: React.ReactNode }) {
  const [then, setThen] = useState<Record<string, string>>({});
  // Presses not yet answered, oldest first, with the toast showing when each was pressed.
  const [asked, setAsked] = useState<{ id: string; outcome: string; since: number }[]>([]);
  const toast = useToast();
  const [lastToast, setLastToast] = useState(toast?.id);
  // ActButton answers each press with a toast: Undo with it when it worked, the reason alone when refused (someone moved it first).
  // Only a press that worked is held. shortcut: a toast is matched to the oldest open press, so two rows pressed at once could swap answers.
  if (toast && toast.id !== lastToast) {
    setLastToast(toast.id);
    const p = asked.find((a) => a.since < toast.id);
    if (p) {
      setAsked(asked.filter((a) => a !== p));
      if (toast.undo) setThen((t) => ({ ...t, [p.id]: p.outcome }));
    }
  }
  const [seen, setSeen] = useState(() => ({ rows, order: rows.map((r) => r.id), nodes: Object.fromEntries(rows.map((r) => [r.id, r.node])) }));
  let shown = seen;
  // A new list from the server (after a press, a search): merged in during render, as React advises for state from props.
  if (seen.rows !== rows) {
    shown = { rows, order: keepOrder(seen.order, rows.map((r) => r.id), (id) => id in then || asked.some((a) => a.id === id)), nodes: { ...seen.nodes, ...Object.fromEntries(rows.map((r) => [r.id, r.node])) } };
    setSeen(shown);
    // A row back on the list (Undo) is live again: what it became before is no longer true if it later leaves another way.
    if (rows.some((r) => r.id in then)) setThen((t) => Object.fromEntries(Object.entries(t).filter(([id]) => !rows.some((r) => r.id === id))));
  }
  const live = new Set(rows.map((r) => r.id));
  const ids = shown.order.filter((id) => live.has(id) || then[id]);
  return (
    <>
      {rows.length === 0 && empty}
      {ids.length > 0 && (
        // A held row is faded; its words say what it became.
        <div className="[&_li:has([data-held])]:opacity-60">
          <TaskList label={label}>
            {ids.map((id) => (
              <RowState.Provider key={id} value={{ held: live.has(id) ? undefined : then[id], press: (l) => { const o = outcomeOf(l); if (o) setAsked((a) => [...a, { id, outcome: o, since: toast?.id ?? 0 }]); } }}>
                {shown.nodes[id]}
              </RowState.Provider>
            ))}
          </TaskList>
        </div>
      )}
    </>
  );
}

// Stable, so it runs when the word mounts, not on each re-render (a toast closing would pull focus back to the row).
const takeDroppedFocus = (s: HTMLElement | null) => void (s && document.activeElement === document.body && s.focus());

// A row's buttons in HeldTasks: noted when pressed, and once the row is held, the word for what it became in their place. The pressed
// button (or the menu trigger focus went back to) is gone then, so the word takes the focus the page dropped and the next Tab goes on.
export function RowActions({ children }: { children: React.ReactNode }) {
  const row = useContext(RowState);
  if (row?.held)
    return (
      <span data-held tabIndex={-1} ref={takeDroppedFocus} className="inline-flex min-h-11 items-center text-meta font-medium text-text outline-none">
        {row.held}
      </span>
    );
  return (
    <span className="contents" onClickCapture={(e) => row?.press((e.target as Element).closest("button")?.getAttribute("aria-label"))}>
      {children}
    </span>
  );
}
