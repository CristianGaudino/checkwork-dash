import { card } from "@/components/ui";
import { StatGrid, figureSize } from "./kit";

// The loading kit (#109): the shape of a slow part of a page while its records load, in a <Suspense> inside the page. Never loading.tsx
// (NavProgress.tsx says why), never around the page's header, tabs or a notFound(). Bones in the hairline colour, rows on the row-alt fill,
// standing still (#214): they fade in once after 150ms (globals.css, data-bones), so a quick answer never flashes them. Screen readers
// hear one "Loading" per region and none of the bones.

// One grey block: a word, a figure, a button.
export function Bone({ className = "" }: { className?: string }) {
  return <span className={`block rounded-control bg-hairline ${className}`} />;
}

// A bone the height of one line of `text` (its line height), so a line of words and its bone stand the same height.
export function LineBone({ text = "text-meta", className = "" }: { text?: string; className?: string }) {
  return (
    <span className={`flex h-[1lh] items-center ${text}`}>
      <Bone className={className} />
    </span>
  );
}

// The region a fallback fills: busy until the content replaces it. `className` lays out the bones as the content will be.
export function Skeleton({ children, className = "flex flex-col gap-6" }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-busy="true" data-skeleton data-bones className={className}>
      <p className="sr-only">Loading</p>
      <div aria-hidden="true" className="contents">{children}</div>
    </div>
  );
}

// A group of figures loading (StatGrid, StatCard): rows of a label and a figure. `lead`: the first is the headline (StatCard `lead`).
export function TileBones({ count = 4, lead = false }: { count?: number; lead?: boolean }) {
  return <StatGrid>{Array.from({ length: count }, (_, i) => <TileBone key={i} lead={lead && i === 0} />)}</StatGrid>;
}

// One figure's bones, for a fallback inside a StatGrid that already holds the others: a direct child of the grid, so a `lead` one takes the
// headline's place and the rest are rows. `busy`: the first bone of a fallback made of bones alone (the Overview's website figures), which
// then says "Loading" as Skeleton does.
export function TileBone({ lead = false, busy = false }: { lead?: boolean; busy?: boolean }) {
  return lead ? (
    <div aria-busy={busy || undefined} data-skeleton={busy || undefined} data-bones className="flex min-w-0 flex-col gap-1">
      {busy && <p className="sr-only">Loading</p>}
      <LineBone className="h-3.5 w-24 max-w-full" />
      <div className="@container min-w-0">
        <LineBone text={`${figureSize("00")} leading-[1.1]`} className="h-[0.75em] w-28" />
      </div>
      <LineBone className="h-3.5 w-32 max-w-full" />
    </div>
  ) : (
    <div aria-busy={busy || undefined} data-skeleton={busy || undefined} data-bones className="flex min-h-14 min-w-0 items-center gap-3 py-2.5">
      {busy && <p className="sr-only">Loading</p>}
      <LineBone className="h-3.5 w-32 max-w-full" />
      <LineBone className="ml-auto h-4 w-12" />
    </div>
  );
}

// A line or two of words: the answer in words at the top of a report.
export function TextBones({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex max-w-measure flex-col">
      {Array.from({ length: lines }, (_, i) => (
        <LineBone key={i} text="text-body" className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

// A list's rows: a short and a long line each.
export function RowBones({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y divide-hairline">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-16 flex-col justify-center gap-2 py-3">
          <Bone className={`h-4 ${i % 2 ? "w-40" : "w-52"} max-w-full`} />
          <Bone className={`h-3.5 ${i % 2 ? "w-60" : "w-44"} max-w-full`} />
        </div>
      ))}
    </div>
  );
}

// A titled panel (Panel): its title, then `children` (list rows by default; a chart is <Bone className="h-48" />). `plain` has no frame.
// `text`: the panel has a line of helper text under its title.
export function PanelBones({ title, text = false, plain = false, children = <RowBones /> }: { title?: string; text?: boolean; plain?: boolean; children?: React.ReactNode }) {
  return (
    <section className={`${plain ? "" : `${card} p-5`} flex min-w-0 flex-col gap-4`}>
      <div className="flex flex-col gap-0.5">
        {title ? <h2 className="text-section font-semibold">{title}</h2> : <Bone className="h-5 w-36" />}
        {text && <LineBone className="h-4 w-56 max-w-full" />}
      </div>
      {children}
    </section>
  );
}

// A row of tabs with their counts (SummaryTabs): a label, a figure and, with `hint`, a line under it. The same row and tile classes.
export function TabBones({ count, hint = false }: { count: number; hint?: boolean }) {
  return (
    <div className="scrollbar-none flex divide-x divide-hairline overflow-x-auto rounded-card border border-hairline/70 bg-card p-1 shadow-panel">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex min-w-24 shrink-0 grow flex-col gap-0.5 px-4 py-2.5">
          <LineBone className="h-3.5 w-16" />
          <LineBone text="text-heading" className="h-5 w-10" />
          {hint && <LineBone className="h-3.5 w-24" />}
        </div>
      ))}
    </div>
  );
}

// A table (DataTable): a header line, then 48px rows on alternate fills.
export function TableBones({ rows = 8 }: { rows?: number }) {
  return (
    <div className={`${card} overflow-hidden`}>
      <div className="flex h-11 items-center gap-6 border-b border-hairline px-4">
        <Bone className="h-3.5 w-16" />
        <Bone className="ml-auto h-3.5 w-12 sm:ml-0" />
        <Bone className="hidden h-3.5 w-14 sm:block" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-6 px-4 even:bg-row-alt">
          <Bone className={`h-4 ${["w-44", "w-36", "w-52", "w-40"][i % 4]} max-w-[50%] sm:max-w-none`} />
          <Bone className="ml-auto h-4 w-16 sm:ml-0" />
          <Bone className="hidden h-4 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}
