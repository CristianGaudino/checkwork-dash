import { dealerProfile } from "@/lib/tenancy/current";
import Link from "next/link";
import { DriveStatusBadge } from "@/components/admin/badges";
import { DriveSteps } from "@/components/admin/DriveSteps";
import { Badge, DataTable, EmptyState, PageHeader, Panel, PanelLink, Segmented, TableFooter, WhoseSwitch, TableToolbar, adminButton, pageOf, sortRows, type Column, type FilterGroup } from "@/components/admin/kit";
import { PlusIcon } from "@/components/stock/icons";
import { DRIVE_STATUSES, DRIVE_STATUS_LABELS, drivesStore, getSettings, type TestDrive } from "@/lib/admin/collections";
import { filterDrives, isOpenDrive, waitingDrives } from "@/lib/admin/drives";
import { addDays, dublinDay, fmtDate, fmtDay, fmtTime } from "@/lib/admin/format";
import { adminCars } from "@/lib/admin/stock-admin";
import { slugId } from "@/lib/admin/stock-admin-pure";
import { driveTimes } from "@/lib/leads/constants";
import { forSale } from "@/lib/stock/types";
import { currentMember } from "@/lib/permissions";

export const metadata = { title: "Test drives" };

// Who takes a booking out, as To do and the Overview say it.
const whoHas = (d: TestDrive, me: string) => (d.assignedTo === me ? "You" : (d.assignedTo ?? "Not taken"));
const VIEWS = ["today", "list"] as const;
type View = (typeof VIEWS)[number];
type Params = { view?: string; mine?: string; q?: string; status?: string; with?: string; when?: string; car?: string; sort?: string; dir?: string; page?: string; per?: string };

// The diary. Today: the day's bookings in order, the requests still to confirm and the next few days. List: every booking in a table,
// searched and filtered. For me keeps the bookings given to whoever is
// looking and the ones nobody has taken yet, as on To do and Leads. A booking opens on its own page, where it is moved or given to someone.
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "today";
  const mine = sp.mine === "1";
  const [all, cars, me, { team }, { hours }] = await Promise.all([drivesStore.list(), adminCars(), currentMember(), getSettings(), dealerProfile()]);
  const gone = new Set(cars.filter((c) => !forSale(c)).map((c) => c.id)); // by id; a booking still open on a car no longer for sale needs a call
  const drives = mine ? all.filter((d) => !d.assignedTo || d.assignedTo === me.name) : all;
  const today = dublinDay();
  const link = (over: Partial<Params>) => {
    const q = new URLSearchParams(Object.entries({ view: view === "today" ? undefined : view, mine: mine ? "1" : undefined, ...over }).filter((e): e is [string, string] => Boolean(e[1])));
    return `/test-drives${q.size ? `?${q}` : ""}`;
  };
  const onDay = (iso: string) => drives.filter((d) => dublinDay(d.startsAt) === iso).sort((a, b) => a.startsAt - b.startsAt);
  const waiting = waitingDrives(drives);
  const later = waiting.filter((d) => dublinDay(d.startsAt) !== today);
  // The next six days' confirmed bookings, by day: the diary ahead. Requests are under Still to confirm, so none shows twice.
  const ahead = Array.from({ length: 6 }, (_, i) => addDays(today, i + 1))
    .map((iso) => [iso, onDay(iso).filter((d) => d.status === "confirmed")] as const)
    .filter(([, list]) => list.length > 0);

  return (
    <>
      <PageHeader
        title="Test drives"
        text="Confirm a request to lock in the time"
        actions={
          <Link href="/test-drives/new" className={adminButton}>
            <PlusIcon className="shrink-0 size-4" />
            Book a test drive
          </Link>
        }
      />
      {/* A little less padding on a phone, so the two switches share one line from 390px. */}
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:gap-x-2 max-sm:[&_a]:px-2.5">
        <Segmented
          label="View"
          items={[
            { label: "Today", href: link({ view: undefined, q: undefined }), active: view === "today" },
            { label: "List", href: link({ view: "list" }), active: view === "list" },
          ]}
        />
        <WhoseSwitch label="Whose test drives" everyone={link({ mine: undefined, page: undefined })} forMe={link({ mine: "1", page: undefined })} mine={mine} />
      </div>

      {view === "today" && (
        <>
          <Panel title="Today" text={fmtDay(today)} count={onDay(today).length || undefined}>
            <Agenda drives={onDay(today)} gone={gone} me={me.name} empty={driveTimes(today, hours).length ? "Nothing booked today." : "We're closed today."} />
          </Panel>
          {/* Today's are listed above with their buttons; this is the rest, so no booking shows twice. */}
          {later.length > 0 && (
            <Panel title="Still to confirm" count={later.length}>
              <Agenda drives={later.slice(0, 8)} gone={gone} me={me.name} status="requested" withDay />
              {later.length > 8 && <PanelLink href={link({ view: "list", status: "requested", when: "ahead" })}>See all {later.length}</PanelLink>}
            </Panel>
          )}
          <Panel title="Next few days" action={<PanelLink href={link({ view: "list", when: "ahead" })}>See all</PanelLink>}>
            {ahead.length === 0 ? (
              <p className="text-body text-text-2">Nothing confirmed for the next six days.</p>
            ) : (
              ahead.map(([iso, list]) => (
                <section key={iso} aria-label={fmtDay(iso)} className="flex flex-col gap-1">
                  <h3 className="text-meta font-semibold text-text-2">{fmtDay(iso)}</h3>
                  <Agenda drives={list} gone={gone} me={me.name} status="confirmed" />
                </section>
              ))
            )}
          </Panel>
        </>
      )}

      {view === "list" && <List drives={drives} sp={sp} team={team.map((t) => t.name)} gone={gone} me={me.name} />}
    </>
  );
}

