import { card } from "@/components/ui";

// The loading kit (#109): a page's shape while its records load, so the eye lands where the figures will be. Bones in the hairline colour,
// table rows on the row-alt fill, one gentle pulse that stands still under reduced motion. Never a spinner, never a blank page.
// Hidden from screen readers but for one "Loading" line; the page itself follows. Not a status role: that is the toast's, and the top bar
// (NavProgress) already shows a page is on its way.

// One grey block: a word, a figure, a button. Inline, so it sits in a line of text too.
export function Bone({ className = "" }: { className?: string }) {
  return <span className={`inline-block rounded-control bg-hairline align-middle motion-safe:animate-pulse ${className}`} />;
}

export function Loading({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p data-loading className="sr-only">Loading</p>
      <div aria-hidden="true" className="contents">{children}</div>
    </>
  );
}

// The page's bar (PageHeader's frame): the title when the page has a fixed one, its sub line and `actions` buttons as bones.
export function HeaderBones({ title, text = true, actions = 0, back = false }: { title?: string; text?: boolean; actions?: number; back?: boolean }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:sticky lg:top-0 lg:z-20 lg:-mx-10 lg:min-h-20 lg:border-b lg:border-hairline lg:bg-surface lg:px-10 lg:py-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {back && <Bone className="mb-1 h-4 w-20" />}
        {title ? <h1 className="text-title font-bold">{title}</h1> : <Bone className="h-8 w-48" />}
        {text && <Bone className="h-4 w-56 max-w-full" />}
      </div>
      {actions > 0 && (
        <div className="flex gap-2 max-sm:has-[>:nth-child(2)]:w-full">
          {Array.from({ length: actions }, (_, i) => (
            <Bone key={i} className={`h-11 w-36 ${actions > 1 ? "max-sm:w-auto max-sm:flex-1" : ""}`} />
          ))}
        </div>
      )}
    </header>
  );
}

// A row of stat tiles (StatGrid, StatCard): label, figure, hint.
export function TileBones({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 max-sm:[&>:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`${card} flex min-w-0 flex-col gap-2 p-4`}>
          <Bone className="h-4 w-24 max-w-full" />
          <Bone className="h-8 w-20" />
          <Bone className="h-4 w-32 max-w-full" />
        </div>
      ))}
    </div>
  );
}

