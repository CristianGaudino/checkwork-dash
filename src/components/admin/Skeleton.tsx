import { card } from "@/components/ui";

// The loading kit (#109): the shape of a slow part of a page while its records load, in a <Suspense> inside the page. Never loading.tsx
// (NavProgress.tsx says why), never around the page's header, tabs or a notFound(). Bones in the hairline colour, rows on the row-alt fill,
// a gentle pulse that stands still under reduced motion. Screen readers hear one "Loading" per region and none of the bones.

// One grey block: a word, a figure, a button.
export function Bone({ className = "" }: { className?: string }) {
  return <span className={`block rounded-control bg-hairline motion-safe:animate-pulse ${className}`} />;
}

// The region a fallback fills: busy until the content replaces it. `className` lays out the bones as the content will be.
export function Skeleton({ children, className = "flex flex-col gap-6" }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-busy="true" data-skeleton className={className}>
      <p className="sr-only">Loading</p>
      <div aria-hidden="true" className="contents">{children}</div>
    </div>
  );
}

// A row of stat tiles (StatGrid, StatCard): label, figure, hint.
export function TileBones({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 max-sm:[&>:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
      {Array.from({ length: count }, (_, i) => <TileBone key={i} />)}
    </div>
  );
}

// One stat tile, for a fallback inside a StatGrid that already holds the other tiles.
export function TileBone() {
  return (
    <div className={`${card} flex min-w-0 flex-col gap-2 p-4`}>
      <Bone className="h-4 w-24 max-w-full" />
      <Bone className="h-8 w-20" />
      <Bone className="h-4 w-32 max-w-full" />
    </div>
  );
}

// A line or two of words: the answer in words at the top of a report.
export function TextBones({ lines = 2 }: { lines?: number }) {
  return (
    <div className="flex max-w-measure flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
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
export function PanelBones({ title, plain = false, children = <RowBones /> }: { title?: string; plain?: boolean; children?: React.ReactNode }) {
  return (
    <section className={`${plain ? "" : `${card} p-5`} flex min-w-0 flex-col gap-4`}>
      {title ? <h2 className="text-section font-semibold">{title}</h2> : <Bone className="h-5 w-36" />}
      {children}
    </section>
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
