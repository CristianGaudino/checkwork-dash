import Link from "next/link";
import { Suspense } from "react";
import { TileBone } from "@/components/admin/Skeleton";
import { Columns, adminButton, adminButtonQuiet, EmptyState, PageHeader, Panel, PanelLink, StatCard, StatGrid, TaskList } from "@/components/admin/kit";
import { CalendarIcon, CarIcon, CheckIcon, ShareIcon } from "@/components/stock/icons";
import { can } from "@/lib/permissions";
import { addDays, dublinDay, fmtCompact, fmtDay, fmtNum, fmtTime, plural } from "@/lib/admin/format";
import { forSale, isSold } from "@/lib/stock/types";
import { WhoseToggle, loadToDo } from "@/components/admin/ToDo";
import { VisitsTile } from "@/components/admin/VisitsTile";
import { visitSources } from "@/lib/admin/visit-sources-load";
import { activeNow } from "@/lib/site-api/presence";
import type { Lead } from "@/lib/admin/collections";

// The layout's "%s | Dealer dashboard" template reaches only the pages under it, not this one beside it.
export const metadata = { title: { absolute: "Overview | Dealer dashboard" } };

// How many rows To do shows before See all: about one screen from 640px. On a phone four (the class on the list says so).
const TOP = 8;
const PHONE = 4;
const row = "relative flex min-h-16 items-center gap-3 px-1 py-3 transition-colors has-[>a:hover]:bg-surface";

// Where the day starts: the main jobs as big buttons, then what needs doing (each with the button that does it; new leads are in it with
// Call and Reply), the next test drives, and a few numbers last. No chart (docs/dashboard-polish.md #72): Analytics has them.
// `mine`: To do's Everyone | For me. See all opens the To do page, so this page never grows under the reader.
export default async function Page({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const sp = await searchParams;
  const { o, tasks, count, late, mine, me, synced, all, leads, rules } = await loadToDo(sp.mine);
  const cars = all.filter((c) => !isSold(c));
  const today = dublinDay();
  const thisWeek = o.weeks[o.weeks.length - 1];
  // Owners and managers (the team permission) also see the website: the week's visits and who is on it now, read after the first paint.
  const boss = await can("team");

  const shown = tasks.slice(0, TOP);
  // The main jobs, in the page header (#213): the first filled. Synced stock is added on the listing site, so then there is no Add a car.
  const jobs = [
    !synced && { href: "/stock/new", icon: <CarIcon />, label: "Add a car" },
    { href: "/test-drives/new", icon: <CalendarIcon />, label: "Book a test drive" },
    { href: "/marketing/new", icon: <ShareIcon />, label: "New post" },
  ].filter((j) => j !== false);
  // A drive's day beside its time, when it is not today.
  const day = (t: number) => (dublinDay(t) === today ? null : dublinDay(t) === addDays(today, 1) ? "Tomorrow" : fmtDay(dublinDay(t), "weekday"));
  return (
    <>
      <PageHeader
        title="Overview"
        text={late ? `${plural(late, "to-do")} late or due today` : "Nothing late"}
        actions={jobs.length > 0 && jobs.map((j, i) => (
          <Link key={j.href} href={j.href} className={i === 0 ? adminButton : adminButtonQuiet}>
            <span aria-hidden="true" className="[&>svg]:size-5">{j.icon}</span>
            {j.label}
          </Link>
        ))}
      />

      <Columns
        aside={
          <>
              <StatGrid title="This week">
                {/* This week's leads: Leads has no date filter, Analytics over 7 days does. */}
                <StatCard lead href="/analytics?range=7" label="New leads" value={fmtCompact(thisWeek)} hint={`${fmtNum(o.usualWeek)} in a usual week`} tone={thisWeek > o.usualWeek ? "good" : undefined} />
                <StatCard href={mine ? "/leads?mine=1" : "/leads"} label="To answer" value={fmtCompact(o.answer.length)} hint={o.answer.length ? "Waiting on a first reply" : "All answered"} tone={o.answer.length ? "warn" : undefined} />
                <StatCard href="/stock" label="Cars for sale" value={fmtCompact(cars.filter(forSale).length)} hint={o.oldStock ? `${o.oldStock} for sale ${rules.oldStockDays} days or more` : undefined} tone={o.oldStock ? "warn" : undefined} />
                {/* Only the website's tiles wait: the two above are links in the first chunk (#109). Their bones are the grid's own tiles, so the
                    layout counts them as the tiles they stand for. */}
                {boss && (
                  <Suspense fallback={<><TileBone busy /><TileBone /></>}>
                    <WebsiteTiles leads={leads} />
                  </Suspense>
                )}
              </StatGrid>
            <Panel title="Test drives" action={<PanelLink href="/test-drives">See all</PanelLink>}>
              {o.nextDrives.length === 0 ? (
                // One line, not a tall empty block beside the busiest panel. Booking one is the tile above.
                <p className="text-body text-text-2">None booked this week</p>
              ) : (
                <ul className="-mx-1 flex flex-col divide-y divide-hairline">
                  {o.nextDrives.map((d) => {
                    const passed = d.startsAt < o.now;
                    const when = day(d.startsAt);
                    const staff = !d.assignedTo ? "Not taken" : d.assignedTo === me.name ? "You" : d.assignedTo;
                    return (
                      <li key={d.id} className={row}>
                        <span className={`flex w-16 shrink-0 flex-col ${passed ? "text-text-2" : ""}`}>
                          <span className="font-display font-semibold tabular-nums">{fmtTime(d.startsAt)}</span>
                          {when && <span className="text-meta text-text-2">{when}</span>}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={`truncate font-medium ${passed ? "text-text-2" : ""}`}>{d.name}</span>
                          <span className="truncate text-meta text-text-2">{[passed && "Passed", d.carTitle, staff].filter(Boolean).join(" · ")}</span>
                        </span>
                        {/* A plain list: the drive's own page is where it is confirmed, moved or given to someone. */}
                        <Link href={`/test-drives/${d.id}`} aria-label={`${d.name}, ${when ? `${when} ` : ""}${fmtTime(d.startsAt)}`} className="absolute inset-0" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </>
        }
      >
        <Panel title="To do" count={count || undefined} action={me.name && <WhoseToggle path="/" mine={mine} />}>
          {tasks.length === 0 ? (
            <EmptyState compact icon={<CheckIcon />} title="All done" text="Nothing is waiting on you. New leads and bookings show here as they come in." />
          ) : (
            // n+5: the rows after PHONE.
            <div className="max-sm:[&>ul>li:nth-child(n+5)]:hidden">
              <TaskList label="To do">{shown}</TaskList>
            </div>
          )}
          {tasks.length > PHONE && (
            <div className={`w-fit ${tasks.length > TOP ? "" : "sm:hidden"}`}>
              <PanelLink href={`/to-do?mine=${mine ? 1 : 0}`}>See all</PanelLink>
            </div>
          )}
        </Panel>
      </Columns>
    </>
  );
}

// The website's tiles: the site's counts are a slower read, so they stream in (#109).
async function WebsiteTiles({ leads }: { leads: Lead[] }) {
  const [visits, active] = await Promise.all([visitSources(7, leads), activeNow()]);
  return (
    <>
      {visits && <VisitsTile now={visits.now} before={visits.before} />}
      {active !== null && <StatCard href="/analytics" label="On your site" value={fmtCompact(active)} hint="Last 30 minutes" />}
    </>
  );
}