// A day's bookings in time order. Each opens its booking; its next step and menu (DriveSteps) are on the row, with Undo.
// status: the one the section's title already names, so its rows leave the badge out.
function Agenda({ drives, gone, me, empty = "Nothing booked.", withDay = false, status }: { drives: TestDrive[]; gone: Set<string>; me: string; empty?: string; withDay?: boolean; status?: TestDrive["status"] }) {
  if (drives.length === 0) return <p className="text-body text-text-2">{empty}</p>;
  return (
    <ul className="-mx-5 flex flex-col">
      {drives.map((d) => (
        <li key={d.id} className="relative grid grid-cols-1 items-center gap-x-4 gap-y-2 px-5 py-3 even:bg-row-alt hover:bg-surface sm:grid-cols-[3.5rem_minmax(0,1fr)] md:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
          {/* On a phone the time leads the name line instead (below), so the buttons get the row's whole width, at its right edge. */}
          <span className="self-start font-medium tabular-nums max-sm:hidden md:self-center">
            {fmtTime(d.startsAt)}
            {withDay && <span className="block text-meta font-normal text-text-2">{fmtDay(dublinDay(d.startsAt), "weekday")} {fmtDay(dublinDay(d.startsAt), "day")}</span>}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium tabular-nums sm:hidden">

                {fmtTime(d.startsAt)}

                {withDay && <span className="font-normal text-text-2"> {fmtDay(dublinDay(d.startsAt), "weekday")} {fmtDay(dublinDay(d.startsAt), "day")}</span>}

              </span>
              <Link href={`/test-drives/${d.id}`} data-name className="font-medium after:absolute after:inset-0">
                {d.name}
              </Link>
              {d.status !== status && <DriveStatusBadge status={d.status} />}
              {isOpenDrive(d) && gone.has(slugId(d.carSlug)) && <Badge tone="warn">No longer for sale</Badge>}
            </span>
            <span className="text-meta text-text-2">
              {d.carTitle} · {whoHas(d, me)}
            </span>
          </span>
          {/* The next step (Confirm, Mark done once it has started) and the menu with Call and the rest (#95). */}
          <span className="relative z-10 flex flex-wrap justify-end gap-2 sm:col-start-2 md:col-start-3">
            <DriveSteps drive={d} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// Every booking as a table: searched by name, phone or car; filtered by status, who has it and whether it has happened; sorted; in pages.
function List({ drives, sp, team, gone, me }: { drives: TestDrive[]; sp: Params; team: string[]; gone: Set<string>; me: string }) {
  const rows = filterDrives(drives, sp, undefined, gone);
  const columns: Column<TestDrive>[] = [
    { key: "when", header: "When", sort: (d) => d.startsAt, nowrap: true, cell: (d) => <span className="flex flex-col tabular-nums"><span className="sm:hidden">{fmtDay(dublinDay(d.startsAt), "day")} {fmtDay(dublinDay(d.startsAt), "month")}</span><span className="max-sm:hidden">{fmtDate(d.startsAt)}</span><span className="text-meta text-text-2">{fmtTime(d.startsAt)}</span></span> },
    {
      key: "who",
      header: "Customer",
      sort: (d) => d.name,
      className: "max-sm:w-full max-sm:max-w-0",
      cell: (d) => (
        <span className="flex min-w-0 flex-col">
          {/* One line: a long name is cut short, so every row is the same height. */}
          <span className="flex min-w-0 items-center gap-x-2">
            <Link href={`/test-drives/${d.id}`} className="min-w-0 truncate font-medium after:absolute after:inset-0">
              {d.name}
            </Link>
            {/* The Status column is left out on a phone, so the name and car keep their width; the badge sits by the name instead. */}
            <span className="shrink-0 sm:hidden">
              <DriveStatusBadge status={d.status} />
            </span>
          </span>
          {/* Taking them out is left out below 1024px, so it joins the car line. */}
          <span className="flex min-w-0 gap-1 text-meta text-text-2 lg:hidden">
            <span className="truncate md:hidden">{d.carTitle}</span>
            <span className="md:hidden">·</span>
            <span className="shrink-0">{whoHas(d, me)}</span>
          </span>
        </span>
      ),
    },
    { key: "car", header: "Car", sort: (d) => d.carTitle, cell: (d) => <span className="line-clamp-2 max-w-[16rem]">{d.carTitle}</span>, hide: "md" },
    { key: "with", header: "Taking them out", sort: (d) => d.assignedTo, cell: (d) => (d.assignedTo ? whoHas(d, me) : <span className="text-text-2">Not taken</span>), hide: "lg" },
    { key: "status", header: "Status", sort: (d) => DRIVE_STATUSES.indexOf(d.status), nowrap: true, cell: (d) => <DriveStatusBadge status={d.status} />, hide: "sm" },
  ];
  const { rows: sorted, sort } = sortRows(rows, columns, sp, { key: "when", dir: "desc" });
  const paged = pageOf(sorted, sp);
  const filters: FilterGroup[] = [
    { name: "when", label: "When", any: "Any time", options: [["ahead", "Coming up"], ["past", "Past"]] },
    { name: "status", label: "Status", any: "Any status", options: DRIVE_STATUSES.map((s) => [s, DRIVE_STATUS_LABELS[s]] as const) },
    { name: "with", label: "Taking them out", any: "Anyone", options: [["none", "Not taken"], ...team.map((t) => [t, t] as const)] },
    { name: "car", label: "Car", any: "Any car", options: [["gone", "No longer for sale"]] },
  ];
  return (
    <>
      <TableToolbar search={{ placeholder: "Search", label: "Search test drives" }} filters={filters} />
      <DataTable label="Test drives" linkRows rows={paged.rows} rowKey={(d) => d.id} columns={columns} sort={sort} empty={<EmptyState title="No bookings match" text="Try another filter or search." />} />
      <TableFooter page={paged.page} pageCount={paged.pageCount} total={paged.total} per={paged.per} />
    </>
  );
}