// The summary tiles that filter a list (SummaryTabs): they scroll sideways on a phone, as the real ones do.
export function TabBones({ count = 4 }: { count?: number }) {
  return (
    <div className="scrollbar-none -mx-4 -my-1 flex gap-2 overflow-hidden px-4 py-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] sm:px-0">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex min-w-28 shrink-0 flex-col gap-1.5 rounded-card border border-hairline bg-card px-4 py-3">
          <Bone className="h-4 w-16" />
          <Bone className="h-6 w-10" />
          <Bone className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

// A few choices in one control (Segmented): Everyone or For me, a period.
export function SegmentBones({ className = "w-56" }: { className?: string }) {
  return <Bone className={`h-13.5 max-w-full ${className}`} />;
}

// Search and filters above a list (TableToolbar).
export function ToolbarBones() {
  return (
    <div className="flex items-center gap-2">
      <Bone className="h-11 flex-1 sm:max-w-sm sm:flex-none sm:basis-96" />
      <Bone className="h-11 w-24" />
    </div>
  );
}

// A line or two of words: the answer in words at the top of Analytics and Reports.
export function TextBones({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex max-w-measure flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

// A list's rows (TaskList, an agenda): a short and a long line each, with a button bone from 640px.
export function RowBones({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="-mx-1 flex flex-col divide-y divide-hairline">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex min-h-16 items-center gap-3 py-3 pl-4 pr-1">
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Bone className={`h-4 ${i % 2 ? "w-40" : "w-52"} max-w-full`} />
            <Bone className={`h-3.5 ${i % 2 ? "w-60" : "w-44"} max-w-full`} />
          </span>
          <Bone className="hidden h-9 w-24 sm:inline-block" />
        </li>
      ))}
    </ul>
  );
}

// A titled panel (Panel): the title when it is fixed, else a bone; `quiet` on its tint, `plain` with no frame; the body is `children`,
// list rows by default.
export function PanelBones({ title, quiet = false, plain = false, children = <RowBones rows={3} />, className = "" }: { title?: string; quiet?: boolean; plain?: boolean; children?: React.ReactNode; className?: string }) {
  const frame = plain ? "" : quiet ? "rounded-card border border-hairline bg-row-alt p-5" : `${card} p-5`;
  return (
    <section className={`${frame} flex min-w-0 flex-col gap-4 ${className}`}>
      {title ? <h2 className="text-section font-semibold">{title}</h2> : <Bone className="h-5 w-36" />}
      {children}
    </section>
  );
}

// A chart's box, the height of the real one.
export function ChartBones({ className = "h-48" }: { className?: string }) {
  return <Bone className={`w-full ${className}`} />;
}

// A table (DataTable): a header line, then 48px rows on alternate fills; the third and fourth columns from 640px and 1024px, as most lists hide theirs.
export function TableBones({ rows = 8, bare = false }: { rows?: number; bare?: boolean }) {
  return (
    <div className={`${bare ? "" : card} overflow-hidden`}>
      <div className="flex h-11 items-center gap-6 border-b border-hairline px-4">
        <Bone className="h-3.5 w-16" />
        <Bone className="ml-auto h-3.5 w-12 sm:ml-0" />
        <Bone className="hidden h-3.5 w-14 sm:inline-block" />
        <Bone className="hidden h-3.5 w-12 lg:ml-auto lg:inline-block" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-6 px-4 even:bg-row-alt">
          <Bone className={`h-4 ${["w-44", "w-36", "w-52", "w-40"][i % 4]} max-w-[50%] sm:max-w-none`} />
          <Bone className="ml-auto h-4 w-16 sm:ml-0" />
          <Bone className="hidden h-4 w-20 sm:inline-block" />
          <Bone className="hidden h-6 w-24 rounded-full lg:ml-auto lg:inline-block" />
        </div>
      ))}
    </div>
  );
}

// Fields of a form, then its action row bottom right with the main button right-most.
export function FormBones({ fields = 4 }: { fields?: number }) {
  return (
    <section className={`${card} flex flex-col gap-5 p-5`}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Bone className="h-4 w-28" />
          <Bone className="h-11 w-full" />
        </div>
      ))}
      <div className="flex justify-end gap-3">
        <Bone className="h-11 w-28" />
        <Bone className="h-11 w-36" />
      </div>
    </section>
  );
}

// The shapes a page takes, named for the loading.tsx files that use them.

// A list page with no fixed title known here (the fallback): its bar, search and a table.
export function ListPageBones({ title, actions = 0, tabs = 0 }: { title?: string; actions?: number; tabs?: number }) {
  return (
    <Loading>
      <HeaderBones title={title} actions={actions} />
      {tabs > 0 && <TabBones count={tabs} />}
      <ToolbarBones />
      <TableBones />
    </Loading>
  );
}

// One record (a lead, a car, a customer, a booking): a way back, the work on the left and the details beside it from 1280px.
export function RecordPageBones() {
  return (
    <Loading>
      <HeaderBones back actions={1} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <PanelBones>
            <TextBones lines={3} />
          </PanelBones>
          <PanelBones />
        </div>
        <PanelBones quiet>
          <RowBones rows={4} />
        </PanelBones>
      </div>
    </Loading>
  );
}

// A page that makes something (book a test drive, add a car, a new post).
export function FormPageBones({ title }: { title?: string }) {
  return (
    <Loading>
      <HeaderBones title={title} back text={false} />
      <FormBones />
    </Loading>
  );
}
